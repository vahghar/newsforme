'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function HomePage() {


  return (
    <div className="min-h-screen bg-[#090b0f] text-white flex flex-col">
      <Navbar />

      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 pt-16 pb-28">
        <div className="max-w-3xl text-center">

          <h1 className="text-6xl md:text-7xl font-serif font-bold tracking-tight leading-[1.05] mb-8 text-white">
            News for people who
            <br />
            <span className="italic font-serif text-white/50">
              are lazy like me
            </span>
          </h1>

          <p className="text-white/55 text-base md:text-lg leading-relaxed mb-14 max-w-xl mx-auto">
            A multi-agent AI system that reads the terrifyingly complex news and dumbs it
            down to layman terms so you can pretend to be informed at parties.
          </p>

          <Link
            href="/news"
            className="inline-flex items-center gap-2 px-9 py-4 rounded-full font-mono text-sm font-semibold tracking-widest transition-all duration-200 border border-white/20 text-white hover:border-white/60 hover:bg-white/5"
          >
            Read Today's Briefing →
          </Link>
        </div>
      </main>
    </div>
  );
}