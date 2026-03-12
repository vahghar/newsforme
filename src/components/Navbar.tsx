'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const path = usePathname();

  const links = [
    { href: '/', label: 'Explore' },
    { href: '/news', label: 'News' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#090b0f]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-[#00ff9d] font-mono font-bold text-lg tracking-tight">FLARIO</span>
          <span className="text-white/30 text-xs font-mono mt-0.5">/ agentverse intel</span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-4 py-1.5 rounded-md text-sm font-mono transition-all ${
                path === l.href
                  ? 'bg-[#00ff9d]/10 text-[#00ff9d] border border-[#00ff9d]/30'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}