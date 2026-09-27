'use client';

import { TrendingDown, Cpu, ShieldCheck } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

interface Metric {
  icon: React.ReactNode;
  accentColor: string;
  value: string;
  label: string;
  sublabel: string;
}

const METRICS: Metric[] = [
  {
    icon: <TrendingDown size={24} />,
    accentColor: '#00FF66',
    value: 'Repo',
    label: 'Repository-Aware',
    sublabel: 'Maps stack traces directly to source files, lines, and dependencies',
  },
  {
    icon: <Cpu size={24} />,
    accentColor: '#00F0FF',
    value: 'AST',
    label: 'Graph Construction',
    sublabel: 'Builds dependency relationships from actual import analysis',
  },
  {
    icon: <ShieldCheck size={24} />,
    accentColor: '#FFB800',
    value: 'Code',
    label: 'Context-Aware',
    sublabel: 'Remediation recommendations generated from real source context',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ImpactMetrics() {
  return (
    <section
      id="metrics"
      className="w-full border-y py-20"
      style={{ borderColor: '#30363D', background: '#161B22' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── Section header ──────────────────────────────────────────────── */}
        <div className="mb-12 text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: '#00F0FF' }}
          >
            Quantified ROI
          </p>
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Impact Metrics
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-sm leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Measured across autonomous triage runs on production-scale microservice repositories.
          </p>
        </div>

        {/* ── Metrics row ────────────────────────────────────────────────── */}
        <div className="grid gap-6 sm:grid-cols-3">
          {METRICS.map(({ icon, accentColor, value, label, sublabel }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-4 rounded-2xl border p-8 text-center"
              style={{
                background: '#0E1117',
                borderColor: `${accentColor}28`,
                boxShadow: `0 0 32px ${accentColor}0C`,
              }}
            >
              {/* Icon badge */}
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  background: `${accentColor}16`,
                  color: accentColor,
                  boxShadow: `0 0 16px ${accentColor}28`,
                }}
                aria-hidden="true"
              >
                {icon}
              </span>

              {/* Big stat value */}
              <div>
                <p
                  className="text-5xl font-black tabular-nums"
                  style={{
                    color: accentColor,
                    textShadow: `0 0 28px ${accentColor}55`,
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {value}
                </p>
                <p className="mt-1 text-base font-bold text-white">{label}</p>
              </div>

              {/* Sublabel */}
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {sublabel}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
