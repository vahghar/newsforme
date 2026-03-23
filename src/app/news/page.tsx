'use client';

import { useEffect, useState, useRef } from 'react';
import Navbar from '@/components/Navbar';

const CATEGORIES = ['tech', 'finance', 'world'] as const;
type Category = typeof CATEGORIES[number];

interface Story {
  headline: string;
  summary: string;
  context: string;
  why_it_matters: string;
  other_side: string;
  source: string;
  time: string;
}

interface CategoryData {
  stories: Story[];
  loading: boolean;
  page: number;
  error?: string;
}

const CATEGORY_META: Record<Category, { label: string; accent: string }> = {
  tech: { label: 'Technology', accent: '#00ff9d' },
  finance: { label: 'Finance', accent: '#f59e0b' },
  world: { label: 'World', accent: '#60a5fa' },
};

function StoryCard({ story, accent, isFinance }: { story: Story; accent: string; isFinance?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // ASI Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Market Impact State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactStream, setImpactStream] = useState('');

  // Truth Checker State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verificationStream, setVerificationStream] = useState('');
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);

  // Restore states from cache on mount
  useEffect(() => {
    const savedVerify = sessionStorage.getItem(`verify_${story.headline}`);
    if (savedVerify) {
      try {
        const parsed = JSON.parse(savedVerify);
        setVerificationStream(parsed.verificationStream);
        setVerifyStatus(parsed.verifyStatus);
      } catch (e) {}
    }

    const savedImpact = sessionStorage.getItem(`impact_${story.headline}`);
    if (savedImpact) {
      setImpactStream(savedImpact);
    }

    const savedChat = sessionStorage.getItem(`chat_${story.headline}`);
    if (savedChat) {
      try {
        setMessages(JSON.parse(savedChat));
      } catch (e) {}
    }
  }, [story.headline]);

  // Save chat to cache whenever it updates
  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem(`chat_${story.headline}`, JSON.stringify(messages));
    }
  }, [messages, story.headline]);

  // Auto-scroll chat to bottom only if user is already near the bottom
  useEffect(() => {
    if (chatEndRef.current && chatEndRef.current.parentElement) {
      const parent = chatEndRef.current.parentElement;
      const isNearBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 150;
      if (isNearBottom) {
        chatEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
    }
  }, [messages, isTyping]);

  const startMarketImpact = async () => {
    if (isAnalyzing || impactStream) {
      setImpactOpen(!impactOpen);
      return;
    }

    setImpactOpen(true);
    setIsAnalyzing(true);
    setImpactStream('');

    try {
      const response = await fetch('/api/market-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          headline: story.headline,
          summary: story.summary
        })
      });

      if (!response.body) throw new Error('No readable stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                setImpactStream(fullText);
              }
            } catch (ignore) { }
          }
        }
      }
      
      if (fullText) {
        sessionStorage.setItem(`impact_${story.headline}`, fullText);
      }
    } catch (e: any) {
      console.error('Market Impact error:', e);
      setImpactStream('Failed to run technical analysis. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startVerification = async () => {
    if (isVerifying || verifyStatus) {
      setVerifyOpen(!verifyOpen);
      return;
    }

    setVerifyOpen(true);
    setIsVerifying(true);
    setVerificationStream('');

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          headline: story.headline,
          summary: story.summary
        })
      });

      if (!response.body) throw new Error('No readable stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                setVerificationStream(fullText);
              }
            } catch (ignore) { }
          }
        }
      }

      // After streaming is done, look for the VERDICT
      const verdictMatch = fullText.match(/VERDICT:\s*(VERIFIED|DISPUTED|UNVERIFIED)/i);
      let finalStream = fullText.trim();
      let finalStatus = 'UNVERIFIED';

      if (verdictMatch) {
        finalStatus = verdictMatch[1].toUpperCase();
        // Clean up the text to remove the VERDICT line for better display
        finalStream = fullText.replace(/VERDICT:\s*(VERIFIED|DISPUTED|UNVERIFIED)/i, '').trim();
      }
      
      setVerifyStatus(finalStatus);
      setVerificationStream(finalStream);

      sessionStorage.setItem(`verify_${story.headline}`, JSON.stringify({
        verifyStatus: finalStatus,
        verificationStream: finalStream
      }));

    } catch (e: any) {
      console.error('Verify error:', e);
      setVerificationStream('Failed to verify claims. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    // Force scroll down when user sends a new message
    setTimeout(() => {
      if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messages: newMessages,
          // Only send the heavy story context payload on the very first message 
          context: newMessages.length === 1 ? `Headline: ${story.headline}\n\nSummary: ${story.summary}\n\nDeep Context: ${story.context}\n\nAnalysis: ${story.why_it_matters}` : undefined
        })
      });

      if (!response.body) throw new Error('No readable stream');

      // Add a blank placeholder for the assistant's typing effect
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantText += content;
                // Update the last message instantly
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                  return updated;
                });
              }
            } catch (ignore) { }
          }
        }
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection lost or API error. Please try again.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <article className="border-b border-white/[0.06] pb-6 mb-6 last:border-0 last:mb-0 last:pb-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{story.source}</span>
        <span className="text-white/20">·</span>
        <span className="text-[10px] font-mono text-white/30">{story.time}</span>
      </div>

      <h3 className="text-white font-serif text-lg leading-snug mb-3 font-semibold">{story.headline}</h3>
      <p className="text-white/60 text-sm leading-relaxed mb-4">{story.summary}</p>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs cursor-pointer font-mono flex items-center gap-1.5 transition-colors"
          style={{ color: accent }}
        >
          <span>{expanded ? '▼' : '▶'}</span>
          {expanded ? 'Hide context' : 'Show context & analysis'}
        </button>

        {isFinance && (
          <button
            onClick={() => startMarketImpact()}
            className="text-xs font-mono flex cursor-pointer items-center gap-1.5 transition-colors text-white/50 hover:text-white"
          >
            <span className={`${isAnalyzing ? 'animate-pulse text-[#f59e0b]' : impactStream ? 'text-[#f59e0b]' : ''}`}>
              {isAnalyzing || impactStream ? '●' : '○'}
            </span>
            {isAnalyzing ? 'Analyzing...' : (impactStream ? 'Market Impact' : 'Get Market Impact')}
          </button>
        )}

        <button
          onClick={startVerification}
          className="text-xs font-mono flex cursor-pointer items-center gap-1.5 transition-colors text-white/50 hover:text-white"
        >
          <span className={`${isVerifying ? 'animate-pulse text-yellow-500' : verifyStatus === 'VERIFIED' ? 'text-green-500' : verifyStatus === 'DISPUTED' ? 'text-orange-500' : ''}`}>
            {isVerifying || verifyStatus ? '●' : '○'}
          </span>
          {isVerifying ? 'Verifying...' : (verifyStatus ? 'Verified' : 'Verify Claims')}
        </button>

        <button
          onClick={() => {
            setChatOpen(!chatOpen);
            // Auto open context window if they ask to chat and hide it if chat is closed
            if (!chatOpen) setExpanded(true);
          }}
          className="text-xs font-mono flex cursor-pointer items-center gap-1.5 transition-colors text-white/50 hover:text-white"
        >
          {chatOpen ? 'Close Chat' : 'chat'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 pl-3 border-l-2" style={{ borderColor: `${accent}40` }}>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 block mb-1">Backstory</span>
            <p className="text-white/55 text-sm leading-relaxed">{story.context}</p>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 block mb-1">Why It Matters</span>
            <p className="text-white/55 text-sm leading-relaxed">{story.why_it_matters}</p>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 block mb-1">The Other Side</span>
            <p className="text-white/55 text-sm leading-relaxed italic">{story.other_side}</p>
          </div>
        </div>
      )}

      {/* Market Impact UI */}
      {impactOpen && (
        <div className={`mt-4 mb-4 border rounded-xl overflow-hidden flex flex-col shadow-2xl transition-colors duration-700 ${isAnalyzing ? 'border-[#f59e0b]/30 bg-[#161007]' : impactStream ? 'border-[#f59e0b]/20 bg-[#090b0f]' : 'border-white/10 bg-[#090b0f]'}`}>
          <div className="bg-white/5 px-4 py-3 border-b border-white/5 text-[10px] font-mono text-white/50 uppercase tracking-widest flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isAnalyzing ? 'animate-pulse bg-[#f59e0b]' : 'bg-[#f59e0b]'}`}></span>
              {isAnalyzing ? 'Analyzing Technicals...' : 'Market Impact Analysis'}
            </span>
            <button onClick={() => setImpactOpen(false)} className="text-white/40 hover:text-white transition-colors cursor-pointer">✕</button>
          </div>
          <div className="p-5 text-[15px] font-sans text-white/90 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {isAnalyzing && !impactStream && (
              <span className="text-white/40 italic flex items-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-[#f59e0b]/50 border-t-[#f59e0b] rounded-full"></span>
                Connecting to Agentverse...
              </span>
            )}
            {/* The technical indicators will stream in pre-formatted mono text so wrap it in a mono tag for just the stream content */}
            <div className="font-mono text-sm leading-relaxed">
              {impactStream}
            </div>
          </div>
        </div>
      )}

      {/* Verification UI */}
      {verifyOpen && (
        <div className={`mt-4 mb-4 border rounded-xl overflow-hidden flex flex-col shadow-2xl transition-colors duration-700 ${isVerifying ? 'border-yellow-500/30 bg-[#15130b]' : verifyStatus === 'VERIFIED' ? 'border-[#00ff9d]/30 bg-[#06140f]' : verifyStatus === 'DISPUTED' ? 'border-[#f59e0b]/30 bg-[#161007]' : 'border-white/10 bg-[#090b0f]'}`}>
          <div className="bg-white/5 px-4 py-3 border-b border-white/5 text-[10px] font-mono text-white/60 uppercase tracking-widest flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isVerifying ? 'animate-pulse bg-yellow-500' : verifyStatus === 'VERIFIED' ? 'bg-[#00ff9d]' : verifyStatus === 'DISPUTED' ? 'bg-[#f59e0b]' : 'bg-gray-500'}`}></span>
              {isVerifying ? 'ASI Fact-Checker in Progress...' : verifyStatus ? `Analysis Complete` : 'Verification'}
            </span>
            <button onClick={() => setVerifyOpen(false)} className="text-white/40 hover:text-white transition-colors cursor-pointer">✕</button>
          </div>
          <div className="p-5 text-[15px] font-sans text-white/90 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {isVerifying && !verificationStream && (
              <span className="text-white/40 italic flex items-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-yellow-500/50 border-t-yellow-500 rounded-full"></span>
                Connecting to Agentverse...
              </span>
            )}

            <div className="font-mono text-sm leading-relaxed">
              {verificationStream}
            </div>

            {!isVerifying && verifyStatus && (
              <div className="mt-4 block">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold font-mono tracking-wider ${verifyStatus === 'VERIFIED' ? 'bg-[#00ff9d]/10 text-[#00ff9d] border border-[#00ff9d]/20' : verifyStatus === 'DISPUTED' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'}`}>
                  {verifyStatus === 'VERIFIED' ? '✓ VERIFIED TRUE' : verifyStatus === 'DISPUTED' ? '⚠ CLAIMS DISPUTED' : '? UNVERIFIED'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ASI Chat Interface */}
      {chatOpen && (
        <div className="mt-4 border border-white/10 rounded-xl bg-[#090b0f] overflow-hidden flex flex-col shadow-2xl">
          <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#090b0f] animate-pulse border" style={{ borderColor: accent, backgroundColor: accent }}></span>
              hello!
            </span>
            <button onClick={() => setChatOpen(false)} className="text-white/30 hover:text-white/70 cursor-pointer">✕</button>
          </div>

          <div className="p-4 h-64 overflow-y-auto flex flex-col gap-4 text-sm font-mono scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {messages.length === 0 ? (
              <div className="text-center text-white/30 my-auto">
                <p>Ask me anything about this story.</p>
                <p className="text-[10px] mt-2">Example: "Who are the major players here?"</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-white/10 text-white/90 rounded-br-sm' : 'border border-white/5 bg-white/5 text-white/70 rounded-bl-sm'}`}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {isTyping && (
              <div className="flex justify-start">
                <div className="border border-white/5 bg-white/5 text-white/40 rounded-lg rounded-bl-sm px-3 py-2 flex items-center gap-1">
                  <span className="animate-bounce">●</span><span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span><span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendChatMessage} className="p-2 border-t border-white/5 flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault(); // Prevent default newline behavior
                  // Trigger the form submission logic directly if the input is valid
                  if (input.trim() && !isTyping) {
                    sendChatMessage(e as unknown as React.FormEvent);
                  }
                }
              }}
              placeholder="Ask a question..."
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none overflow-hidden min-h-[40px]"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm font-mono"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="border-b border-white/[0.06] pb-6 mb-6 animate-pulse">
      <div className="h-3 w-24 bg-white/10 rounded mb-3" />
      <div className="h-5 w-full bg-white/10 rounded mb-2" />
      <div className="h-5 w-3/4 bg-white/10 rounded mb-4" />
      <div className="h-3 w-full bg-white/5 rounded mb-2" />
      <div className="h-3 w-5/6 bg-white/5 rounded" />
    </div>
  );
}

export default function NewsPage() {
  const [data, setData] = useState<Record<Category, CategoryData>>({
    tech: { stories: [], loading: false, page: 1 },
    finance: { stories: [], loading: false, page: 1 },
    world: { stories: [], loading: false, page: 1 },
  });
  const [activeTab, setActiveTab] = useState<Category>('tech');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Fetch a category page
  const fetchCategory = async (cat: Category, page: number) => {
    setData((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], loading: true, error: undefined },
    }));

    try {
      const res = await fetch(`/api/cached-news?category=${cat}&page=${page}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Failed to fetch');

      setData((prev) => ({
        ...prev,
        [cat]: {
          stories: page === 1 ? json.stories : [...prev[cat].stories, ...json.stories],
          loading: false,
          page: page
        },
      }));
    } catch (e: any) {
      setData((prev) => ({
        ...prev,
        [cat]: { ...prev[cat], loading: false, error: e.message || 'Failed to fetch' },
      }));
    }
  };

  // Keep active category loaded
  useEffect(() => {
    if (data[activeTab].stories.length === 0 && !data[activeTab].loading && !data[activeTab].error) {
      fetchCategory(activeTab, 1);
    }
  }, [activeTab]);

  const activeData = data[activeTab];
  const meta = CATEGORY_META[activeTab];

  return (
    <div className="min-h-screen bg-[#090b0f] text-white">
      <Navbar />

      {/* Newspaper Header */}
      <div className="pt-20 pb-4 border-b border-white/10 bg-[#090b0f] sticky top-0 z-10 lg:pt-24">
        <div className="max-w-3xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-serif font-bold text-white tracking-tight mb-1">The Flario</h1>
            <p className="text-white/30 text-[10px] uppercase tracking-widest font-mono">{today}</p>
          </div>

          {/* Category tabs */}
          <div className="flex justify-center gap-1">
            {CATEGORIES.map((cat) => {
              const catMeta = CATEGORY_META[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`cursor-pointer px-4 py-1.5 text-xs font-mono rounded-full transition-all ${activeTab === cat
                      ? 'text-[#090b0f] font-semibold'
                      : 'text-white/40 hover:text-white/70'
                    }`}
                  style={activeTab === cat ? { background: catMeta.accent } : {}}
                >
                  {catMeta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Single Column Feed */}
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Active Category Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
          <span className="font-mono font-bold text-sm uppercase tracking-widest" style={{ color: meta.accent }}>
            {meta.label} Edition
          </span>
          {activeData.loading && activeData.stories.length === 0 && (
            <span className="text-[10px] font-mono text-white/30 animate-pulse">fetching latest...</span>
          )}
        </div>

        {/* Stories Feed */}
        <div className="space-y-8">
          {activeData.stories.map((story, i) => (
            <StoryCard key={`${activeTab}-${i}`} story={story} accent={meta.accent} isFinance={activeTab === 'finance'} />
          ))}

          {/* Skeletons for initial load OR appending load */}
          {activeData.loading && (
            <div className="mt-8">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {/* Error State */}
          {activeData.error && (
            <div className="p-6 border border-red-500/20 bg-red-500/5 rounded-xl text-center mt-8">
              <p className="text-red-400/80 text-sm font-mono mb-3">{activeData.error}</p>
              <button
                onClick={() => fetchCategory(activeTab, activeData.page)}
                className="text-xs font-mono text-white/60 hover:text-white underline underline-offset-4"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Load More Button */}
        {activeData.stories.length > 0 && !activeData.loading && !activeData.error && (
          <div className="mt-12 text-center border-t border-white/[0.06] pt-12">
            <button
              onClick={() => fetchCategory(activeTab, activeData.page + 1)}
              className="px-8 py-3 rounded-full border border-white/10 text-sm font-mono text-white/60 hover:text-white hover:border-white/30 transition-all hover:-translate-y-0.5"
            >
              Load Page {activeData.page + 1} ↓
            </button>
          </div>
        )}

      </div>

      <div className="h-24" />
    </div>
  );
}