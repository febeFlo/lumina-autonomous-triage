import type { ParsedIncident } from "@/app/types/types";

// ─────────────────────────────────────────────────────────────────────────────
// Regex patterns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Python traceback frame.
 * Matches:   File "database.py", line 52, in some_function
 * Groups:    [1] filename  [2] line number  [3] function name (optional)
 */
const PYTHON_FRAME_RE = /File "([^"]+)", line (\d+)(?:, in (\w+))?/g;

/**
 * Node.js / TypeScript stack frame.
 * Matches:   at Object.handler (database.js:43:22)
 *            at database.js:43:22
 * Groups:    [1] symbol name (optional)  [2] filename  [3] line  [4] column
 */
const NODEJS_FRAME_RE =
  /at (?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/g;

/**
 * Common Python exception names at the start of a traceback header line.
 * e.g. "KeyError: 'user_id'" or "AttributeError: 'NoneType'..."
 */
const PYTHON_ERROR_TYPE_RE =
  /\b(KeyError|AttributeError|TypeError|ValueError|IndexError|NameError|RuntimeError|ImportError|OSError|IOError)\s*:/;

/**
 * Node.js / generic error type (class name before colon).
 * e.g. "NullPointerException: Cannot read property..."
 *       "TypeError: Cannot read properties of undefined"
 */
const GENERIC_ERROR_TYPE_RE =
  /\b(NullPointer(?:Exception)?|TypeError|ReferenceError|RangeError|SyntaxError|IndexOutOfBounds(?:Exception)?|IllegalArgument(?:Exception)?)\s*[:\s]/;

// ─────────────────────────────────────────────────────────────────────────────
// Internal frame representation
// ─────────────────────────────────────────────────────────────────────────────
interface StackFrame {
  file: string;
  line: number;
  symbol?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the basename from a path so we can compare against node labels */
function basename(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

/**
 * Given an array of frames and the set of known repository filenames, return
 * only frames whose file matches something in the repository.  This prevents
 * noise from stdlib / node_modules paths.
 */
function filterToRepoFiles(
  frames: StackFrame[],
  repoFilenames: string[]
): StackFrame[] {
  if (repoFilenames.length === 0) return frames; // no filter when tree unknown
  return frames.filter((f) =>
    repoFilenames.some(
      (rf) => rf === f.file || rf === basename(f.file) || f.file.includes(rf)
    )
  );
}

/** Deduplicate file paths while preserving order */
function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Language-specific parsers
// ─────────────────────────────────────────────────────────────────────────────

function parsePythonFrames(log: string): StackFrame[] {
  const frames: StackFrame[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex before use (regex is module-level with /g flag)
  PYTHON_FRAME_RE.lastIndex = 0;
  while ((match = PYTHON_FRAME_RE.exec(log)) !== null) {
    frames.push({
      file: basename(match[1]),
      line: parseInt(match[2], 10),
      symbol: match[3],
    });
  }
  return frames;
}

function parseNodejsFrames(log: string): StackFrame[] {
  const frames: StackFrame[] = [];
  let match: RegExpExecArray | null;
  NODEJS_FRAME_RE.lastIndex = 0;
  while ((match = NODEJS_FRAME_RE.exec(log)) !== null) {
    const file = match[2];
    // Skip internal Node.js entries (node: prefix, node_modules, etc.)
    if (!file || file.startsWith("node:") || file.includes("node_modules")) {
      continue;
    }
    frames.push({
      file: basename(file),
      line: parseInt(match[3], 10),
      symbol: match[1] ?? undefined,
    });
  }
  return frames;
}

/**
 * Generic fallback: scan the raw log for any repository filename strings that
 * appear adjacent to a line number hint (":NN" or "line NN").
 */
function parseGenericFrames(
  log: string,
  repoFilenames: string[]
): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const filename of repoFilenames) {
    // Match "filename:42" or "filename line 42"
    const pattern = new RegExp(
      `${filename.replace(".", "\\.")}[:\\s]+(?:line\\s+)?(\\d+)`,
      "gi"
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(log)) !== null) {
      frames.push({ file: filename, line: parseInt(match[1], 10) });
    }
  }
  return frames;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map raw exception names to the canonical set used by the diff generator
 * so the diff generator switch always gets a clean token.
 */
const ERROR_TYPE_CANONICAL: Record<string, string> = {
  keyerror: "KeyError",
  attributeerror: "AttributeError",
  typeerror: "TypeError",
  nullpointer: "NullPointer",
  nullpointerexception: "NullPointer",
  indexerror: "IndexOutOfBounds",
  indexoutofbounds: "IndexOutOfBounds",
  indexoutofboundsexception: "IndexOutOfBounds",
  rangeerror: "IndexOutOfBounds",
  referenceerror: "NullPointer",
  valueerror: "TypeError",
};

function extractErrorType(log: string): string {
  const pythonMatch = PYTHON_ERROR_TYPE_RE.exec(log);
  if (pythonMatch) {
    const raw = pythonMatch[1].toLowerCase();
    return ERROR_TYPE_CANONICAL[raw] ?? pythonMatch[1];
  }

  const genericMatch = GENERIC_ERROR_TYPE_RE.exec(log);
  if (genericMatch) {
    const raw = genericMatch[1].toLowerCase();
    return ERROR_TYPE_CANONICAL[raw] ?? genericMatch[1];
  }

  return "UnknownError";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API – parseStackTrace
//
// @param rawLog        Raw log / stack trace text pasted or dropped by the user
// @param repoFilenames Flat list of filenames present in the ingested repo tree
//                      (basenames only, e.g. ["main.py", "routes.py"]).
//                      Pass [] when no repo has been ingested.
//
// @returns ParsedIncident or null when nothing useful could be extracted.
// ─────────────────────────────────────────────────────────────────────────────
export function parseStackTrace(
  rawLog: string,
  repoFilenames: string[] = []
): ParsedIncident | null {
  if (!rawLog || !rawLog.trim()) return null;

  const errorType = extractErrorType(rawLog);

  // ── Try Python first ──────────────────────────────────────────────────
  let frames = parsePythonFrames(rawLog);
  if (frames.length > 0) {
    const repoFrames = filterToRepoFiles(frames, repoFilenames);
    const relevant = repoFrames.length > 0 ? repoFrames : frames;
    // The fault origin is the LAST frame (innermost call at the point of throw)
    const fault = relevant[relevant.length - 1];
    const dependencyFiles = unique(
      relevant
        .slice(0, -1)
        .map((f) => f.file)
        .filter((f) => f !== fault.file)
    );

    return {
      errorType,
      faultFile: fault.file,
      lineNumber: fault.line,
      dependencyFiles,
      language: "python",
    };
  }

  // ── Try Node.js / TypeScript ──────────────────────────────────────────
  frames = parseNodejsFrames(rawLog);
  if (frames.length > 0) {
    const repoFrames = filterToRepoFiles(frames, repoFilenames);
    const relevant = repoFrames.length > 0 ? repoFrames : frames;
    const fault = relevant[0]; // Node.js: first frame is the innermost caller
    const dependencyFiles = unique(
      relevant
        .slice(1)
        .map((f) => f.file)
        .filter((f) => f !== fault.file)
    );

    return {
      errorType,
      faultFile: fault.file,
      lineNumber: fault.line,
      dependencyFiles,
      language: "nodejs",
    };
  }

  // ── Generic fallback ──────────────────────────────────────────────────
  if (repoFilenames.length > 0) {
    frames = parseGenericFrames(rawLog, repoFilenames);
    if (frames.length > 0) {
      const fault = frames[frames.length - 1];
      const dependencyFiles = unique(
        frames
          .slice(0, -1)
          .map((f) => f.file)
          .filter((f) => f !== fault.file)
      );

      return {
        errorType,
        faultFile: fault.file,
        lineNumber: fault.line,
        dependencyFiles,
        language: "generic",
      };
    }
  }

  return null;
}
