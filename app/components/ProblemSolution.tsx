'use client';

import { XCircle, CheckCircle, AlertTriangle, Clock, Search, Cpu, Layers, ShieldCheck } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

interface PainPoint {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface Benefit {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const PAIN_POINTS: PainPoint[] = [
  {
    icon: <Clock size={16} />,
    title: 'High Mean-Time-to-Resolution',
    description: 'Engineers spend 2–3 hours per incident manually hunting through thousands of log lines.',
  },
  {
    icon: <Search size={16} />,
    title: 'Log Hunting Fatigue',
    description: 'Sifting raw stack traces across distributed services burns cognitive bandwidth and creates alert fatigue.',
  },
  {
    icon: <Cpu size={16} />,
    title: 'Context-Window Bloat',
    description: 'Feeding entire codebases into a single LLM context wastes tokens and degrades response quality.',
  },
  {
    icon: <AlertTriangle size={16} />,
    title: 'Static CI/CD Limitations',
    description: 'Pipeline checks run fixed scripts — unable to adapt to novel error patterns or dynamic dependency chains.',
  },
];

const BENEFITS: Benefit[] = [
  {
    icon: <Layers size={16} />,
    title: 'Repository-Aware Log Analysis',
    description: "Lumina correlates stack traces directly against uploaded repositories to identify real fault locations and dependency paths.",
  },
  {
    icon: <Search size={16} />,
    title: 'Dependency Graph Construction',
    description: 'Import relationships are extracted from source code to build a navigable dependency graph of the affected application.',
  },
  {
    icon: <Cpu size={16} />,
    title: 'Source-Code Correlation',
    description: 'Every stack trace frame is mapped back to actual files, line numbers, and code surrounding the failure.',
  },
  {
    icon: <ShieldCheck size={16} />,
    title: 'Code-Aware Remediation',
    description: 'Patch recommendations are generated from the actual source context instead of static error templates.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ProblemSolution() {
  return (
    <section
      id="architecture"
      className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
    >
      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="mb-12 text-center">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: '#00F0FF' }}
        >
          The Problem &amp; Solution
        </p>
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
          Why Traditional Triage Fails — and How Lumina Fixes It
        </h2>
      </div>

      {/* ── Two-column grid ────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── LEFT: Problem card ──────────────────────────────────────────── */}
        <div
          className="flex flex-col gap-6 rounded-2xl border p-6 sm:p-8"
          style={{
            background: 'linear-gradient(135deg, rgba(255,0,85,0.06) 0%, #161B22 60%)',
            borderColor: 'rgba(255,0,85,0.25)',
          }}
        >
          {/* Card header */}
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(255,0,85,0.12)' }}
            >
              <XCircle size={18} style={{ color: '#FF0055' }} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#FF0055' }}>
                Before Lumina
              </p>
              <h3 className="text-base font-bold text-white">The Manual Bottleneck Today</h3>
            </div>
          </div>

          {/* Pain points */}
          <ul className="flex flex-col gap-4">
            {PAIN_POINTS.map(({ icon, title, description }) => (
              <li
                key={title}
                className="flex gap-3 rounded-xl border p-4"
                style={{
                  background: 'rgba(255,0,85,0.04)',
                  borderColor: 'rgba(255,0,85,0.12)',
                }}
              >
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: '#FF0055' }}
                  aria-hidden="true"
                >
                  {icon}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Bottom stat */}
          <div
            className="flex items-center justify-between rounded-xl border px-4 py-3"
            style={{ borderColor: 'rgba(255,0,85,0.2)', background: 'rgba(255,0,85,0.05)' }}
          >
            <span className="text-xs text-white/40">Avg. resolution time</span>
            <span
              className="text-xl font-black tabular-nums"
              style={{ color: '#FF0055', textShadow: '0 0 12px rgba(255,0,85,0.4)' }}
            >
              2.5 hours
            </span>
          </div>
        </div>

        {/* ── RIGHT: Solution card ─────────────────────────────────────────── */}
        <div
          className="flex flex-col gap-6 rounded-2xl border p-6 sm:p-8"
          style={{
            background: 'linear-gradient(135deg, rgba(0,240,255,0.06) 0%, #161B22 60%)',
            borderColor: 'rgba(0,240,255,0.25)',
          }}
        >
          {/* Card header */}
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(0,240,255,0.12)' }}
            >
              <CheckCircle size={18} style={{ color: '#00F0FF' }} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#00F0FF' }}>
                After Lumina
              </p>
              <h3 className="text-base font-bold text-white">The Lumina Autonomous Workflow</h3>
            </div>
          </div>

          {/* Benefits */}
          <ul className="flex flex-col gap-4">
            {BENEFITS.map(({ icon, title, description }) => (
              <li
                key={title}
                className="flex gap-3 rounded-xl border p-4"
                style={{
                  background: 'rgba(0,240,255,0.04)',
                  borderColor: 'rgba(0,240,255,0.12)',
                }}
              >
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: '#00FF66' }}
                  aria-hidden="true"
                >
                  {icon}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Bottom stat */}
          <div
            className="flex items-center justify-between rounded-xl border px-4 py-3"
            style={{ borderColor: 'rgba(0,255,102,0.2)', background: 'rgba(0,255,102,0.05)' }}
          >
            <span className="text-xs text-white/40">Avg. resolution time</span>
            <span
              className="text-xl font-black tabular-nums"
              style={{ color: '#00FF66', textShadow: '0 0 12px rgba(0,255,102,0.4)' }}
            >
              seconds
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
