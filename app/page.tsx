import Header         from '@/app/components/Header';
import Hero           from '@/app/components/Hero';
import ProblemSolution from '@/app/components/ProblemSolution';
import InteractiveDemo from '@/app/components/InteractiveDemo';
import BobTechStack   from '@/app/components/BobTechStack';
import ImpactMetrics  from '@/app/components/ImpactMetrics';
import Footer         from '@/app/components/Footer';

export default function Home() {
  return (
    <>
      {/* ── Sticky navigation ─────────────────────────────────────────────── */}
      <Header />

      <main className="flex flex-col w-full" style={{ background: '#0E1117' }}>

        {/* 1 — Hero ────────────────────────────────────────────────────────── */}
        <Hero />

        {/* 2 — Problem / Solution (#architecture) ─────────────────────────── */}
        <ProblemSolution />

        {/* 3 — Interactive Demo (#demo) ────────────────────────────────────── */}
        <section id="demo" className="w-full">
          <InteractiveDemo />
        </section>

        {/* 4 — IBM Bob 2.0 Tech Stack (#features) ─────────────────────────── */}
        <BobTechStack />

        {/* 5 — Impact Metrics (#metrics) ──────────────────────────────────── */}
        <ImpactMetrics />

      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <Footer />
    </>
  );
}
