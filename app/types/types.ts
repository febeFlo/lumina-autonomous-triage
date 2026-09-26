// ─────────────────────────────────────────────────────────────────────────────
// Workflow stage – drives the state machine in useReducer
// ─────────────────────────────────────────────────────────────────────────────
export type WorkflowStage =
  | "IDLE"
  | "ANALYZING"
  | "SUBAGENTS_ACTIVE"
  | "VERIFYING"
  | "RESOLVED";

// ─────────────────────────────────────────────────────────────────────────────
// Node status – controls Circuit Canvas border / glow colour
// ─────────────────────────────────────────────────────────────────────────────
export type NodeStatus = "HEALTHY" | "FAULT" | "DEPENDENCY" | "VERIFYING" | "RESOLVED";

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
// A single line appended to the Live Telemetry Terminal
// ─────────────────────────────────────────────────────────────────────────────
export interface TelemetryEntry {
  id: string;
  /** Full message text (streamed character-by-character by the typing hook) */
  text: string;
  /** ISO timestamp string */
  timestamp: string;
  /** Optional severity tag for colour-coding in the terminal UI */
  level?: "info" | "warn" | "error" | "success";
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
// Output of the diff generator – a Git-style unified diff hunk
// ─────────────────────────────────────────────────────────────────────────────
export interface DiffResult {
  /** File the patch is applied to */
  filePath: string;
  /** Error type that triggered this patch */
  errorType: string;
  /** Line number where the fault was detected */
  lineNumber: number;
  /**
   * Unified diff string ready for monospace rendering.
   * Lines prefixed with "-" are removals (red), "+" are additions (green).
   */
  diff: string;
  /** Human-readable one-line description of the fix */
  summary: string;
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
  /** Parsed incident – null until ANALYZING completes */
  incident: ParsedIncident | null;
  /** ID of the node identified as the fault origin */
  faultNodeId: string | null;
  /** Telemetry lines visible in the terminal panel */
  telemetryLogs: TelemetryEntry[];
  /** Active diff result shown in the Git Diff Inspector */
  activeDiff: DiffResult | null;
  /** True while the typing animation is running */
  isTyping: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union of all reducer actions
// ─────────────────────────────────────────────────────────────────────────────
export type ReducerAction =
  | { type: "SET_REPOSITORY"; payload: { source: string; nodes: RepoNode[] } }
  | { type: "SET_LOG"; payload: { rawLog: string } }
  | { type: "START_ANALYSIS" }
  | { type: "ADVANCE_STAGE" }
  | { type: "SET_FAULT"; payload: { incident: ParsedIncident; faultNodeId: string } }
  | { type: "ADD_TELEMETRY"; payload: TelemetryEntry }
  | { type: "SET_DIFF"; payload: DiffResult }
  | { type: "RESET" };
