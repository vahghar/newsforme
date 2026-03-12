import { NextRequest, NextResponse } from 'next/server';

import {v4 as uuidv4} from 'uuid'

const API_KEY = process.env.API_KEY || process.env.ASI_ONE_API_KEY;
const ASI_BASE = 'https://api.asi1.ai/v1/chat/completions';
const MODEL = "asi1"; // Use the actual agentic model

// Basic in-memory session store (In production, use Redis/DB)
const sessionMap = new Map<string, string>();

function getSessionId(convId: string) {
  let sessionId = sessionMap.get(convId);
  if (!sessionId) {
    sessionId = uuidv4();
    sessionMap.set(convId, sessionId);
  }
  return sessionId;
}

// Reusable ask function based on ASI docs
async function ask(convId: string, messages: any[]) {
  const sessionId = getSessionId(convId);
  
  const response = await fetch(ASI_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY || ''}`,
      'x-session-id': sessionId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, stream: false }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || 'ASI API Failed');
  }
  return result.choices[0].message.content;
}

// Helper to delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Polling mechanic based on ASI docs
async function pollForAsyncReply(convId: string, history: any[], waitSec = 5, maxAttempts = 12) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await delay(waitSec * 1000);
    console.log(`🔄 polling (attempt ${attempt + 1}) …`);
    
    const updatePrompt = { role: "user", content: "Any update?" };
    const latest = await ask(convId, [...history, updatePrompt]);
    
    // If the reply actually changed from the last known assistant state, the agent is done
    if (latest && latest.trim() !== history[history.length - 1].content.trim() && latest.trim() !== "I've sent the message" && !latest.includes("I'm still looking")) {
      return latest;
    }
  }
  throw new Error("Agentverse poling timed out");
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'tech';

    // Accept standard page parameter, defaulting to 1
    const pageParam = searchParams.get('page');
    const page = pageParam ? parseInt(pageParam, 10) : 1;

    try {
        // ─────────────────────────────────────────
        // ASI:ONE AGENT VERSE CALL
        // We bypass NewsAPI entirely. We ask ASI1 directly 
        // to utilize its internal internet-search agent 
        // to find and format the news perfectly.
        // ─────────────────────────────────────────
        const systemPrompt = `You are a legendary News Agent with live internet search capabilities. Your rigorous task is to search for the 10 most critical, breaking ${category} news stories right now (Page ${page}).

For every single story, you must provide:
- "headline": A punchy, rewritten headline.
- "summary": 2-3 comprehensive sentences explaining what fundamentally happened.
- "context": 3-4 thorough sentences of deep backstory and historical context so a beginner fully understands the mechanisms and past events leading to this moment.
- "why_it_matters": 2-3 sentences explaining the overarching real-world impact and future consequences.
- "other_side": 2 sentences explaining the opposing view, potential drawbacks, or what critics are saying.
- "source": The name of the original publication.
- "time": An estimate of when the story broke (e.g. "2 hours ago").

CRITICAL INSTRUCTION: You must return ONLY strictly valid JSON. Your entire response must be a single JSON array containing exactly 10 objects. Do not wrap the JSON in backticks, do not include markdown formatting, and do not add any conversational text before or after the JSON array. You MUST properly escape any double quotes (e.g. \\") that appear inside the text values.`;

    // ─────────────────────────────────────────
    // ASI:ONE AGENT VERSE CALL (Long Polling)
    // ─────────────────────────────────────────
    const convId = `news-fetch-${category}-${page}-${Date.now()}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: `Search the web and return EXACTLY 10 deep-dive ${category} news stories as a raw JSON array. Do not include unrelated stories.` 
      }
    ];

    // Initial trigger
    console.log(`[agentverse] Starting fetch for ${category}...`);
    let assistantReply = await ask(convId, messages);
    let history = [...messages, { role: "assistant", content: assistantReply }];

    let finalRawText = assistantReply;

    // If the agent indicates it is deferring/searching (e.g. "I've sent the message" per docs)
    if (assistantReply.trim() === "I've sent the message" || assistantReply.includes("I'll search") || assistantReply.includes("I am searching")) {
      console.log(`[agentverse] Agent is searching, beginning poll...`);
      finalRawText = await pollForAsyncReply(convId, history);
    }

    let raw = finalRawText || '';

        // Clean and aggressively parse the Agent's JSON output
        let clean = raw.replace(/```json|```/g, '').trim();
        const match = clean.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) clean = match[0];

        let finalStories = [];
        try {
            finalStories = JSON.parse(clean);
        } catch (parseError) {
            console.error('Agent Verse JSON Parse Error:', parseError);
            console.error('Raw content received:', raw);
            throw new Error('Agent Verse failed to return a valid JSON array');
        }

        return NextResponse.json({
            category,
            page,
            count: finalStories.length,
            stories: finalStories
        });

    } catch (e: any) {
        console.error(`[agentverse/${category}] Error:`, e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
