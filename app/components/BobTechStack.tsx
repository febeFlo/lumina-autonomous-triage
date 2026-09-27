'use client';

import { FileText, GitBranch, Users, Terminal } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

interface TechCard {
  icon: React.ReactNode;
  accentColor: string;
  tag: string;
  title: string;
  description: string;
  bullets: string[];
}

const CARDS: TechCard[] = [
  {
    icon: <FileText size={22} />,
    accentColor: '#00F0FF',
    tag: 'Ingestion',
    title: 'Repository Intelligence',
    description:
      "Repository source files are ingested and indexed so incidents can be correlated directly to files, imports, and code relationships.",
    bullets: [
      'GitHub repository ingestion',
      'Local project folder ingestion',
      'Source file indexing',
    ],
  },
  {
    icon: <GitBranch size={22} />,
    accentColor: '#FFB800',
    tag: 'Planning',
    title: 'Dependency Analysis',
    description:
      'Lumina analyzes imports and references to construct a dependency graph based on actual source-code relationships.',
    bullets: [
      'Import analysis',
      'Dependency graph generation',
      'Fault-path visualization',
    ],
  },
  {
    icon: <Users size={22} />,
    accentColor: '#00FF66',
    tag: 'Execution',
    title: 'Incident Correlation',
    description:
      'Stack traces are matched directly against repository files, allowing rapid root-cause localization.',
    bullets: [
      'Multi-language stack trace parsing',
      'File and line correlation',
      'Dependency chain identification',
    ],
  },
  {
    icon: <Terminal size={22} />,
    accentColor: '#FF0055',
    tag: 'Verification',
    title: 'Code-Aware Remediation',
    description:
      "Recommended fixes are generated from the actual source context surrounding the fault, rather than from static error templates.",
    bullets: [
      'Context-aware diff generation',
      'Source-code classification',
      'Root-cause recommendations',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BobTechStack() {
  return (
    <section
      id="features"
      className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
    >
      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="mb-12 text-center">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: '#00F0FF' }}
        >
          Powered By
        </p>
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
          IBM Bob 2.0 Feature Stack
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Lumina is architected around four core IBM Bob 2.0 capabilities, each handling a distinct phase of the autonomous triage pipeline.
        </p>
      </div>

      {/* ── Cards grid ─────────────────────────────────────────────────────── */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ icon, accentColor, tag, title, description, bullets }) => (
          <div
            key={title}
            className="group flex flex-col gap-5 rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1"
            style={{
              background: '#161B22',
              borderColor: '#30363D',
              boxShadow: 'none',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = `${accentColor}44`;
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 24px ${accentColor}18`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = '#30363D';
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            {/* Icon + tag row */}
            <div className="flex items-start justify-between">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: `${accentColor}18`,
                  color: accentColor,
                }}
                aria-hidden="true"
              >
                {icon}
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  background: `${accentColor}14`,
                  color: accentColor,
                }}
              >
                {tag}
              </span>
            </div>

            {/* Title + description */}
            <div>
              <h3 className="mb-2 text-base font-bold text-white">{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {description}
              </p>
            </div>

            {/* Bullet list */}
            <ul className="mt-auto flex flex-col gap-2">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                    style={{ background: accentColor }}
                    aria-hidden="true"
                  />
                  <span
                    style={{ fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    {bullet}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
