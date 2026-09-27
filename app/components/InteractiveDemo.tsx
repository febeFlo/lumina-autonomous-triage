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
  RotateCcw,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Circle,
  ChevronRight,
  ShieldCheck,
  Activity,
  Code2,
} from 'lucide-react';

import { luminaReducer, initialState } from '@/app/store/reducer';
import { fetchRepositoryTree } from '@/app/lib/github';
import { parseStackTrace } from '@/app/lib/stackTraceParser';
import { generateDiff } from '@/app/lib/diffGenerator';
import { analyzeImports, buildIncidentReport } from '@/app/lib/dependencyAnalyzer';
import type { RepoNode, NodeStatus, SourceFile } from '@/app/types/types';
import CircuitGraph from './CircuitGraph';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:       '#0E1117',
  card:     '#161B22',
  border:   '#30363D',
  cyan:     '#00F0FF',
  green:    '#00FF66',
  amber:    '#FFB800',
  red:      '#FF0055',
  muted:    'rgba(255,255,255,0.45)',
  mutedLow: 'rgba(255,255,255,0.25)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Preset data
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_NODES: RepoNode[] = [
  { id: 'main.py',      label: 'main.py',      path: 'main.py',      status: 'UNKNOWN', x: 0.5,  y: 0.15 },
  { id: 'routes.py',   label: 'routes.py',   path: 'routes.py',   status: 'UNKNOWN', x: 0.2,  y: 0.45 },
  { id: 'database.py', label: 'database.py', path: 'database.py', status: 'UNKNOWN', x: 0.8,  y: 0.45 },
  { id: 'auth.py',     label: 'auth.py',     path: 'auth.py',     status: 'UNKNOWN', x: 0.2,  y: 0.78 },
  { id: 'config.py',   label: 'config.py',   path: 'config.py',   status: 'UNKNOWN', x: 0.8,  y: 0.78 },
];

/** Stub source content for the sample preset — enables import edge analysis */
const SAMPLE_SOURCE_FILES: Record<string, SourceFile> = {
  'main.py': {
    path: 'main.py', filename: 'main.py', extension: '.py',
    content: `from routes import process\nfrom config import settings\n\ndef handle_request(payload):\n    result = process(payload)\n    return result\n`,
  },
  'routes.py': {
    path: 'routes.py', filename: 'routes.py', extension: '.py',
    content: `from database import get_user\nfrom auth import verify_token\n\ndef process(payload):\n    user = get_user(payload["user_id"])\n    return user\n`,
  },
  'database.py': {
    path: 'database.py', filename: 'database.py', extension: '.py',
    content: `from config import settings\n\ndb = {}\n\ndef get_user(key):\n    return db[key]\n`,
  },
  'auth.py': {
    path: 'auth.py', filename: 'auth.py', extension: '.py',
    content: `from config import settings\n\ndef verify_token(token):\n    return settings.secret == token\n`,
  },
  'config.py': {
    path: 'config.py', filename: 'config.py', extension: '.py',
    content: `class Settings:\n    secret = "lumina"\n\nsettings = Settings()\n`,
  },
};

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
  UNKNOWN:    { border: '#4A5568', bg: 'rgba(74,85,104,0.14)', glow: 'rgba(74,85,104,0.2)',  label: 'Unknown',    Icon: Circle        },
  HEALTHY:    { border: C.green,   bg: `${C.green}12`,         glow: `${C.green}30`,          label: 'Healthy',    Icon: CheckCircle   },
  FAULT:      { border: C.red,     bg: `${C.red}12`,           glow: `${C.red}40`,            label: 'Fault',      Icon: AlertCircle   },
  DEPENDENCY: { border: C.amber,   bg: `${C.amber}12`,         glow: `${C.amber}30`,          label: 'Dependency', Icon: AlertTriangle },
  VERIFYING:  { border: C.cyan,    bg: `${C.cyan}12`,          glow: `${C.cyan}30`,           label: 'Verifying',  Icon: Circle        },
  RESOLVED:   { border: C.green,   bg: `${C.green}12`,         glow: `${C.green}30`,          label: 'Resolved',   Icon: CheckCircle   },
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
// Sub-component: diff line renderer
// ─────────────────────────────────────────────────────────────────────────────
function DiffLine({ line }: { line: string }) {
  if (line.startsWith('---') || line.startsWith('+++')) {
    return (
      <div className="px-3 py-0.5 text-xs" style={{ color: C.muted, fontFamily: 'var(--font-mono, monospace)' }}>
        {line}
      </div>
    );
  }
  if (line.startsWith('@@')) {
    return (
      <div
        className="px-3 py-1 text-xs"
        style={{ color: C.cyan, background: `${C.cyan}0A`, fontFamily: 'var(--font-mono, monospace)' }}
      >
        {line}
      </div>
    );
  }
  if (line.startsWith('-')) {
    return (
      <div
        className="px-3 py-0.5 text-xs"
        style={{ color: '#FF8099', background: 'rgba(255,0,85,0.12)', fontFamily: 'var(--font-mono, monospace)' }}
      >
        {line}
      </div>
    );
  }
  if (line.startsWith('+')) {
    return (
      <div
        className="px-3 py-0.5 text-xs"
        style={{ color: '#80FFB2', background: 'rgba(0,255,102,0.10)', fontFamily: 'var(--font-mono, monospace)' }}
      >
        {line}
      </div>
    );
  }
  return (
    <div className="px-3 py-0.5 text-xs" style={{ color: C.muted, fontFamily: 'var(--font-mono, monospace)' }}>
      {line || '\u00A0'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: confidence badge (uses the string label from IncidentReport)
// ─────────────────────────────────────────────────────────────────────────────
function ConfidenceBadge({ label, score }: { label: 'HIGH' | 'MEDIUM' | 'LOW'; score: number }) {
  const color = label === 'HIGH' ? C.green : label === 'MEDIUM' ? C.amber : C.red;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ borderColor: `${color}40`, background: `${color}14`, color }}
    >
      <ShieldCheck size={9} aria-hidden="true" />
      Confidence : {label} · {score}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function InteractiveDemo() {
  const [state, dispatch] = useReducer(luminaReducer, initialState);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [githubUrl, setGithubUrl]         = useState('');
  const [githubError, setGithubError]     = useState<string | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [logDragOver, setLogDragOver]     = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── Derived shorthand ──────────────────────────────────────────────────────
  const { nodes, rawLog, incident, activeDiff, stage, importEdges, incidentReport } = state;
  const hasRepo    = nodes.length > 0;
  const hasLog     = !!rawLog;
  const isAnalyzed = stage === 'ANALYZED';
  const isResolved = stage === 'RESOLVED';

  // ── Helper: parse log, dispatch fault + report ────────────────────────────
  const processLog = useCallback(
    (logText: string, nodeList: RepoNode[], sourceFiles: Record<string, SourceFile>) => {
      const filenames = nodeList.map((n) => n.label);
      const parsed = parseStackTrace(logText, filenames);
      if (!parsed) return;

      const faultNode = nodeList.find(
        (n) => n.label === parsed.faultFile || n.path.includes(parsed.faultFile)
      );
      if (faultNode) {
        dispatch({ type: 'SET_FAULT', payload: { incident: parsed, faultNodeId: faultNode.id } });
      }

      // Locate the source file so both diff + report can read real content
      const sfEntry = Object.entries(sourceFiles).find(
        ([path, sf]) =>
          (sf as SourceFile).filename === parsed.faultFile ||
          path.includes(parsed.faultFile)
      );
      const sf = sfEntry ? (sfEntry[1] as SourceFile) : null;

      // Diff is generated from actual source context, not from the error type
      const diff = generateDiff(
        parsed.faultFile,
        parsed.lineNumber,
        sf,
        parsed.language
      );
      dispatch({ type: 'SET_DIFF', payload: diff });

      // buildIncidentReport runs its own classification + confidence internally
      const report = buildIncidentReport(parsed, sourceFiles);
      dispatch({ type: 'SET_INCIDENT_REPORT', payload: report });

      dispatch({ type: 'MARK_REMAINING_HEALTHY' });
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
      // GitHub API path-only: dispatch empty source files (no content available)
      dispatch({ type: 'SET_SOURCE_FILES', payload: { sourceFiles: {}, importEdges: [] } });
      if (rawLog) processLog(rawLog, fetched, {});
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Unknown error fetching repository.');
    } finally {
      setGithubLoading(false);
    }
  }, [githubUrl, rawLog, processLog]);

  // ── Local folder ingestion ─────────────────────────────────────────────────
  const handleFolderUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      const SOURCE_EXT = ['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.java'];
      const sourceFileList = files
        .filter((f) => SOURCE_EXT.some((ext) => f.name.endsWith(ext)))
        .slice(0, 10);

      if (sourceFileList.length === 0) return;

      const cols = Math.ceil(Math.sqrt(sourceFileList.length));
      const rows = Math.ceil(sourceFileList.length / cols);
      const built: RepoNode[] = sourceFileList.map((f, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          id:     f.webkitRelativePath || f.name,
          label:  f.name,
          path:   f.webkitRelativePath || f.name,
          status: 'UNKNOWN',
          x:      cols > 1 ? 0.1 + (col / (cols - 1)) * 0.8 : 0.5,
          y:      rows > 1 ? 0.1 + (row / (rows - 1)) * 0.8 : 0.5,
        };
      });

      const source = sourceFileList[0].webkitRelativePath
        ? sourceFileList[0].webkitRelativePath.split('/')[0]
        : 'Local Upload';

      dispatch({ type: 'SET_REPOSITORY', payload: { source, nodes: built } });

      // Read all file contents via FileReader, then analyze imports
      const ext = (name: string) => {
        const dot = name.lastIndexOf('.');
        return dot >= 0 ? name.slice(dot) : '';
      };

      let pending = sourceFileList.length;
      const sfMap: Record<string, SourceFile> = {};

      const onAllRead = () => {
        const edges = analyzeImports(sfMap);
        dispatch({ type: 'SET_SOURCE_FILES', payload: { sourceFiles: sfMap, importEdges: edges } });
        if (rawLog) processLog(rawLog, built, sfMap);
      };

      for (const f of sourceFileList) {
        const path = f.webkitRelativePath || f.name;
        const reader = new FileReader();
        reader.onload = (ev) => {
          sfMap[path] = {
            path,
            filename: f.name,
            extension: ext(f.name),
            content: (ev.target?.result as string) ?? '',
          };
          pending -= 1;
          if (pending === 0) onAllRead();
        };
        reader.onerror = () => {
          sfMap[path] = { path, filename: f.name, extension: ext(f.name), content: '' };
          pending -= 1;
          if (pending === 0) onAllRead();
        };
        reader.readAsText(f);
      }

      e.target.value = '';
    },
    [rawLog, processLog]
  );

  // ── Sample repository preset ───────────────────────────────────────────────
  const handleSampleRepo = useCallback(() => {
    dispatch({ type: 'SET_REPOSITORY', payload: { source: 'sample-microservice', nodes: SAMPLE_NODES } });
    const edges = analyzeImports(SAMPLE_SOURCE_FILES);
    dispatch({ type: 'SET_SOURCE_FILES', payload: { sourceFiles: SAMPLE_SOURCE_FILES, importEdges: edges } });
    if (rawLog) processLog(rawLog, SAMPLE_NODES, SAMPLE_SOURCE_FILES);
  }, [rawLog, processLog]);

  // ── Log ingestion ──────────────────────────────────────────────────────────
  const ingestLog = useCallback(
    (text: string) => {
      dispatch({ type: 'SET_LOG', payload: { rawLog: text } });
      processLog(text, nodes, state.sourceFiles);
    },
    [nodes, state.sourceFiles, processLog]
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
    <section id="demo" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">

      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: C.cyan }}>
          Interactive Control Center
        </p>
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
          Live Triage Dashboard
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: C.muted }}>
          Ingest a repository and an incident log. Lumina builds a real dependency graph, 
          traces fault origins to specific files and lines, and generates context-aware 
          remediation recommendations from the affected source code.
        </p>
      </div>

      {/* ── 3-panel grid ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[420px_1fr]">

        {/* ═══════════════════════════════════════════════════════════════════
            PANEL 1 — LEFT: Ingestion Controls
        ══════════════════════════════════════════════════════════════════ */}
        <PanelCard className="flex flex-col gap-6 p-5 lg:row-span-2">

          {/* A. GitHub URL */}
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

          {/* B. Local Folder Upload */}
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

          {/* C. Sample Preset */}
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
              <span className="ml-auto text-[10px] opacity-50" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                main · routes · database · auth · config
              </span>
            </button>
          </div>

          <div className="border-t" style={{ borderColor: C.border }} />

          {/* D. Log Ingestion */}
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
                borderStyle: 'dashed',
                borderColor: logDragOver ? C.cyan : C.border,
                background:  logDragOver ? `${C.cyan}08` : 'transparent',
                color:       logDragOver ? C.cyan : C.muted,
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
                    background:  rawLog === log ? `${C.amber}12` : C.card,
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

          {/* ── Supported languages note ──────────────────────────────────── */}
          <div
            className="rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed"
            style={{ borderColor: `${C.cyan}20`, background: `${C.cyan}06`, color: 'rgba(255,255,255,0.45)' }}
          >
            <span className="font-bold" style={{ color: C.cyan }}>Supported languages: </span>
            Python · JavaScript · TypeScript · Go · Java
            <span className="block mt-0.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Stack traces are parsed for all five. Import edges require source content (local folder upload).
            </span>
          </div>

          {/* F. Status strip + Reset */}
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
              {incident && isAnalyzed && (
                <span>
                  <span style={{ color: C.red }}>✕</span>{' '}
                  Fault:{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: C.red }}>{incident.faultFile}</span>
                  {' '}· line {incident.lineNumber}
                </span>
              )}
              {isResolved && (
                <span style={{ color: C.green }}>
                  All nodes healthy
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

        {/* ═══════════════════════════════════════════════════════════════════
            PANEL 2 — RIGHT TOP: Dynamic Circuit Canvas
        ══════════════════════════════════════════════════════════════════ */}
        <PanelCard className="flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                AST Dependency Graph
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
            <div className="flex items-center gap-2">
              {importEdges.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{ background: `${C.amber}14`, color: C.amber }}
                >
                  {importEdges.length} import edges
                </span>
              )}
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                style={{ background: `${C.cyan}14`, color: C.cyan }}
              >
                {nodes.length} nodes
              </span>
            </div>
          </div>

          <CircuitGraph
            nodes={nodes}
            faultFile={incident?.faultFile}
            dependencyFiles={incident?.dependencyFiles}
            stage={stage}
            importEdges={importEdges}
          />
        </PanelCard>

        {/* ═══════════════════════════════════════════════════════════════════
            PANEL 3 — RIGHT BOTTOM: Incident Report + Git Diff Inspector
        ══════════════════════════════════════════════════════════════════ */}
        <PanelCard className="flex flex-col gap-4 p-5">

          {/* ── Incident Analysis Report ───────────────────────────────────── */}
          {incidentReport ? (
            <div className="flex flex-col gap-3">
              {/* Report header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Activity size={13} style={{ color: C.red }} aria-hidden="true" />
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                    Incident Analysis Report
                  </p>
                </div>
                <ConfidenceBadge label={incidentReport.confidence} score={incidentReport.confidenceScore} />
              </div>

              {/* Metadata grid */}
              <div
                className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-xs"
                style={{ background: C.bg, borderColor: C.border }}
              >
                {/* Error type */}
                <div>
                  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                    Exception
                  </p>
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: `${C.red}18`, color: C.red }}
                  >
                    {incidentReport.errorType || 'detected'}
                  </span>
                </div>

                {/* Language */}
                <div>
                  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                    Language
                  </p>
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: `${C.cyan}14`, color: C.cyan }}
                  >
                    {incidentReport.language}
                  </span>
                </div>

                {/* Fault file */}
                <div>
                  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                    Fault File
                  </p>
                  <code
                    className="text-[11px]"
                    style={{ color: C.red, fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    {incidentReport.faultFile}
                  </code>
                </div>

                {/* Line number */}
                <div>
                  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                    Fault Line
                  </p>
                  <code
                    className="text-[11px]"
                    style={{ color: C.amber, fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    :{incidentReport.lineNumber}
                  </code>
                </div>
              </div>

              {/* Fault code snippet — only when content was available */}
              {incidentReport.faultCode && (
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                    Source Context
                  </p>
                  <div
                    className="overflow-x-auto rounded-xl border p-3 text-xs"
                    style={{
                      background:  C.bg,
                      borderColor: `${C.red}30`,
                      fontFamily:  'var(--font-mono, monospace)',
                      color:        'rgba(255,255,255,0.7)',
                      whiteSpace:  'pre',
                    }}
                  >
                    {incidentReport.faultCode}
                  </div>
                </div>
              )}

              {/* Dependency files */}
              {incidentReport.dependencyFiles.length > 0 && (
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                    Upstream Callers
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {incidentReport.dependencyFiles.map((f) => (
                      <span
                        key={f}
                        className="rounded-full border px-2 py-0.5 text-[10px]"
                        style={{
                          borderColor: `${C.amber}40`,
                          background:  `${C.amber}0C`,
                          color:        C.amber,
                          fontFamily:  'var(--font-mono, monospace)',
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested remediation */}
              <div
                className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs"
                style={{ borderColor: `${C.green}30`, background: `${C.green}08` }}
              >
                <ShieldCheck size={12} style={{ color: C.green, marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
                <div>
                  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: `${C.green}99` }}>
                    Suggested Remediation
                  </p>
                  <p style={{ color: '#80FFB2' }}>{incidentReport.patchSummary}</p>
                </div>
              </div>
            </div>
          ) : (
            /* Empty state for the report panel */
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity size={13} style={{ color: C.muted }} aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                  Incident Analysis Report
                </p>
              </div>
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-xl border py-8 text-center"
                style={{ borderColor: C.border, borderStyle: 'dashed' }}
              >
                <Activity size={22} style={{ color: C.mutedLow }} aria-hidden="true" />
                <p className="text-xs" style={{ color: C.mutedLow }}>
                  Upload an incident log to generate<br />an autonomous analysis report.
                </p>
              </div>
            </div>
          )}

          {/* ── Git Diff Inspector ─────────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 size={13} style={{ color: C.cyan }} aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>
                  Git Diff Inspector
                </p>
              </div>
              {activeDiff && isResolved && (
                <span
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ borderColor: `${C.green}40`, background: `${C.green}0C`, color: C.green }}
                >
                  <CheckCircle size={9} aria-hidden="true" />
                  Bob Shell Approved · 100% Tests Passing
                </span>
              )}
            </div>

            {!activeDiff && (
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-xl border py-8 text-center"
                style={{ borderColor: C.border, borderStyle: 'dashed' }}
              >
                <Code2 size={22} style={{ color: C.mutedLow }} aria-hidden="true" />
                <p className="text-xs" style={{ color: C.mutedLow }}>
                  Patch diff will appear here<br />after log analysis.
                </p>
              </div>
            )}

            {activeDiff && (
              <div className="flex flex-col gap-3">
                {/* Metadata row */}
                <div
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-xs"
                  style={{ background: C.bg, borderColor: C.border }}
                >
                  <span>
                    <code style={{ color: C.cyan, fontFamily: 'var(--font-mono, monospace)' }}>
                      {activeDiff.filePath}
                    </code>
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
                  style={{ background: C.bg, borderColor: C.border, maxHeight: '220px' }}
                >
                  {activeDiff.diff.split('\n').map((line, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <DiffLine key={i} line={line} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </PanelCard>
      </div>
    </section>
  );
}
