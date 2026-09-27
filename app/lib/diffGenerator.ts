import type { DiffResult, FaultClassification, SourceFile } from "@/app/types/types";

// ─────────────────────────────────────────────────────────────────────────────
// Source-code classification patterns
//
// Each rule tests the raw text of the FAULT LINE (and optionally the
// surrounding context window) to decide what kind of operation is failing.
// Rules are tested in order; the first match wins.
// ─────────────────────────────────────────────────────────────────────────────

interface ClassificationRule {
  type: FaultClassification;
  /** Test against the trimmed fault line */
  test: (faultLine: string, context: string) => boolean;
  /** Generate an explanation sentence given the fault line */
  reason: (faultLine: string) => string;
}

const RULES: ClassificationRule[] = [
  // ── MAP / DICT lookup ──────────────────────────────────────────────────────
  // Matches: db[key], cache[id], obj["field"], map[k]
  {
    type: "MAP_LOOKUP",
    test: (line) =>
      /\b\w+\s*\[\s*\w+\s*\]/.test(line) &&
      !/^\s*(if|while|for)\b/.test(line) &&
      !/\[\d+\]/.test(line),           // exclude pure integer index
    reason: (line) =>
      `Line "${line.trim()}" performs a direct key lookup on a dict/map with no existence check — raises KeyError / NoSuchElementException when the key is absent.`,
  },

  // ── ARRAY / SLICE / LIST access ────────────────────────────────────────────
  // Matches: items[index], arr[i], list[n], slice[0]
  {
    type: "ARRAY_ACCESS",
    test: (line) =>
      /\b\w+\s*\[\s*(?:\w+|\d+)\s*\]/.test(line) &&
      /\[\s*(?:[a-zA-Z_]\w*|\d+)\s*\]/.test(line),
    reason: (line) =>
      `Line "${line.trim()}" accesses a sequence by index without a bounds check — raises IndexError / ArrayIndexOutOfBoundsException when the index exceeds the length.`,
  },

  // ── NULL / NONE / nil dereference ─────────────────────────────────────────
  // Matches: obj.field, obj.method(), user.profile.name, node?.value (unsafe chain)
  {
    type: "NULL_REFERENCE",
    test: (line) =>
      /\b\w+(?:\.\w+){1,}/.test(line) &&
      !/^\s*(import|from|class|def|function|const|let|var|type|interface)\b/.test(line),
    reason: (line) =>
      `Line "${line.trim()}" chains property/method access on a value that may be null or undefined — raises NullPointerException / AttributeError when the intermediate reference is None.`,
  },

  // ── Explicit THROW / RAISE ─────────────────────────────────────────────────
  {
    type: "THROWN_EXCEPTION",
    test: (line) =>
      /\b(?:throw|raise)\s+\w+/.test(line),
    reason: (line) =>
      `Line "${line.trim()}" explicitly throws/raises an exception — this is a deliberate business-logic fault that needs a handling or recovery path at the call site.`,
  },

  // ── HTTP / REST / SDK API call ─────────────────────────────────────────────
  {
    type: "API_FAILURE",
    test: (line) =>
      /\b(?:requests\.|axios\.|fetch\(|http\.(?:get|post|put|delete|request)|apiClient\.|client\.(?:get|post|send|call)|grpc\.)/.test(
        line
      ),
    reason: (line) =>
      `Line "${line.trim()}" makes an outgoing API / HTTP call with no visible error handling — a network or server error will propagate as an unhandled exception.`,
  },

  // ── Raw network socket / WebSocket ────────────────────────────────────────
  {
    type: "NETWORK_CALL",
    test: (line) =>
      /\b(?:socket\.|connect\(|recv\(|send\(|websocket\.|urllib\.)/.test(line),
    reason: (line) =>
      `Line "${line.trim()}" operates on a raw network connection that can fail with a connection error, timeout, or broken-pipe exception.`,
  },

  // ── Database / ORM query ──────────────────────────────────────────────────
  {
    type: "DATABASE_CALL",
    test: (line) =>
      /\b(?:\.query\(|\.execute\(|\.find\(|\.findOne\(|\.fetch\(|\.get_or_create\(|cursor\.|session\.|db\.(?!get\()|\bsql\b)/.test(
        line
      ),
    reason: (line) =>
      `Line "${line.trim()}" executes a database query with no visible error handling — a connection failure, timeout, or constraint violation will propagate unhandled.`,
  },

  // ── Assertion / validation ────────────────────────────────────────────────
  {
    type: "VALIDATION_CHECK",
    test: (line) =>
      /\b(?:assert\s|assertTrue|assertEqual|expect\(|validate\(|schema\.parse\(|zod\.|yup\.)/.test(
        line
      ),
    reason: (line) =>
      `Line "${line.trim()}" is an assertion or validation that failed — the input data did not meet the expected contract.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Classify a fault line
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  type: FaultClassification;
  reasoning: string;
}

/**
 * Inspect the actual fault line (and the surrounding ±5 line context window)
 * to determine what kind of operation is failing.
 *
 * @param faultLine   The single source line at `lineNumber` (trimmed or raw).
 * @param context     The ±5 line window as a multi-line string (used by some rules).
 */
export function classifyFault(
  faultLine: string,
  context: string
): ClassificationResult {
  for (const rule of RULES) {
    if (rule.test(faultLine, context)) {
      return { type: rule.type, reasoning: rule.reason(faultLine) };
    }
  }
  return {
    type: "UNKNOWN",
    reasoning: `Could not determine the fault class from the source line "${faultLine.trim()}". Manual inspection required.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch generators — one per FaultClassification
//
// Each generator receives:
//   faultLine   — the raw source line at the failing location (with indentation)
//   filePath    — the repo-relative file path
//   lineNumber  — 1-based line number of the fault
//   language    — detected source language
//
// Returns { summary, diff } where diff is a proper unified-diff string built
// from the ACTUAL fault line, not a hardcoded template string.
// ─────────────────────────────────────────────────────────────────────────────

interface PatchOutput {
  summary: string;
  removedLine: string;
  addedLine: string;
}

/** Detect leading whitespace to preserve indentation in the patch */
function indent(line: string): string {
  return line.match(/^(\s*)/)?.[1] ?? "";
}

function patchMapLookup(faultLine: string, lang: string): PatchOutput {
  // Extract: dict_name[key_expr] from the fault line
  const m = faultLine.match(/(\w+)\[(\w+)\]/);
  const dictName = m?.[1] ?? "obj";
  const keyExpr = m?.[2] ?? "key";
  const ind = indent(faultLine);

  const removed = faultLine.trimEnd();

  let added: string;
  if (lang === "python") {
    // Replace foo[key] with foo.get(key) — preserve surrounding expression
    added = faultLine.trimEnd().replace(
      /(\w+)\[(\w+)\]/,
      `${dictName}.get(${keyExpr})`
    );
    return {
      summary: `Replace direct dict key access \`${dictName}[${keyExpr}]\` with \`.get(${keyExpr})\` to handle missing keys gracefully`,
      removedLine: removed,
      addedLine: added,
    };
  }

  // JS / TS / Go / Java — use optional chaining or explicit guard
  added = `${ind}const _val = ${dictName}.get ? ${dictName}.get(${keyExpr}) : ${dictName}[${keyExpr}];\n${ind}if (_val === undefined) throw new Error(\`Key not found: \${${keyExpr}}\`);`;
  return {
    summary: `Guard map lookup \`${dictName}[${keyExpr}]\` with existence check before access`,
    removedLine: removed,
    addedLine: added,
  };
}

function patchArrayAccess(faultLine: string, lang: string): PatchOutput {
  const m = faultLine.match(/(\w+)\[(\w+|\d+)\]/);
  const arrName = m?.[1] ?? "arr";
  const idxExpr = m?.[2] ?? "index";
  const ind = indent(faultLine);

  const removed = faultLine.trimEnd();
  let added: string;

  if (lang === "python") {
    added = faultLine.trimEnd().replace(
      /(\w+)\[(\w+|\d+)\]/,
      `${arrName}[${idxExpr}] if 0 <= ${idxExpr} < len(${arrName}) else None`
    );
    return {
      summary: `Add inline bounds check before \`${arrName}[${idxExpr}]\` to prevent IndexError`,
      removedLine: removed,
      addedLine: added,
    };
  }

  // JS / TS / Go / Java
  added = `${ind}${arrName}[${idxExpr} < ${arrName}.length ? ${idxExpr} : ${arrName}.length - 1]`;
  return {
    summary: `Guard array access \`${arrName}[${idxExpr}]\` with explicit bounds check to prevent out-of-range error`,
    removedLine: removed,
    addedLine: added,
  };
}

function patchNullReference(faultLine: string, lang: string): PatchOutput {
  const removed = faultLine.trimEnd();
  const ind = indent(faultLine);

  // Extract the root object from the first chained access: foo.bar.baz → foo
  const m = faultLine.match(/\b(\w+)(?:\.\w+)+/);
  const rootObj = m?.[1] ?? "obj";

  let added: string;
  if (lang === "python") {
    // Wrap in null guard
    added = `${ind}${rootObj} and ${faultLine.trim()}`;
    return {
      summary: `Add short-circuit null guard for \`${rootObj}\` before chained property access`,
      removedLine: removed,
      addedLine: added,
    };
  }

  // JS / TS — convert .foo to ?.foo
  added = faultLine.trimEnd().replace(/(\w)\.(\w)/g, "$1?.$2");
  return {
    summary: `Use optional chaining (\`?.\`) on all property accesses in the chain to prevent null/undefined dereference`,
    removedLine: removed,
    addedLine: added,
  };
}

function patchThrownException(faultLine: string): PatchOutput {
  const removed = faultLine.trimEnd();
  const ind = indent(faultLine);
  return {
    summary: `Wrap the throw site with a try/catch at the call site and add a recovery path instead of propagating the exception unchecked`,
    removedLine: removed,
    addedLine: `${ind}try:\n${ind}    ${faultLine.trim()}\n${ind}except Exception as e:\n${ind}    # TODO: add recovery path or re-raise with context\n${ind}    raise`,
  };
}

function patchApiFailure(faultLine: string): PatchOutput {
  const removed = faultLine.trimEnd();
  const ind = indent(faultLine);
  return {
    summary: `Wrap the API call in error handling and add a retry/fallback path to prevent unhandled network exceptions`,
    removedLine: removed,
    addedLine: `${ind}try:\n${ind}    ${faultLine.trim()}\n${ind}except (ConnectionError, TimeoutError) as e:\n${ind}    # TODO: implement retry with backoff or return a fallback response\n${ind}    raise`,
  };
}

function patchNetworkCall(faultLine: string): PatchOutput {
  const removed = faultLine.trimEnd();
  const ind = indent(faultLine);
  return {
    summary: `Add connection-error and timeout handling around the network call`,
    removedLine: removed,
    addedLine: `${ind}try:\n${ind}    ${faultLine.trim()}\n${ind}except OSError as e:\n${ind}    # TODO: handle broken connection / timeout\n${ind}    raise`,
  };
}

function patchDatabaseCall(faultLine: string): PatchOutput {
  const removed = faultLine.trimEnd();
  const ind = indent(faultLine);
  return {
    summary: `Wrap the database query in error handling; log and surface database errors explicitly`,
    removedLine: removed,
    addedLine: `${ind}try:\n${ind}    ${faultLine.trim()}\n${ind}except Exception as db_err:\n${ind}    # TODO: log db_err, return safe default or re-raise\n${ind}    raise`,
  };
}

function patchValidationCheck(faultLine: string): PatchOutput {
  const removed = faultLine.trimEnd();
  const ind = indent(faultLine);
  return {
    summary: `Replace hard assertion with a conditional check and a descriptive error message`,
    removedLine: removed,
    addedLine: `${ind}if not (${faultLine.trim().replace(/^assert\s+/, "")}):\n${ind}    raise ValueError("Validation failed: unexpected input data")`,
  };
}

function patchUnknown(faultLine: string): PatchOutput {
  return {
    summary: `Review the fault line and add appropriate defensive guards — source pattern could not be auto-classified`,
    removedLine: faultLine.trimEnd(),
    addedLine: `${indent(faultLine)}# TODO: add defensive guard around the operation below\n${faultLine.trimEnd()}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified diff builder
// ─────────────────────────────────────────────────────────────────────────────

function buildUnifiedDiff(
  filePath: string,
  lineNumber: number,
  patch: PatchOutput
): string {
  const removed = patch.removedLine;
  const added   = patch.addedLine;

  // Count actual lines in the added block (may be multi-line for wrapping patches)
  const addedLineCount = added.split("\n").length;
  const header = `@@ -${lineNumber},1 +${lineNumber},${addedLineCount} @@`;

  const lines: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    header,
    `-${removed}`,
    ...added.split("\n").map((l) => `+${l}`),
  ];

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API – generateDiff
//
// @param filePath     Relative path to the file where the fault was detected
// @param lineNumber   1-based line number of the fault
// @param sourceFile   SourceFile object (content may be empty for GitHub repos)
// @param language     Detected source language
//
// @returns DiffResult with classification, reasoning, and a source-derived diff
// ─────────────────────────────────────────────────────────────────────────────
export function generateDiff(
  filePath: string,
  lineNumber: number,
  sourceFile: SourceFile | null,
  language: "python" | "nodejs" | "generic"
): DiffResult {
  const errorType = ""; // errorType is no longer used for classification

  // ── Extract the fault line from actual source content ─────────────────────
  let faultLine = "";
  let context = "";

  if (sourceFile?.content) {
    const allLines = sourceFile.content.split("\n");
    const zeroIdx = lineNumber - 1;
    faultLine = allLines[zeroIdx] ?? "";
    const start = Math.max(0, zeroIdx - 5);
    const end   = Math.min(allLines.length - 1, zeroIdx + 5);
    context = allLines.slice(start, end + 1).join("\n");
  }

  // ── Classify from code ────────────────────────────────────────────────────
  const classification = faultLine.trim()
    ? classifyFault(faultLine, context)
    : { type: "UNKNOWN" as FaultClassification, reasoning: "Source content was not available — fault could not be inspected." };

  // ── Generate the patch from the actual fault line ─────────────────────────
  let patch: PatchOutput;

  if (!faultLine.trim()) {
    // No source content — produce a minimal informational diff
    patch = {
      summary: "Source content unavailable — patch could not be generated from code context",
      removedLine: `# ${filePath}:${lineNumber} — source not available`,
      addedLine:   `# ${filePath}:${lineNumber} — inspect manually and apply defensive guard`,
    };
  } else {
    switch (classification.type) {
      case "MAP_LOOKUP":
        patch = patchMapLookup(faultLine, language);
        break;
      case "ARRAY_ACCESS":
        patch = patchArrayAccess(faultLine, language);
        break;
      case "NULL_REFERENCE":
        patch = patchNullReference(faultLine, language);
        break;
      case "THROWN_EXCEPTION":
        patch = patchThrownException(faultLine);
        break;
      case "API_FAILURE":
        patch = patchApiFailure(faultLine);
        break;
      case "NETWORK_CALL":
        patch = patchNetworkCall(faultLine);
        break;
      case "DATABASE_CALL":
        patch = patchDatabaseCall(faultLine);
        break;
      case "VALIDATION_CHECK":
        patch = patchValidationCheck(faultLine);
        break;
      default:
        patch = patchUnknown(faultLine);
        break;
    }
  }

  const diff = faultLine.trim()
    ? buildUnifiedDiff(filePath, lineNumber, patch)
    : `--- a/${filePath}\n+++ b/${filePath}\n@@ -${lineNumber},0 +${lineNumber},1 @@\n+# source unavailable`;

  return {
    filePath,
    errorType,
    lineNumber,
    diff,
    summary:       patch.summary,
    rootCauseType: classification.type,
    reasoning:     classification.reasoning,
  };
}

