'use client';

import { GitFork, ExternalLink, Zap } from 'lucide-react';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="w-full border-t"
      style={{ background: '#0E1117', borderColor: '#30363D' }}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">

        {/* ── Main footer grid ───────────────────────────────────────────── */}
        <div className="grid gap-10 sm:grid-cols-3">

          {/* Brand column */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: '#00F0FF' }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ background: '#00F0FF' }}
                />
              </span>
              <span
                className="text-sm font-bold tracking-tight"
                style={{ fontFamily: 'var(--font-mono, monospace)', color: '#00F0FF' }}
              >
                Lumina
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Autonomous Log Triage &amp; Dynamic Circuit Visualizer.
              Built for the IBM Bob 2.0 Hackathon.
            </p>

            {/* Live indicator badge */}
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
              style={{
                borderColor: 'rgba(0,255,102,0.3)',
                background: 'rgba(0,255,102,0.06)',
                color: '#00FF66',
              }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: '#00FF66' }}
                aria-hidden="true"
              />
              Live Application
            </span>
          </div>

          {/* Links column */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Resources
            </p>
            <a
              href="https://github.com/febeFlo/lumina-autonomous-triage"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm transition-colors hover:text-white"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <GitFork size={14} aria-hidden="true" />
              GitHub Repository
            </a>
            <a
              href="#demo"
              className="flex items-center gap-2 text-sm transition-colors hover:text-white"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Live Demo
            </a>
            <a
              href="#architecture"
              className="flex items-center gap-2 text-sm transition-colors hover:text-white"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Architecture Overview
            </a>
          </div>

          {/* Hackathon credits column */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Credits
            </p>

            <div
              className="rounded-xl border p-4"
              style={{
                background: 'rgba(0,240,255,0.04)',
                borderColor: 'rgba(0,240,255,0.15)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap size={12} style={{ color: '#00F0FF' }} aria-hidden="true" />
                <span className="text-xs font-semibold" style={{ color: '#00F0FF' }}>
                  IBM Bob 2.0 Hackathon
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Built with IBM Bob 2.0 — leveraging repository intelligence, dependency analysis, 
                stack trace correlation, and code-aware remediation workflows.
              </p>
            </div>
          </div>
        </div>

        {/* ── Bottom bar ─────────────────────────────────────────────────── */}
        <div
          className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row"
          style={{ borderColor: '#30363D' }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            © {year} Lumina. IBM Bob 2.0 Hackathon Submission.
          </p>
          <p
            className="text-xs"
            style={{ fontFamily: 'var(--font-mono, monospace)', color: 'rgba(255,255,255,0.2)' }}
          >
            Next.js · Tailwind CSS · TypeScript · lucide-react
          </p>
        </div>
      </div>
    </footer>
  );
}
