'use client';

import { useCallback } from 'react';
import { Zap } from 'lucide-react';

interface NavLink {
  label: string;
  href: string;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Architecture', href: '#architecture' },
  { label: 'Demo',         href: '#demo'         },
  { label: 'Features',     href: '#features'     },
  { label: 'Metrics',      href: '#metrics'      },
];

export default function Header() {
  const scrollToDemo = useCallback(() => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <header
      className="sticky top-0 z-50 w-full border-b"
      style={{
        background: 'rgba(14,17,23,0.85)',
        backdropFilter: 'saturate(180%) blur(12px)',
        WebkitBackdropFilter: 'saturate(180%) blur(12px)',
        borderColor: '#30363D',
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

        {/* ── Logo ─────────────────────────────────────────────────────────── */}
        <a
          href="#"
          className="flex items-center gap-2.5 select-none"
          aria-label="Lumina home"
        >
          {/* Pulsing cyan indicator dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: '#00F0FF' }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ background: '#00F0FF' }}
            />
          </span>

          <span
            className="text-base font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-mono, monospace)', color: '#00F0FF' }}
          >
            Lumina
          </span>

          <span className="hidden text-xs text-white/30 sm:block">
            / Autonomous Triage
          </span>
        </a>

        {/* ── Center nav ───────────────────────────────────────────────────── */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white hover:bg-white/5"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <button
          onClick={scrollToDemo}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-95"
          style={{
            background: '#00F0FF',
            color: '#0E1117',
            boxShadow: '0 0 16px rgba(0,240,255,0.35)',
          }}
          aria-label="Scroll to live demo section"
        >
          <Zap size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Run Live Demo</span>
          <span className="sm:hidden">Demo</span>
        </button>
      </div>
    </header>
  );
}
