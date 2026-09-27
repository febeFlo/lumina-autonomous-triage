import type {
  LuminaState,
  ReducerAction,
  RepoNode,
} from "@/app/types/types";

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
  sourceFiles: {},
  importEdges: [],
  incidentReport: null,
  activeDiff: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────
export function luminaReducer(
  state: LuminaState,
  action: ReducerAction
): LuminaState {
  switch (action.type) {

    // ── Repository structure ingested (nodes only, no content yet) ───────────
    case "SET_REPOSITORY": {
      const nodes: RepoNode[] = action.payload.nodes.map((n) => ({
        ...n,
        status: "UNKNOWN",
      }));
      return {
        ...state,
        repositorySource: action.payload.source,
        nodes,
        // Reset analysis artefacts from any prior session
        incident: null,
        faultNodeId: null,
        activeDiff: null,
        incidentReport: null,
        importEdges: [],
        sourceFiles: {},
        stage: "IDLE",
      };
    }

    // ── File contents + import edges stored after reading source ─────────────
    case "SET_SOURCE_FILES": {
      return {
        ...state,
        sourceFiles: action.payload.sourceFiles,
        importEdges: action.payload.importEdges,
      };
    }

    // ── Raw log ingested ─────────────────────────────────────────────────────
    case "SET_LOG": {
      return {
        ...state,
        rawLog: action.payload.rawLog,
      };
    }

    // ── Fault origin + dependency nodes identified by the parser ─────────────
    case "SET_FAULT": {
      const { incident, faultNodeId } = action.payload;

      const updatedNodes = state.nodes.map((node) => {
        if (node.id === faultNodeId)
          return { ...node, status: "FAULT" as const };
        if (incident.dependencyFiles.some((dep) => node.path.includes(dep) || node.label === dep))
          return { ...node, status: "DEPENDENCY" as const };
        return node;
      });

      return {
        ...state,
        stage: "ANALYZED",
        incident,
        faultNodeId,
        nodes: updatedNodes,
      };
    }

    // ── Structured analysis report available ─────────────────────────────────
    case "SET_INCIDENT_REPORT": {
      return {
        ...state,
        incidentReport: action.payload,
      };
    }

    // ── Diff patch ready ─────────────────────────────────────────────────────
    case "SET_DIFF": {
      return {
        ...state,
        activeDiff: action.payload,
      };
    }

    // ── User manually marks the incident as resolved ──────────────────────────
    case "MARK_RESOLVED": {
      const resolvedNodes = state.nodes.map((n) => ({
        ...n,
        status: "HEALTHY" as const,
      }));
      return {
        ...state,
        stage: "RESOLVED",
        nodes: resolvedNodes,
      };
    }

    // ── Full reset ───────────────────────────────────────────────────────────
    case "RESET": {
      return {
        ...initialState,
        // Preserve repository structure so the user doesn't have to re-upload
        nodes: state.nodes.map((n) => ({ ...n, status: "UNKNOWN" })),
        repositorySource: state.repositorySource,
        sourceFiles: state.sourceFiles,
        importEdges: state.importEdges,
      };
    }

    // ── Mark remaining unknown nodes as healthy ──────────────────────────────
    case "MARK_REMAINING_HEALTHY": {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.status === "UNKNOWN" ? { ...node, status: "HEALTHY" as const } : node
        ),
      };
    }

    default:
      return state;
  }
}
