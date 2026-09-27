'use client';

// ─────────────────────────────────────────────────────────────────────────────
// CircuitBackground
//
// A purely decorative cyberpunk background layer.
// Composed of:
//   1. Deep dark base (#0E1117)
//   2. Radial cyan glow centred in the panel
//   3. Subtle dot-grid
//   4. SVG circuit traces (horizontal + vertical line segments)
//   5. Randomised neon connection lines with varying opacity
//
// Everything is pointer-events-none so it never interferes with overlaid UI.
// The component is self-contained — no props required.
// ─────────────────────────────────────────────────────────────────────────────

const TRACES = [
  // [x1, y1, x2, y2, opacity]  — as % of the container
  [0,   18,  35,  18,  0.18],
  [35,  18,  35,  42,  0.18],
  [35,  42,  65,  42,  0.22],
  [65,  42,  65,  68,  0.18],
  [65,  68, 100,  68,  0.15],
  [20,   0,  20,  35,  0.12],
  [80,  55,  80, 100,  0.12],
  [50,   0,  50,  20,  0.10],
  [10,  70,  40,  70,  0.10],
  [60,  85, 100,  85,  0.08],
] as const;

// Small filled squares that simulate solder points / junctions
const JUNCTIONS = [
  [35, 18],
  [35, 42],
  [65, 42],
  [65, 68],
  [20, 35],
  [80, 55],
  [50, 20],
] as const;

export default function CircuitBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      style={{ background: '#0E1117' }}
    >
      {/* ── 1. Radial cyan glow ─────────────────────────────────────────────── */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width:        '120%',
          height:       '120%',
          borderRadius: '50%',
          background:   'radial-gradient(ellipse at center, rgba(0,240,255,0.055) 0%, transparent 65%)',
        }}
      />

      {/* ── 2. Dot grid ─────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:  'radial-gradient(circle, #00F0FF 1px, transparent 1px)',
          backgroundSize:   '28px 28px',
        }}
      />

      {/* ── 3 + 4. SVG circuit traces + junctions + neon lines ─────────────── */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Circuit traces */}
        {TRACES.map(([x1, y1, x2, y2, opacity], i) => (
          <line
            key={`trace-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#00F0FF"
            strokeWidth="0.25"
            strokeOpacity={opacity}
          />
        ))}

        {/* Junction dots */}
        {JUNCTIONS.map(([cx, cy], i) => (
          <rect
            key={`jct-${i}`}
            x={cx - 0.6}
            y={cy - 0.6}
            width="1.2"
            height="1.2"
            fill="#00F0FF"
            opacity={0.25}
          />
        ))}

        {/* Neon diagonal accent lines */}
        <line x1="0"   y1="100" x2="30"  y2="60"  stroke="#00F0FF" strokeWidth="0.15" strokeOpacity="0.07" />
        <line x1="100" y1="0"   x2="70"  y2="40"  stroke="#00F0FF" strokeWidth="0.15" strokeOpacity="0.07" />
        <line x1="0"   y1="50"  x2="20"  y2="30"  stroke="#00FF66" strokeWidth="0.15" strokeOpacity="0.05" />
        <line x1="100" y1="80"  x2="75"  y2="95"  stroke="#FFB800" strokeWidth="0.15" strokeOpacity="0.05" />
      </svg>

      {/* ── 5. Subtle vignette to soften panel edges ─────────────────────────── */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(14,17,23,0.55) 100%)',
        }}
      />
    </div>
  );
}
