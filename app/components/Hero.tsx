'use client';

import { useCallback } from 'react';
import { ArrowRight, GitBranch, ChevronDown } from 'lucide-react';

export default function Hero() {
  const scrollToDemo = useCallback(() => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToArchitecture = useCallback(() => {
    document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <section className="relative flex min-h-[calc(100vh-56px)] flex-col items-center justify-center overflow-hidden px-4 py-24 text-center sm:px-6">

      {/* ── Ambient background grid ─────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#00F0FF 1px, transparent 1px), linear-gradient(90deg, #00F0FF 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden="true"
      />

      {/* ── Radial glow centred behind headline ─────────────────────────────── */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,240,255,0.07) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-w-4xl flex-col items-center gap-8">

        {/* ── Badge ────────────────────────────────────────────────────────── */}
        <span
          className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
          style={{
            borderColor: 'rgba(0,240,255,0.3)',
            background: 'rgba(0,240,255,0.06)',
            color: '#00F0FF',
          }}
        >
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: '#00F0FF' }}
            aria-hidden="true"
          />
          Powered by IBM Bob 2.0 Code Intelligence
        </span>

        {/* ── Headline ─────────────────────────────────────────────────────── */}
        <h1
          className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
          style={{ fontFamily: 'var(--font-inter, sans-serif)' }}
        >
          <span className="text-white">Lumina: Autonomous</span>
          <br />
          <span
            style={{
              color: '#00F0FF',
              textShadow: '0 0 32px rgba(0,240,255,0.5)',
            }}
          >
            Incident Triage
          </span>
          <span className="text-white"> &amp; Dynamic</span>
          <br />
          <span className="text-white">Circuit Visualizer</span>
        </h1>

        {/* ── Value proposition ────────────────────────────────────────────── */}
        <p className="max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Lumina ingests repositories and incident logs, builds real dependency graphs 
          from source code imports, correlates stack traces to actual files and lines, 
          and generates code-aware remediation recommendations based on the affected source context.
        </p>

        {/* ── MTTR Callout ─────────────────────────────────────────────────── */}
        <div
          className="flex flex-col items-center gap-1 rounded-2xl border px-8 py-5"
          style={{
            background: '#161B22',
            borderColor: '#30363D',
          }}
        >
          <div className="flex items-baseline gap-4">
            <div className="text-center">
              <span
                className="block text-4xl font-black tabular-nums"
                style={{ color: '#FF0055', textShadow: '0 0 20px rgba(255,0,85,0.4)' }}
              >
                2.5 hrs
              </span>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Avg Investigation Time
              </span>
            </div>

            <span className="text-2xl font-light text-white/20">→</span>

            <div className="text-center">
              <span
                className="block text-4xl font-black tabular-nums"
                style={{ color: '#00FF66', textShadow: '0 0 20px rgba(0,255,102,0.4)' }}
              >
                Seconds
              </span>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                to Root Cause Discovery
              </span>
            </div>
          </div>

          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Accelerate incident diagnosis through repository-aware dependency analysis and source-code correlation.
          </p>
        </div>

        {/* ── CTA buttons ──────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={scrollToDemo}
            className="flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-bold transition-all duration-200 hover:opacity-90 active:scale-95"
            style={{
              background: '#00F0FF',
              color: '#0E1117',
              boxShadow: '0 0 24px rgba(0,240,255,0.4)',
            }}
          >
            <ArrowRight size={15} aria-hidden="true" />
            Launch Interactive Demo
          </button>

          <button
            onClick={scrollToArchitecture}
            className="flex items-center gap-2 rounded-lg border px-6 py-3 text-sm font-semibold text-white/70 transition-all duration-200 hover:text-white hover:bg-white/5"
            style={{ borderColor: '#30363D' }}
          >
            <GitBranch size={15} aria-hidden="true" />
            View Architecture
          </button>
        </div>
      </div>

      {/* ── Scroll hint ─────────────────────────────────────────────────────── */}
      <button
        onClick={scrollToDemo}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce opacity-30 hover:opacity-60 transition-opacity"
        aria-label="Scroll down"
      >
        <ChevronDown size={24} color="white" />
      </button>
    </section>
  );
}
