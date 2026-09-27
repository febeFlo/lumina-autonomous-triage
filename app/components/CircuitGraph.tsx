'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Transition } from 'framer-motion';
import type { RepoNode, WorkflowStage, NodeStatus, ImportEdge } from '@/app/types/types';
import CircuitBackground from './CircuitBackground';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface CircuitGraphProps {
  nodes: RepoNode[];
  faultFile?: string;
  dependencyFiles?: string[];
  stage: WorkflowStage;
  importEdges?: ImportEdge[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:     '#0E1117',
  card:   '#161B22',
  border: '#30363D',
  cyan:   '#00F0FF',
  green:  '#00FF66',
  amber:  '#FFB800',
  red:    '#FF0055',
  slate:  '#4A5568',
  muted:  'rgba(255,255,255,0.45)',
  low:    'rgba(255,255,255,0.20)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Node visual config keyed by NodeStatus
// ─────────────────────────────────────────────────────────────────────────────
interface NodeVisual {
  stroke: string;
  fill:   string;
  glow:   string;
  label:  string;
  pulse:  boolean;
}

const NODE_VISUAL: Record<NodeStatus, NodeVisual> = {
  UNKNOWN:    { stroke: C.slate, fill: '#1A2030', glow: `${C.slate}44`, label: 'unknown',    pulse: false },
  HEALTHY:    { stroke: C.green, fill: '#0D2216', glow: `${C.green}55`, label: 'healthy',    pulse: false },
  FAULT:      { stroke: C.red,   fill: '#2A0A14', glow: `${C.red}66`,   label: 'fault',      pulse: true  },
  DEPENDENCY: { stroke: C.amber, fill: '#2A1F00', glow: `${C.amber}55`, label: 'dependency', pulse: true  },
  VERIFYING:  { stroke: C.cyan,  fill: '#001F2A', glow: `${C.cyan}55`,  label: 'verifying',  pulse: true  },
  RESOLVED:   { stroke: C.green, fill: '#0D2A16', glow: `${C.green}66`, label: 'resolved',   pulse: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// SVG canvas constants
// ─────────────────────────────────────────────────────────────────────────────
const SVG_W = 500;   // internal coordinate width
const SVG_H = 400;   // internal coordinate height
const CX    = SVG_W / 2;
const CY    = SVG_H / 2;

// Node circle radius
const R_NODE = 32;

// ─────────────────────────────────────────────────────────────────────────────
// Layout: place nodes on concentric rings
//
// Ring 0 (centre): fault node
// Ring 1: dependency nodes
// Ring 2: all other nodes
//
// Falls back to a single ring when there is no fault node.
// ─────────────────────────────────────────────────────────────────────────────
interface LayoutNode {
  node: RepoNode;
  cx:   number;
  cy:   number;
}

interface LayoutEdge {
  key:    string;
  x1:     number;
  y1:     number;
  x2:     number;
  y2:     number;
  color:  string;
  active: boolean;
}

function placeOnRing(
  items: RepoNode[],
  radius: number,
  originX: number,
  originY: number,
  angleOffset = 0,
): LayoutNode[] {
  if (items.length === 0) return [];
  const step = (2 * Math.PI) / items.length;
  return items.map((node, i) => ({
    node,
    cx: originX + radius * Math.cos(angleOffset + i * step - Math.PI / 2),
    cy: originY + radius * Math.sin(angleOffset + i * step - Math.PI / 2),
  }));
}

function edgeColor(fromStatus: NodeStatus, toStatus: NodeStatus, stage: WorkflowStage): string {
  if (stage === 'RESOLVED') return C.green;
  if (fromStatus === 'FAULT' || toStatus === 'FAULT') return C.red;
  if (fromStatus === 'DEPENDENCY' || toStatus === 'DEPENDENCY') return C.amber;
  return C.slate;
}

function computeLayout(
  nodes: RepoNode[],
  faultFile: string | undefined,
  dependencyFiles: string[],
  stage: WorkflowStage,
  importEdges: ImportEdge[],
): { layoutNodes: LayoutNode[]; edges: LayoutEdge[] } {
  if (nodes.length === 0) return { layoutNodes: [], edges: [] };

  const isFault = (n: RepoNode) =>
    !!faultFile && (n.label === faultFile || n.path.includes(faultFile));
  const isDep = (n: RepoNode) =>
    !isFault(n) &&
    dependencyFiles.some((d) => n.label === d || n.path.includes(d));

  const faultNodes = nodes.filter(isFault);
  const depNodes   = nodes.filter(isDep);
  const otherNodes = nodes.filter((n) => !isFault(n) && !isDep(n));

  const hasFault = faultNodes.length > 0;
  const hasDeps  = depNodes.length > 0;

  let layoutNodes: LayoutNode[] = [];

  if (!hasFault) {
    // All nodes on a single ring
    const ringR = Math.min(CX, CY) * 0.72;
    layoutNodes = placeOnRing(nodes, ringR, CX, CY);
  } else {
    // Fault in centre
    layoutNodes.push({ node: faultNodes[0], cx: CX, cy: CY });

    if (hasDeps) {
      // Deps on inner ring, others on outer ring
      const innerR = Math.min(CX, CY) * 0.42;
      const outerR = Math.min(CX, CY) * 0.78;
      layoutNodes.push(...placeOnRing(depNodes, innerR, CX, CY));
      layoutNodes.push(...placeOnRing(otherNodes, outerR, CX, CY));
    } else {
      // Others on single ring around fault
      const ringR = Math.min(CX, CY) * 0.65;
      layoutNodes.push(...placeOnRing(otherNodes, ringR, CX, CY));
    }
  }

  // Build edges
  const edges: LayoutEdge[] = [];
  const byPath = new Map<string, LayoutNode>();
  for (const ln of layoutNodes) {
    byPath.set(ln.node.id,    ln);
    byPath.set(ln.node.path,  ln);
    byPath.set(ln.node.label, ln);
  }

  if (importEdges.length > 0) {
    const seen = new Set<string>();
    for (const ie of importEdges) {
      const srcLn = byPath.get(ie.fromPath) ?? byPath.get(ie.fromPath.split('/').pop() ?? '');
      const dstLn = byPath.get(ie.toPath)   ?? byPath.get(ie.toPath.split('/').pop() ?? '');
      if (!srcLn || !dstLn || srcLn === dstLn) continue;
      const key = `${srcLn.node.id}→${dstLn.node.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const color  = edgeColor(srcLn.node.status, dstLn.node.status, stage);
      const active = color !== C.slate;
      edges.push({ key, x1: srcLn.cx, y1: srcLn.cy, x2: dstLn.cx, y2: dstLn.cy, color, active });
    }
  } else if (hasFault) {
    // Positional fallback: dep → fault, other → dep (or fault when no deps)
    const faultLn = layoutNodes.find((ln) => isFault(ln.node))!;
    for (const ln of layoutNodes) {
      if (ln === faultLn) continue;
      const target = hasDeps && !isDep(ln.node) ? layoutNodes.find((x) => isDep(x.node)) ?? faultLn : faultLn;
      const color  = edgeColor(ln.node.status, target.node.status, stage);
      const active = color !== C.slate;
      edges.push({ key: `${ln.node.id}→${target.node.id}`, x1: ln.cx, y1: ln.cy, x2: target.cx, y2: target.cy, color, active });
    }
  }

  return { layoutNodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// Framer Motion helpers
// ─────────────────────────────────────────────────────────────────────────────
const PULSE_TRANS: Transition = { duration: 1.6, repeat: Infinity, ease: 'easeInOut' as const };

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function EmptyGraph() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="7" stroke={C.low} strokeWidth="1.5" />
        <circle cx="8"  cy="10" r="4" stroke={C.low} strokeWidth="1.5" />
        <circle cx="32" cy="10" r="4" stroke={C.low} strokeWidth="1.5" />
        <circle cx="8"  cy="30" r="4" stroke={C.low} strokeWidth="1.5" />
        <circle cx="32" cy="30" r="4" stroke={C.low} strokeWidth="1.5" />
        <line x1="12" y1="13" x2="16" y2="17" stroke={C.low} strokeWidth="1.5" />
        <line x1="28" y1="13" x2="24" y2="17" stroke={C.low} strokeWidth="1.5" />
        <line x1="12" y1="27" x2="16" y2="23" stroke={C.low} strokeWidth="1.5" />
        <line x1="28" y1="27" x2="24" y2="23" stroke={C.low} strokeWidth="1.5" />
      </svg>
      <p className="text-xs" style={{ color: C.low }}>
        Load a repository to build the<br />dependency graph.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pan / Zoom state
// ─────────────────────────────────────────────────────────────────────────────
interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 3.0;
const ZOOM_STEP = 0.18;

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function CircuitGraph({
  nodes,
  faultFile,
  dependencyFiles = [],
  stage,
  importEdges = [],
}: CircuitGraphProps) {
  const { layoutNodes, edges } = useMemo(
    () => computeLayout(nodes, faultFile, dependencyFiles, stage, importEdges),
    [nodes, faultFile, dependencyFiles, stage, importEdges]
  );

  // ── Pan + Zoom state ───────────────────────────────────────────────────────
  const [xform, setXform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only pan on primary button; ignore clicks on nodes themselves
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: xform.x, origY: xform.y };
  }, [xform]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setXform((prev) => ({ ...prev, x: dragRef.current!.origX + dx, y: dragRef.current!.origY + dy }));
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  // Wheel zoom — zoom towards cursor position
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setXform((prev) => {
      const nextScale = clampScale(prev.scale + delta);
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: mouseX - ratio * (mouseX - prev.x),
        y: mouseY - ratio * (mouseY - prev.y),
      };
    });
  }, []);

  const zoomIn  = () => setXform((p) => ({ ...p, scale: clampScale(p.scale + ZOOM_STEP) }));
  const zoomOut = () => setXform((p) => ({ ...p, scale: clampScale(p.scale - ZOOM_STEP) }));
  const resetView = () => setXform({ x: 0, y: 0, scale: 1 });

  if (nodes.length === 0) {
    return (
      <div className="relative flex flex-col overflow-hidden rounded-2xl" style={{ minHeight: 320 }}>
        <CircuitBackground />
        <div className="relative z-10 flex flex-1 flex-col"><EmptyGraph /></div>
      </div>
    );
  }

  const isFault = (n: RepoNode) =>
    !!faultFile && (n.label === faultFile || n.path.includes(faultFile));

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl select-none"
      style={{ height: 360, width: '100%', cursor: dragRef.current ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      <CircuitBackground />

      {/* ── Zoom controls ────────────────────────────────────────────────────── */}
      <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-1" style={{ pointerEvents: 'all' }}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); zoomIn(); }}
          className="flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold text-white transition-colors hover:border-white/40"
          style={{ background: '#161B22', borderColor: '#30363D' }}
          aria-label="Zoom in"
        >+</button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); zoomOut(); }}
          className="flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold text-white transition-colors hover:border-white/40"
          style={{ background: '#161B22', borderColor: '#30363D' }}
          aria-label="Zoom out"
        >−</button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); resetView(); }}
          className="flex h-6 w-6 items-center justify-center rounded-md border text-[9px] font-bold text-white transition-colors hover:border-white/40"
          style={{ background: '#161B22', borderColor: '#30363D' }}
          aria-label="Reset view"
          title="Reset view"
        >⟳</button>
      </div>

      {/* ── Hint label ───────────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute bottom-3 left-3 z-30 text-[9px]"
        style={{ color: 'rgba(255,255,255,0.2)' }}
      >
        drag · scroll to zoom
      </div>

      {/* ── Stage pill ───────────────────────────────────────────────────────── */}
      {stage !== 'IDLE' && (
        <div
          className="absolute top-2 right-3 z-30 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ borderColor: `${C.cyan}44`, background: `${C.cyan}0C`, color: C.cyan }}
        >
          {stage}
        </div>
      )}

      {/* ── SVG canvas (pan+zoom applied via group transform) ─────────────────── */}
      <svg
        className="absolute inset-0 z-10 w-full h-full"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          {(['red','amber','cyan','green','slate'] as const).map((name) => {
            const col = name === 'red' ? C.red : name === 'amber' ? C.amber : name === 'cyan' ? C.cyan : name === 'green' ? C.green : C.slate;
            return (
              <marker key={name} id={`arr-${name}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill={col} opacity="0.8" />
              </marker>
            );
          })}
          {/* Radial glow filters per colour */}
          <filter id="glow-red"   x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="glow-cyan"  x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* Pan+zoom group */}
        <g transform={`translate(${xform.x} ${xform.y}) scale(${xform.scale})`}
           style={{ transformOrigin: `${CX}px ${CY}px` }}>

          {/* ── Edges ─────────────────────────────────────────────────────── */}
          <AnimatePresence>
            {edges.map(({ key, x1, y1, x2, y2, color, active }) => {
              const markerId =
                color === C.red ? 'arr-red' : color === C.amber ? 'arr-amber' :
                color === C.cyan ? 'arr-cyan' : color === C.green ? 'arr-green' : 'arr-slate';

              // Shorten line to stop at node perimeter
              const dx = x2 - x1; const dy = y2 - y1;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const pad = R_NODE + 4;
              const sx = x1 + (dx / dist) * pad;
              const sy = y1 + (dy / dist) * pad;
              const ex = x2 - (dx / dist) * pad;
              const ey = y2 - (dy / dist) * pad;

              return (
                <motion.line
                  key={key}
                  x1={sx} y1={sy} x2={ex} y2={ey}
                  stroke={color}
                  strokeWidth={active ? 1.4 : 0.7}
                  strokeOpacity={active ? 0.9 : 0.3}
                  strokeDasharray={active ? '5 3' : undefined}
                  markerEnd={`url(#${markerId})`}
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: active ? 0.9 : 0.3,
                    strokeDashoffset: active ? [0, -16] : 0,
                  }}
                  transition={{
                    opacity: { duration: 0.4 },
                    strokeDashoffset: { duration: 1.4, repeat: Infinity, ease: 'linear' as const },
                  }}
                />
              );
            })}
          </AnimatePresence>

          {/* ── Nodes ─────────────────────────────────────────────────────── */}
          <AnimatePresence>
            {layoutNodes.map(({ node, cx, cy }) => {
              const vis    = NODE_VISUAL[node.status];
              const fault  = isFault(node);
              const r      = fault ? R_NODE + 6 : R_NODE;
              const filterId =
                vis.stroke === C.red   ? 'glow-red'   :
                vis.stroke === C.amber ? 'glow-amber' :
                vis.stroke === C.green ? 'glow-green' :
                vis.stroke === C.cyan  ? 'glow-cyan'  : undefined;

              // Truncate label to fit inside circle
              const maxChars = fault ? 10 : 8;
              const displayLabel = node.label.length > maxChars
                ? node.label.slice(0, maxChars - 1) + '…'
                : node.label;

              return (
                <motion.g
                  key={node.id}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: 'spring' as const, stiffness: 260, damping: 22 }}
                  style={{ transformOrigin: `${cx}px ${cy}px`, pointerEvents: 'auto' }}
                >
                  <title>{node.label}</title>
                  {/* Glow ring for active nodes */}
                  {vis.pulse && (
                    <motion.circle
                      cx={cx} cy={cy} r={r + 8}
                      fill="none"
                      stroke={vis.stroke}
                      strokeWidth={1.5}
                      strokeOpacity={0.3}
                      animate={{ r: [r + 6, r + 14, r + 6], strokeOpacity: [0.4, 0.1, 0.4] }}
                      transition={PULSE_TRANS}
                    />
                  )}

                  {/* Node circle */}
                  <circle
                    cx={cx} cy={cy} r={r}
                    fill={vis.fill}
                    stroke={vis.stroke}
                    strokeWidth={fault ? 2.5 : 1.8}
                    filter={filterId ? `url(#${filterId})` : undefined}
                  />

                  {/* Status dot (top-right) */}
                  <motion.circle
                    cx={cx + r * 0.68} cy={cy - r * 0.68} r={4}
                    fill={vis.stroke}
                    animate={vis.pulse ? { r: [3.5, 5.5, 3.5], opacity: [1, 0.5, 1] } : { r: 3.5 }}
                    transition={vis.pulse ? { duration: 1.4, repeat: Infinity } : {}}
                  />

                  {/* Label */}
                  <text
                    x={cx} y={cy - 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fault ? 9 : 8}
                    fontWeight="700"
                    fontFamily="var(--font-mono, monospace)"
                    fill="white"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {displayLabel}
                  </text>

                  {/* Status label */}
                  <text
                    x={cx} y={cy + 9}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={6.5}
                    fontWeight="600"
                    fontFamily="var(--font-mono, monospace)"
                    fill={vis.stroke}
                    style={{ pointerEvents: 'none', userSelect: 'none', textTransform: 'uppercase' }}
                  >
                    {vis.label}
                  </text>
                </motion.g>
              );
            })}
          </AnimatePresence>
        </g>
      </svg>
    </div>
  );
}
