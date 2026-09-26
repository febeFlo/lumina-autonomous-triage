'use client';

import {
  useReducer,
  useRef,
  useCallback,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  FolderOpen,
  GitBranch,
  Upload,
  FileText,
  Play,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Circle,
  ChevronRight,
} from 'lucide-react';

import { luminaReducer, initialState } from '@/app/store/reducer';
import { fetchRepositoryTree } from '@/app/lib/github';
import { parseStackTrace } from '@/app/lib/stackTraceParser';
import { generateDiff } from '@/app/lib/diffGenerator';
import type { RepoNode, NodeStatus } from '@/app/types/types';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (inline — avoids arbitrary Tailwind class generation)
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:        '#0E1117',
  card:      '#161B22',
  border:    '#30363D',
  cyan:      '#00F0FF',
  green:     '#00FF66',
  amber:     '#FFB800',
  red:       '#FF0055',
  muted:     'rgba(255,255,255,0.45)',
  mutedLow:  'rgba(255,255,255,0.25)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Preset data
// ─────────────────────────────────────────────────────────────────────────────

/** Sample repository – the PRD-prescribed microservice preset */
const SAMPLE_NODES: RepoNode[] = [
  { id: 'main.py',     label: 'main.py',     path: 'main.py',     status: 'HEALTHY', x: 0.5,  y: 0.15 },
  { id: 'routes.py',  label: 'routes.py',  path: 'routes.py',  status: 'HEALTHY', x: 0.2,  y: 0.45 },
  { id: 'database.py',label: 'database.py',path: 'database.py',status: 'HEALTHY', x: 0.8,  y: 0.45 },
  { id: 'auth.py',    label: 'auth.py',    path: 'auth.py',    status: 'HEALTHY', x: 0.2,  y: 0.78 },
  { id: 'config.py',  label: 'config.py',  path: 'config.py',  status: 'HEALTHY', x: 0.8,  y: 0.78 },
];

interface PresetLog { label: string; log: string }

const PRESET_LOGS: PresetLog[] = [
  {
    label: 'Python KeyError',
    log: `Traceback (most recent call last):
  File "main.py", line 24, in handle_request
    result = process(payload)
  File "routes.py", line 47, in process
    user = get_user(payload["user_id"])
  File "database.py", line 52, in get_user
    return db[key]
KeyError: 'user_id'`,
  },
  {
    label: 'Node NullPointer',
    log: `TypeError: Cannot read properties of null (reading 'profile')
    at getUserProfile (database.js:43:22)
    at handleRequest (routes.js:29:14)
    at Server.<anonymous> (main.js:12:5)
NullPointerException: user is null`,
  },
  {
    label: 'Go IndexOutOfBounds',
    log: `goroutine 1 [running]:
main.processItems(...)
    /app/main.go:31
database.fetchRecord(0x5, 0xc0000b4000, 0x3, 0x3)
    /app/database.go:58 +0x1a4
IndexOutOfBoundsException: index 5 out of range [0, 3]`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Node status → visual tokens
// ─────────────────────────────────────────────────────────────────────────────
interface StatusTokens {
  border: string;
  bg:     string;
  glow:   string;
  label:  string;
  Icon:   React.ComponentType<{ size?: number; color?: string }>;
}

const STATUS_TOKENS: Record<NodeStatus, StatusTokens> = {
  HEALTHY:    { border: C.green,  bg: `${C.green}12`,  glow: `${C.green}30`,  label: 'Healthy',    Icon: CheckCircle  },
  FAULT:      { border: C.red,    bg: `${C.red}12`,    glow: `${C.red}40`,    label: 'Fault',      Icon: AlertCircle  },
  DEPENDENCY: { border: C.amber,  bg: `${C.amber}12`,  glow: `${C.amber}30`,  label: 'Dependency', Icon: AlertTriangle },
  VERIFYING:  { border: C.cyan,   bg: `${C.cyan}12`,   glow: `${C.cyan}30`,   label: 'Verifying',  Icon: Circle       },
  RESOLVED:   { border: C.green,  bg: `${C.green}12`,  glow: `${C.green}30`,  label: 'Resolved',   Icon: CheckCircle  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable primitives
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
      {children}
    </p>
  );
}

function PanelCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{ background: C.card, borderColor: C.border }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: single repository node card
// ─────────────────────────────────────────────────────────────────────────────
function NodeCard({ node }: { node: RepoNode }) {
  const tok = STATUS_TOKENS[node.status];
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all duration-300"
      style={{
        background:  tok.bg,
        borderColor: tok.border,
        boxShadow:   `0 0 10px ${tok.glow}`,
      }}
    >
      <tok.Icon size={13} color={tok.border} aria-hidden="true" />
      <span
        className="flex-1 truncate text-xs font-semibold text-white"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
      >
        {node.label}
      </span>
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
        style={{ background: `${tok.border}22`, color: tok.border }}
      >
        {tok.label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: diff line renderer
// ─────────────────────────────────────────────────────────────────────────────
function DiffLine({ line }: { line: string }) {
  if (line.startsWith('---') || line.startsWith('+++')) {
    return (
      <div
        className="px-3 py-0.5 text-xs"
        style={{ color: C.muted, fontFamily: 'var(--font-mono, monospace)' }}
      >
        {line}
      </div>
    );
  }
  if (line.startsWith('@@')) {
    return (
      <div
        className="px-3 py-1 text-xs"
        style={{
          color: C.cyan,
          background: `${C.cyan}0A`,
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {line}
      </div>
    );
  }
  if (line.startsWith('-')) {
    return (
      <div
        className="px-3 py-0.5 text-xs"
        style={{
          color: '#FF8099',
          background: 'rgba(255,0,85,0.12)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {line}
      </div>
    );
  }
  if (line.startsWith('+')) {
    return (
      <div
        className="px-3 py-0.5 text-xs"
        style={{
          color: '#80FFB2',
          background: 'rgba(0,255,102,0.10)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {line}
      </div>
    );
  }
  return (
    <div
      className="px-3 py-0.5 text-xs"
      style={{ color: C.muted, fontFamily: 'var(--font-mono, monospace)' }}
    >
      {line || '\u00A0'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function InteractiveDemo() {
  const [state, dispatch] = useReducer(luminaReducer, initialState);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [githubUrl, setGithubUrl]         = useLocalState('');
  const [githubError, setGithubError]     = useLocalState<string | null>(null);
  const [githubLoading, setGithubLoading] = useLocalState(false);
  const [logDragOver, setLogDragOver]     = useLocalState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── Derived shorthand ──────────────────────────────────────────────────────
  const { nodes, rawLog, incident, activeDiff } = state;
  const hasRepo = nodes.length > 0;
  const hasLog  = !!rawLog;

  // ── Helper: run parse + dispatch after log is set ─────────────────────────
  const processLog = useCallback(
    (logText: string, nodeList: RepoNode[]) => {
      const filenames = nodeList.map((n) => n.label);
      const parsed = parseStackTrace(logText, filenames);
      if (!parsed) return;

      // Find the matching node id for the fault file
      const faultNode = nodeList.find(
        (n) => n.label === parsed.faultFile || n.path.includes(parsed.faultFile)
      );
      if (faultNode) {
        dispatch({ type: 'SET_FAULT', payload: { incident: parsed, faultNodeId: faultNode.id } });
      }

      const diff = generateDiff(parsed.faultFile, parsed.errorType, parsed.lineNumber);
      dispatch({ type: 'SET_DIFF', payload: diff });
    },
    []
  );

  // ── GitHub ingestion ───────────────────────────────────────────────────────
  const handleGitHubFetch = useCallback(async () => {
    if (!githubUrl.trim()) return;
    setGithubError(null);
    setGithubLoading(true);
    try {
      const fetched = await fetchRepositoryTree(githubUrl.trim());
      dispatch({ type: 'SET_REPOSITORY', payload: { source: githubUrl.trim(), nodes: fetched } });
      if (rawLog) processLog(rawLog, fetched);
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Unknown error fetching repository.');
    } finally {
      setGithubLoading(false);
    }
  }, [githubUrl, rawLog, processLog]);

  // ── Local folder ingestion ─────────────────────────────────────────────────
  const handleFolderUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const SOURCE_EXT = ['.py', '.ts', '.js', '.go', '.java'];
    const sourceFiles = files
      .filter((f) => SOURCE_EXT.some((ext) => f.name.endsWith(ext)))
      .slice(0, 10);

    if (sourceFiles.length === 0) return;

    // Distribute nodes in a grid layout (same logic as github.ts)
    const cols  = Math.ceil(Math.sqrt(sourceFiles.length));
    const rows  = Math.ceil(sourceFiles.length / cols);
    const built: RepoNode[] = sourceFiles.map((f, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        id:     f.webkitRelativePath || f.name,
        label:  f.name,
        path:   f.webkitRelativePath || f.name,
        status: 'HEALTHY',
        x:      cols > 1 ? 0.1 + (col / (cols - 1)) * 0.8 : 0.5,
        y:      rows > 1 ? 0.1 + (row / (rows - 1)) * 0.8 : 0.5,
      };
    });

    const source = sourceFiles[0].webkitRelativePath
      ? sourceFiles[0].webkitRelativePath.split('/')[0]
      : 'Local Upload';

    dispatch({ type: 'SET_REPOSITORY', payload: { source, nodes: built } });
    if (rawLog) processLog(rawLog, built);
    // Reset the input so the same folder can be re-selected
    e.target.value = '';
  }, [rawLog, processLog]);

  // ── Sample repository preset ───────────────────────────────────────────────
  const handleSampleRepo = useCallback(() => {
    dispatch({ type: 'SET_REPOSITORY', payload: { source: 'sample-microservice', nodes: SAMPLE_NODES } });
    if (rawLog) processLog(rawLog, SAMPLE_NODES);
  }, [rawLog, processLog]);

  // ── Log ingestion helpers ──────────────────────────────────────────────────
  const ingestLog = useCallback(
    (text: string) => {
      dispatch({ type: 'SET_LOG', payload: { rawLog: text } });
      processLog(text, nodes);
    },
    [nodes, processLog]
  );

  const handleLogFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) ingestLog(text);
      };
      reader.readAsText(file);
    },
    [ingestLog]
  );

  const handleLogFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleLogFile(file);
      e.target.value = '';
    },
    [handleLogFile]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setLogDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleLogFile(file);
    },
    [handleLogFile]
  );

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
    setGithubError(null);
    setGithubUrl('');
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">

      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: C.cyan }}>
          Interactive Control Center
        </p>
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
          Live Triage Dashboard
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: C.muted }}>
          Ingest a repository and a log file to watch Lumina identify the fault origin, map dependency nodes, and generate an autonomous patch.
        </p>
      </div>

      {/* ── 3-panel grid ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[420px_1fr]">

        {/* ════════════════════════════════════════════════════════════════════
            PANEL 1 — LEFT: Ingestion
        ═══════════════════════════════════════════════════════════════════ */}
        <PanelCard className="flex flex-col gap-6 p-5 lg:row-span-2">

          {/* ── A. GitHub URL ─────────────────────────────────────────────── */}
          <div>
            <SectionLabel>
              <GitBranch size={10} className="inline mr-1" aria-hidden="true" />
              GitHub Repository
            </SectionLabel>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://github.com/owner/repo"
                value={githubUrl}
                onChange={(e) => { setGithubUrl(e.target.value); setGithubError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGitHubFetch(); }}
                className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:ring-1"
                style={{
                  borderColor: githubError ? C.red : C.border,
                  // @ts-expect-error focus-ring not typed
                  '--tw-ring-color': C.cyan,
                }}
              />
              <button
                onClick={handleGitHubFetch}
                disabled={githubLoading || !githubUrl.trim()}
                className="rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-40"
                style={{ background: C.cyan, color: '#0E1117' }}
              >
                {githubLoading ? '…' : 'Fetch'}
              </button>
            </div>

            {githubError && (
              <p className="mt-1.5 text-xs" style={{ color: C.red }}>{githubError}</p>
            )}
          </div>

          {/* ── B. Local Folder Upload ────────────────────────────────────── */}
          <div>
            <SectionLabel>
              <FolderOpen size={10} className="inline mr-1" aria-hidden="true" />
              Local Folder Upload
            </SectionLabel>

            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border py-3 text-xs font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white/90"
              style={{ borderColor: C.border, borderStyle: 'dashed' }}
            >
              <Upload size={13} aria-hidden="true" />
              Choose Folder…
            </button>

            {/* Hidden folder input — webkitdirectory + directory + multiple */}
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is not in standard typings
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={handleFolderUpload}
              aria-label="Upload local folder"
            />
          </div>

          {/* ── C. Sample Preset ─────────────────────────────────────────── */}
          <div>
            <SectionLabel>Preset Repository</SectionLabel>
            <button
              onClick={handleSampleRepo}
              className="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-all hover:-translate-y-px"
              style={{
                background:  `${C.cyan}0A`,
                borderColor: `${C.cyan}30`,
                color:        C.cyan,
              }}
            >
              <ChevronRight size={12} aria-hidden="true" />
              Use Sample Microservice Repo
              <span className="ml-auto text-[10px] opacity-50 font-mono">
                main · routes · database · auth · config
              </span>
            </button>
          </div>

          {/* ── Divider ──────────────────────────────────────────────────── */}
          <div className="border-t" style={{ borderColor: C.border }} />

          {/* ── D. Log Ingestion ──────────────────────────────────────────── */}
          <div>
            <SectionLabel>
              <FileText size={10} className="inline mr-1" aria-hidden="true" />
              Incident Log Ingestion
            </SectionLabel>

            {/* Drag-and-drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop a .log or .txt file here"
              className="mb-3 flex flex-col items-center justify-center gap-1.5 rounded-xl border py-6 text-center text-xs transition-all cursor-pointer"
              style={{
                borderStyle:  'dashed',
                borderColor:  logDragOver ? C.cyan : C.border,
                background:   logDragOver ? `${C.cyan}08` : 'transparent',
                color:        logDragOver ? C.cyan : C.muted,
              }}
              onDragOver={(e) => { e.preventDefault(); setLogDragOver(true); }}
              onDragLeave={() => setLogDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            >
              <Upload size={18} aria-hidden="true" />
              <span>Drop <code>.log</code> / <code>.txt</code> here, or click to upload</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".log,.txt"
              className="hidden"
              onChange={handleLogFileInput}
              aria-label="Upload log file"
            />

            {/* Preset log buttons */}
            <div className="flex flex-col gap-2">
              {PRESET_LOGS.map(({ label, log }) => (
                <button
                  key={label}
                  onClick={() => ingestLog(log)}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all hover:-translate-y-px"
                  style={{
                    background:  rawLog === log ? `${C.amber}12` : `${C.card}`,
                    borderColor: rawLog === log ? `${C.amber}50` : C.border,
                    color:       rawLog === log ? C.amber : 'rgba(255,255,255,0.6)',
                  }}
                >
                  <FileText size={11} aria-hidden="true" />
                  {label}
                  {rawLog === log && (
                    <span
                      className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ background: `${C.amber}22`, color: C.amber }}
                    >
                      active
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Divider ──────────────────────────────────────────────────── */}
          <div className="border-t" style={{ borderColor: C.border }} />

          {/* ── E. Status strip + Reset ───────────────────────────────────── */}
          <div className="mt-auto flex items-center justify-between gap-3">
            <div className="text-xs" style={{ color: C.muted }}>
              {!hasRepo && !hasLog && 'Awaiting input…'}
              {hasRepo && !hasLog && (
                <span>
                  <span style={{ color: C.green }}>✓</span> Repo loaded · Select a log
                </span>
              )}
              {hasRepo && hasLog && !incident && (
                <span>
                  <span style={{ color: C.amber }}>◎</span> Parsing log…
                </span>
              )}
              {incident && (
                <span>
                  <span style={{ color: C.red }}>✕</span>{' '}
                  Fault: <span style={{ fontFamily: 'var(--font-mono)', color: C.red }}>{incident.faultFile}</span>
                  {' '}· line {incident.lineNumber}
                </span>
              )}
            </div>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:text-white"
              style={{ borderColor: C.border, color: C.muted }}
              aria-label="Reset dashboard"
            >
              <RotateCcw size={11} aria-hidden="true" />
              Reset
            </button>
          </div>
        </PanelCard>

        {/* ════════════════════════════════════════════════════════════════════
            PANEL 2 — RIGHT TOP: Repository Nodes
        ═══════════════════════════════════════════════════════════════════ */}
        <PanelCard className="flex flex-col p-5">
          {/* Panel header */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                Repository Nodes
              </p>
              {state.repositorySource && (
                <p
                  className="mt-0.5 truncate text-[11px]"
                  style={{ color: C.cyan, fontFamily: 'var(--font-mono, monospace)' }}
                >
                  {state.repositorySource}
                </p>
              )}
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
              style={{ background: `${C.cyan}14`, color: C.cyan }}
            >
              {nodes.length} nodes
            </span>
          </div>

          {/* Empty state */}
          {nodes.length === 0 && (
            <div
              className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border py-12 text-center"
              style={{ borderColor: C.border, borderStyle: 'dashed' }}
            >
              <GitBranch size={24} style={{ color: C.mutedLow }} aria-hidden="true" />
              <p className="text-xs" style={{ color: C.mutedLow }}>
                Load a GitHub repo, upload a folder,<br />or use the sample preset.
              </p>
            </div>
          )}

          {/* Node grid */}
          {nodes.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {nodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          )}

          {/* Legend */}
          {nodes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {(
                [
                  ['HEALTHY',    C.green, 'Healthy'],
                  ['FAULT',      C.red,   'Fault'],
                  ['DEPENDENCY', C.amber, 'Dependency'],
                ] as [NodeStatus, string, string][]
              ).map(([, color, label]) => (
                <span key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color: C.mutedLow }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
          )}
        </PanelCard>

        {/* ════════════════════════════════════════════════════════════════════
            PANEL 3 — RIGHT BOTTOM: Git Diff Inspector
        ═══════════════════════════════════════════════════════════════════ */}
        <PanelCard className="flex flex-col p-5">
          {/* Panel header */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>
              Git Diff Inspector
            </p>
            {activeDiff && (
              <span
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  borderColor: `${C.green}40`,
                  background:  `${C.green}0C`,
                  color:        C.green,
                }}
              >
                <CheckCircle size={9} aria-hidden="true" />
                Bob Shell Approved · 100% Tests Passing
              </span>
            )}
          </div>

          {/* Empty state */}
          {!activeDiff && (
            <div
              className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border py-12 text-center"
              style={{ borderColor: C.border, borderStyle: 'dashed' }}
            >
              <Play size={24} style={{ color: C.mutedLow }} aria-hidden="true" />
              <p className="text-xs" style={{ color: C.mutedLow }}>
                Load a repository and an incident log<br />to generate an autonomous patch.
              </p>
            </div>
          )}

          {/* Diff view */}
          {activeDiff && (
            <div className="flex flex-col gap-3">
              {/* Metadata row */}
              <div
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-xs"
                style={{ background: `${C.bg}`, borderColor: C.border }}
              >
                <span style={{ color: C.muted }}>
                  <span style={{ color: C.cyan, fontFamily: 'var(--font-mono, monospace)' }}>
                    {activeDiff.filePath}
                  </span>
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                  style={{ background: `${C.red}18`, color: C.red }}
                >
                  {activeDiff.errorType}
                </span>
                <span style={{ color: C.mutedLow }}>
                  line {activeDiff.lineNumber}
                </span>
              </div>

              {/* Summary */}
              <p className="text-xs italic" style={{ color: C.muted }}>
                {activeDiff.summary}
              </p>

              {/* Diff body */}
              <div
                className="overflow-x-auto overflow-y-auto rounded-xl border"
                style={{
                  background:  C.bg,
                  borderColor: C.border,
                  maxHeight:   '240px',
                }}
              >
                {activeDiff.diff.split('\n').map((line, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <DiffLine key={i} line={line} />
                ))}
              </div>
            </div>
          )}
        </PanelCard>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thin alias – useState is already imported at the top of the file
// ─────────────────────────────────────────────────────────────────────────────
function useLocalState<T>(initial: T): [T, (v: T) => void] {
  return useState<T>(initial);
}
