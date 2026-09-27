import type {
  SourceFile,
  ImportEdge,
  ParsedIncident,
  IncidentReport,
  FaultClassification,
} from "@/app/types/types";
import { generateDiff, classifyFault } from "@/app/lib/diffGenerator";

// ─────────────────────────────────────────────────────────────────────────────
// Import-statement regexes per language
// ─────────────────────────────────────────────────────────────────────────────

/** Python: `import foo`, `from foo import bar`, `from .foo import bar` */
const PY_IMPORT_RE =
  /^\s*(?:from\s+([\w./]+)\s+import|import\s+([\w./]+))/gm;

/** JS / TS: `import ... from 'foo'`, `require('foo')` */
const JS_IMPORT_RE =
  /(?:import\s[^'"]+from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;

/** Go: single-line `import "foo/bar"` or multi-line block entries */
const GO_IMPORT_RE = /import\s+"([^"]+)"|"([^"]+)"\s*\/\//g;

/** Java: `import foo.bar.Baz;` */
const JAVA_IMPORT_RE = /^import\s+([\w.]+);/gm;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function basename(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

function stem(filePath: string): string {
  const base = basename(filePath);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function resolveModule(
  moduleId: string,
  sourceFiles: Record<string, SourceFile>
): string | null {
  const normalised = moduleId.replace(/^\.\//, "").replace(/^\.\.\//, "");
  const paths = Object.keys(sourceFiles);

  if (paths.includes(normalised)) return normalised;

  const modStem = normalised.split("/").pop() ?? normalised;
  const stemMatch = paths.find((p) => stem(p) === modStem);
  if (stemMatch) return stemMatch;

  const baseMatch = paths.find(
    (p) => stem(p).toLowerCase() === modStem.toLowerCase()
  );
  if (baseMatch) return baseMatch;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: analyzeImports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk every source file and resolve its import statements to repo paths,
 * producing a directed edge list: fromPath → toPath.
 */
export function analyzeImports(
  sourceFiles: Record<string, SourceFile>
): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const seen = new Set<string>();

  for (const [fromPath, sf] of Object.entries(sourceFiles)) {
    if (!sf.content) continue;

    const rawModules: string[] = [];
    let m: RegExpExecArray | null;
    const ext = sf.extension;

    if (ext === ".py") {
      PY_IMPORT_RE.lastIndex = 0;
      while ((m = PY_IMPORT_RE.exec(sf.content)) !== null) {
        const mod = (m[1] ?? m[2] ?? "").trim();
        if (mod) rawModules.push(mod);
      }
    } else if (
      ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx"
    ) {
      JS_IMPORT_RE.lastIndex = 0;
      while ((m = JS_IMPORT_RE.exec(sf.content)) !== null) {
        rawModules.push(m[1].trim());
      }
    } else if (ext === ".go") {
      GO_IMPORT_RE.lastIndex = 0;
      while ((m = GO_IMPORT_RE.exec(sf.content)) !== null) {
        rawModules.push((m[1] ?? m[2] ?? "").trim());
      }
    } else if (ext === ".java") {
      JAVA_IMPORT_RE.lastIndex = 0;
      while ((m = JAVA_IMPORT_RE.exec(sf.content)) !== null) {
        rawModules.push(m[1].trim());
      }
    }

    for (const mod of rawModules) {
      const toPath = resolveModule(mod, sourceFiles);
      if (!toPath || toPath === fromPath) continue;
      const edgeKey = `${fromPath}→${toPath}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      edges.push({ fromPath, toPath });
    }
  }

  return edges;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: extractFaultCode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return ±`context` lines of source centred on `lineNumber` (1-based).
 * Returns an empty string when the file has no content.
 */
export function extractFaultCode(
  sf: SourceFile,
  lineNumber: number,
  context = 5
): string {
  if (!sf.content) return "";
  const lines = sf.content.split("\n");
  const start = Math.max(0, lineNumber - 1 - context);
  const end = Math.min(lines.length - 1, lineNumber - 1 + context);
  return lines.slice(start, end + 1).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence scoring
// ─────────────────────────────────────────────────────────────────────────────

interface ConfidenceResult {
  score: number;
  label: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Compute a 0-100 numeric score and a label based on how well the analysis
 * could be grounded in real source data.
 *
 * Score breakdown:
 *   +40  exact fault file found in source map AND content available
 *   +20  fault line is non-empty
 *   +20  classification is not UNKNOWN
 *   +10  fault file was matched (content available, line out of range)
 *   +10  dependency files were identified
 *   -10  GitHub repo (no content, structural match only)
 */
function scoreConfidence(
  faultLinePresent: boolean,
  fileFound: boolean,
  contentAvailable: boolean,
  classification: FaultClassification,
  hasDependencies: boolean
): ConfidenceResult {
  let score = 0;

  if (fileFound && contentAvailable) score += 40;
  else if (fileFound) score += 20;

  if (faultLinePresent) score += 20;
  if (classification !== "UNKNOWN") score += 20;
  if (hasDependencies) score += 10;
  if (fileFound && !contentAvailable) score += 5; // partial credit — path matched

  score = Math.min(100, score);

  const label: "HIGH" | "MEDIUM" | "LOW" =
    score >= 75 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW";

  return { score, label };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: buildIncidentReport
//
// Combines a ParsedIncident + source file map into a fully structured
// IncidentReport.  Diff generation and fault classification are handled
// internally — no DiffResult parameter required.
// ─────────────────────────────────────────────────────────────────────────────

export function buildIncidentReport(
  incident: ParsedIncident,
  sourceFiles: Record<string, SourceFile>
): IncidentReport {
  // ── Locate the fault source file ──────────────────────────────────────────
  const sfEntry = Object.entries(sourceFiles).find(
    ([path, sf]) =>
      sf.filename === incident.faultFile ||
      path.includes(incident.faultFile) ||
      basename(path) === incident.faultFile
  );

  const sf = sfEntry ? sfEntry[1] : null;

  // ── Extract source context ────────────────────────────────────────────────
  const faultCode = sf ? extractFaultCode(sf, incident.lineNumber) : "";

  // ── Classify from the actual fault line ───────────────────────────────────
  let rootCauseType: FaultClassification = "UNKNOWN";
  let reasoning =
    "Source content was not available — fault could not be inspected.";

  if (sf?.content) {
    const allLines = sf.content.split("\n");
    const faultLine = allLines[incident.lineNumber - 1] ?? "";

    if (faultLine.trim()) {
      // Build ±5 context for rules that need it
      const ctxStart = Math.max(0, incident.lineNumber - 1 - 5);
      const ctxEnd   = Math.min(allLines.length - 1, incident.lineNumber - 1 + 5);
      const contextWindow = allLines.slice(ctxStart, ctxEnd + 1).join("\n");

      const result = classifyFault(faultLine, contextWindow);
      rootCauseType = result.type;
      reasoning     = result.reasoning;
    } else {
      reasoning = `File "${incident.faultFile}" was found in the source map but line ${incident.lineNumber} is empty or out of range.`;
    }
  } else if (sf && !sf.content) {
    reasoning = `File "${incident.faultFile}" was matched by path but its content was not available (GitHub repo without per-file fetch).`;
  }

  // ── Generate source-context-aware diff ───────────────────────────────────
  const diff = generateDiff(
    incident.faultFile,
    incident.lineNumber,
    sf ?? null,
    incident.language
  );

  // ── Compute confidence ────────────────────────────────────────────────────
  const faultLinePresent = !!(sf?.content && (sf.content.split("\n")[incident.lineNumber - 1] ?? "").trim());
  const { score, label } = scoreConfidence(
    faultLinePresent,
    !!sf,
    !!(sf?.content),
    rootCauseType,
    incident.dependencyFiles.length > 0
  );

  return {
    errorType:       incident.errorType,
    faultFile:       incident.faultFile,
    lineNumber:      incident.lineNumber,
    faultCode,
    dependencyFiles: incident.dependencyFiles,
    patchSummary:    diff.summary,
    confidence:      label,
    confidenceScore: score,
    language:        incident.language,
    rootCauseType,
    reasoning,
  };
}
