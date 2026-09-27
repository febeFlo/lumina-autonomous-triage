// ─────────────────────────────────────────────────────────────────────────────
// Workflow stage — now represents the triage result state, not a pipeline step
// ─────────────────────────────────────────────────────────────────────────────
export type WorkflowStage =
  | "IDLE"       // repository loaded, no log yet
  | "ANALYZED"   // log parsed, incident identified, graph updated
  | "RESOLVED";  // user manually marked issue as resolved

// ─────────────────────────────────────────────────────────────────────────────
// Node status — controls Circuit Canvas border / glow colour
// ─────────────────────────────────────────────────────────────────────────────
export type NodeStatus = "UNKNOWN" | "HEALTHY" | "FAULT" | "DEPENDENCY" | "VERIFYING" | "RESOLVED";

// ─────────────────────────────────────────────────────────────────────────────
// A single node in the Circuit Canvas, derived from the ingested repository
// ─────────────────────────────────────────────────────────────────────────────
export interface RepoNode {
  /** Unique identifier – typically the relative file path */
  id: string;
  /** Display label shown inside the node (basename) */
  label: string;
  /** Full relative path within the repository */
  path: string;
  /** Current visual / triage status */
  status: NodeStatus;
  /** Canvas layout – normalised 0-1 coordinates resolved by the renderer */
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stored source file — content read from uploaded folder or fetched via API
// ─────────────────────────────────────────────────────────────────────────────
export interface SourceFile {
  /** Relative path within the repository (used as the Map key) */
  path: string;
  /** Basename, e.g. "database.py" */
  filename: string;
  /** File extension including dot, e.g. ".py" */
  extension: string;
  /** Full raw source text */
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A directed import edge between two files
// ─────────────────────────────────────────────────────────────────────────────
export interface ImportEdge {
  /** The file that contains the import statement */
  fromPath: string;
  /** The file being imported (resolved to a repo path) */
  toPath: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsed incident extracted by the stack-trace engine
// ─────────────────────────────────────────────────────────────────────────────
export interface ParsedIncident {
  /** Exception / error class name, e.g. "KeyError", "NullPointer" */
  errorType: string;
  /** Filename identified as the fault origin (last frame) */
  faultFile: string;
  /** Line number within faultFile */
  lineNumber: number;
  /** Relative paths of upstream caller files (dependency nodes) */
  dependencyFiles: string[];
  /** Language detected: "python" | "nodejs" | "generic" */
  language: "python" | "nodejs" | "generic";
}

// ─────────────────────────────────────────────────────────────────────────────
// Fault classification — derived from inspecting actual source code, not the
// exception name.
// ─────────────────────────────────────────────────────────────────────────────
export type FaultClassification =
  | "NULL_REFERENCE"     // dereference of a potentially-null/undefined value
  | "ARRAY_ACCESS"       // index into a list/array/slice without bounds check
  | "MAP_LOOKUP"         // key access on a dict/map without existence check
  | "THROWN_EXCEPTION"   // explicit throw/raise of a business exception
  | "API_FAILURE"        // outgoing HTTP / RPC / SDK call
  | "NETWORK_CALL"       // socket / fetch / http.get pattern
  | "DATABASE_CALL"      // ORM query / raw SQL / cursor execute
  | "VALIDATION_CHECK"   // assertion / validation / schema check
  | "UNKNOWN";           // could not determine from source context

// ─────────────────────────────────────────────────────────────────────────────
// Output of the diff generator – a Git-style unified diff hunk
// ─────────────────────────────────────────────────────────────────────────────
export interface DiffResult {
  /** File the patch is applied to */
  filePath: string;
  /** Exception / error class name from the stack trace */
  errorType: string;
  /** Line number where the fault was detected */
  lineNumber: number;
  /**
   * Unified diff string ready for monospace rendering.
   * Lines prefixed with "-" are removals (red), "+" are additions (green).
   * Empty string when source context was unavailable.
   */
  diff: string;
  /** Human-readable one-line description of the fix */
  summary: string;
  /** Classification derived from source code inspection */
  rootCauseType: FaultClassification;
  /** One-sentence explanation of why this classification was chosen */
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured incident report shown in the Analysis Report panel
// ─────────────────────────────────────────────────────────────────────────────
export interface IncidentReport {
  errorType: string;
  faultFile: string;
  lineNumber: number;
  /** ±5 lines of actual source code surrounding the failing line */
  faultCode: string;
  dependencyFiles: string[];
  /** Human-readable description of the suggested fix */
  patchSummary: string;
  /** HIGH | MEDIUM | LOW confidence label */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** 0–100 numeric score used to derive the label */
  confidenceScore: number;
  language: "python" | "nodejs" | "generic";
  /** Classification derived from source code inspection */
  rootCauseType: FaultClassification;
  /** One-sentence explanation of the root cause determination */
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level reducer state
// ─────────────────────────────────────────────────────────────────────────────
export interface LuminaState {
  stage: WorkflowStage;
  /** Nodes currently rendered on the Circuit Canvas */
  nodes: RepoNode[];
  /** Raw GitHub URL or folder name supplied by the user */
  repositorySource: string | null;
  /** Raw log text ingested by the user */
  rawLog: string | null;
  /** Parsed incident — set immediately after log parsing */
  incident: ParsedIncident | null;
  /** ID of the node identified as the fault origin */
  faultNodeId: string | null;
  /** Source files read from the repository (path → SourceFile) */
  sourceFiles: Record<string, SourceFile>;
  /** Import edges derived from actual source code */
  importEdges: ImportEdge[];
  /** Structured incident analysis report */
  incidentReport: IncidentReport | null;
  /** Active diff result shown in the Git Diff Inspector */
  activeDiff: DiffResult | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union of all reducer actions
// ─────────────────────────────────────────────────────────────────────────────
export type ReducerAction =
  | { type: "SET_REPOSITORY"; payload: { source: string; nodes: RepoNode[] } }
  | { type: "SET_SOURCE_FILES"; payload: { sourceFiles: Record<string, SourceFile>; importEdges: ImportEdge[] } }
  | { type: "SET_LOG"; payload: { rawLog: string } }
  | { type: "SET_FAULT"; payload: { incident: ParsedIncident; faultNodeId: string } }
  | { type: "SET_INCIDENT_REPORT"; payload: IncidentReport }
  | { type: "SET_DIFF"; payload: DiffResult }
  | { type: "MARK_RESOLVED" }
  | { type: "RESET" }
  | { type: 'MARK_REMAINING_HEALTHY' };
