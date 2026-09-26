import type {
  LuminaState,
  ReducerAction,
  WorkflowStage,
  RepoNode,
} from "@/app/types/types";

// ─────────────────────────────────────────────────────────────────────────────
// Stage ordering – used by ADVANCE_STAGE to walk the pipeline forward
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_ORDER: WorkflowStage[] = [
  "IDLE",
  "ANALYZING",
  "SUBAGENTS_ACTIVE",
  "VERIFYING",
  "RESOLVED",
];

function nextStage(current: WorkflowStage): WorkflowStage {
  const idx = STAGE_ORDER.indexOf(current);
  // Already at the last stage – stay there
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return current;
  return STAGE_ORDER[idx + 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper – update node statuses that correspond to a given stage transition
// ─────────────────────────────────────────────────────────────────────────────
function applyStageToNodes(
  nodes: RepoNode[],
  stage: WorkflowStage,
  faultNodeId: string | null
): RepoNode[] {
  return nodes.map((node) => {
    switch (stage) {
      case "IDLE":
        return { ...node, status: "HEALTHY" };

      case "ANALYZING":
        // Mark fault origin immediately once we know it; rest stay healthy
        if (node.id === faultNodeId) return { ...node, status: "FAULT" };
        return { ...node, status: "HEALTHY" };

      case "SUBAGENTS_ACTIVE":
        // Fault origin stays red; dependency nodes pulse amber
        if (node.id === faultNodeId) return { ...node, status: "FAULT" };
        if (node.status === "DEPENDENCY") return node; // already set by SET_FAULT
        return { ...node, status: "HEALTHY" };

      case "VERIFYING":
        return { ...node, status: "VERIFYING" };

      case "RESOLVED":
        return { ...node, status: "RESOLVED" };

      default:
        return node;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────
export const initialState: LuminaState = {
  stage: "IDLE",
  nodes: [],
  repositorySource: null,
  rawLog: null,
  incident: null,
  faultNodeId: null,
  telemetryLogs: [],
  activeDiff: null,
  isTyping: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────
export function luminaReducer(
  state: LuminaState,
  action: ReducerAction
): LuminaState {
  switch (action.type) {
    // ── Repository ingested ─────────────────────────────────────────────────
    case "SET_REPOSITORY": {
      const nodes: RepoNode[] = action.payload.nodes.map((n) => ({
        ...n,
        status: "HEALTHY",
      }));
      return {
        ...state,
        repositorySource: action.payload.source,
        nodes,
        // Reset any prior analysis artefacts
        incident: null,
        faultNodeId: null,
        activeDiff: null,
        telemetryLogs: [],
        stage: "IDLE",
      };
    }

    // ── Raw log ingested ────────────────────────────────────────────────────
    case "SET_LOG": {
      return {
        ...state,
        rawLog: action.payload.rawLog,
      };
    }

    // ── User triggers analysis run ──────────────────────────────────────────
    case "START_ANALYSIS": {
      return {
        ...state,
        stage: "ANALYZING",
        isTyping: true,
        incident: null,
        faultNodeId: null,
        activeDiff: null,
        telemetryLogs: [],
        nodes: applyStageToNodes(state.nodes, "ANALYZING", null),
      };
    }

    // ── Step the pipeline forward by one stage ──────────────────────────────
    case "ADVANCE_STAGE": {
      const next = nextStage(state.stage);
      return {
        ...state,
        stage: next,
        nodes: applyStageToNodes(state.nodes, next, state.faultNodeId),
        // Stop typing animation when the pipeline reaches RESOLVED
        isTyping: next !== "RESOLVED",
      };
    }

    // ── Fault origin + dependencies identified by the parser ────────────────
    case "SET_FAULT": {
      const { incident, faultNodeId } = action.payload;

      // Mark fault-origin node red and dependency nodes amber
      const updatedNodes = state.nodes.map((node) => {
        if (node.id === faultNodeId) return { ...node, status: "FAULT" as const };
        if (incident.dependencyFiles.some((dep) => node.path.includes(dep))) {
          return { ...node, status: "DEPENDENCY" as const };
        }
        return node;
      });

      return {
        ...state,
        incident,
        faultNodeId,
        nodes: updatedNodes,
      };
    }

    // ── Append a single telemetry line ──────────────────────────────────────
    case "ADD_TELEMETRY": {
      return {
        ...state,
        telemetryLogs: [...state.telemetryLogs, action.payload],
      };
    }

    // ── Diff patch ready for the Git Diff Inspector ─────────────────────────
    case "SET_DIFF": {
      return {
        ...state,
        activeDiff: action.payload,
      };
    }

    // ── Full reset back to blank slate ──────────────────────────────────────
    case "RESET": {
      return {
        ...initialState,
        // Preserve ingested repository so the user doesn't have to re-upload
        nodes: state.nodes.map((n) => ({ ...n, status: "HEALTHY" })),
        repositorySource: state.repositorySource,
      };
    }

    default:
      return state;
  }
}
