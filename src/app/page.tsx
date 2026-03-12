'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#090b0f] text-white flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col justify-center items-center px-6 pt-20 pb-32">
        <div className="max-w-2xl text-center">
          <span className="text-[10px] font-mono text-white/60 uppercase tracking-[0.2em] mb-6 block">
            AI-Narrated Intelligence
          </span>

          <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight mb-8 text-white">
            News for people who{' '}
            <br />
            <span className="text-white/25 italic">are lazy like me</span>
          </h1>

          <p className="text-white/40 text-base md:text-lg leading-relaxed font-medium mb-12 max-w-xl mx-auto">
            A multi-agent AI system that reads the terrifyingly complex news and dumbs it down to layman terms so you can pretend to be informed at parties.
          </p>

          <Link
            href="/news"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-mono text-sm font-semibold tracking-wide transition-all border border-white/30 text-white hover:bg-white/10"
          >
            Read Today's Briefing →
          </Link>
        </div>

        <div className="mt-24 w-full max-w-3xl px-8 py-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono text-white/60 uppercase tracking-widest block mb-1">Live Editions</span>
            <p className="text-white/40 text-sm font-mono">Technology · Finance · World News</p>
          </div>
        </div>
      </main>
    </div>
  );
}