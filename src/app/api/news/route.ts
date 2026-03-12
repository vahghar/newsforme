import { NextRequest, NextResponse } from 'next/server';

const NEWS_API_KEY = process.env.NEWS_API_KEY; // get from newsapi.org
const API_KEY = process.env.API_KEY;
const ASI_BASE = 'https://api.asi1.ai/v1/chat/completions';

// helper to call ASI1
async function callASI(systemPrompt: string, userMessage: string) {
  const res = await fetch(ASI_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'asi1-mini',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─────────────────────────────────────────
// AGENT 1 — Fetcher
// ─────────────────────────────────────────
async function fetcherAgent(category: string, page: number) {
  const queries: Record<string, string> = {
    tech: 'technology OR tech OR software',
    finance: 'finance OR markets OR economy',
    world: 'world news OR international global',
  };

  const q = queries[category] || category;

  // Step 1 — call NewsAPI with pagination, fetching enough to pick top 10
  const newsRes = await fetch(
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=20&page=${page}&language=en&apiKey=${NEWS_API_KEY}`
  );
  const newsData = await newsRes.json();

  if (!newsData.articles || newsData.articles.length === 0) {
    throw new Error('No articles returned from NewsAPI for this page.');
  }

  // format raw headlines for ASI1
  const rawHeadlines = newsData.articles
    .map((a: any, i: number) => `${i + 1}. [${a.source.name}] ${a.title} — ${a.description || ''}`)
    .join('\n');

  // Step 2 — ASI1 picks top 10 and summarizes
  const system = `You are a rigorous senior news editor. You receive a list of raw headlines and must select exactly 10 of the most impactful and critical stories.
CRITICAL INSTRUCTION: The user requested "${category}" news. Ensure that all 10 picked stories are strictly and incontrovertibly related to the "${category}" category. Discard completely unrelated stories. 

CRITICAL INSTRUCTION: You must return ONLY strictly valid JSON. Your entire response must be a single JSON array. Do not wrap the JSON in backticks, do not include markdown formatting, and do not add any conversational text before or after the JSON array. You MUST properly escape any double quotes (e.g. \\") that appear inside the text values.
[
  {
    "headline": "punchy, rewritten headline",
    "summary": "2-3 comprehensive sentences explaining what fundamentally happened.",
    "source": "source name",
    "original_title": "exact original title from the list"
  }
]`;

  const result = await callASI(system, `Pick exactly 10 of the most important ${category} stories from these headlines. Do not pick stories that do not fit the ${category} category. Return ONLY a valid JSON array:\n${rawHeadlines}`);

  let clean = result.replace(/```json|```/g, '').trim();
  const match = clean.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) clean = match[0];

  try {
    return JSON.parse(clean);
  } catch (error) {
    console.error('Agent 1 JSON Parse Error:', error);
    console.error('Raw content received from Agent 1:', result);
    throw new Error('Agent 1 failed to return a valid JSON array');
  }
}

// ─────────────────────────────────────────
// AGENT 2 — Context Agent
// ─────────────────────────────────────────
async function contextAgent(stories: any[]) {
  const system = `You are a brilliant educator and historian. Your goal is to make the news completely understandable to someone seeing it for the very first time.

For each news story given to you, write 3 to 4 thorough sentences of deep backstory and historical context. You must explain the core concepts directly, what led to this moment, and what underlying mechanisms or past events a beginner needs to know to fully understand it.

CRITICAL INSTRUCTION: Do NOT return JSON. You must return your analysis in the exact format below for every single story (1 through ${stories.length}), separated by "---":

STORY 1
CONTEXT: <your deep backstory here>
---
STORY 2
...
`;

  const simplifiedStories = stories.map((s, i) => `STORY ${i + 1}\nHeadline: ${s.headline}\nSummary: ${s.summary}\n`);

  const result = await callASI(system, `Provide thorough, beginner-friendly background story and context for these events:\n\n${simplifiedStories.join('\n')}`);

  // Parse delimited text
  const blocks = result.split('---').map((b: string) => b.trim()).filter(Boolean);

  const finalStories = stories.map((story, index) => {
    const block = blocks[index] || '';

    // Extract section
    const contextMatch = block.match(/CONTEXT:\s*([\s\S]*?)$/i);

    return {
      ...story,
      context: contextMatch ? contextMatch[1].trim() : "Context pending."
    };
  });

  return finalStories;
}

// ─────────────────────────────────────────
// AGENT 3 — Analyst Agent
// ─────────────────────────────────────────
async function analystAgent(stories: any[]) {
  // Rather than forcing perfectly escaped JSON structure for 10 massive objects,
  // we ask for a reliable delimited format and parse it to prevent syntax errors.
  const system = `You are a sharp, unbiased analyst. For each news story, provide:
- "why_it_matters": 2-3 sentences explaining the overarching real-world impact and future consequences.
- "other_side": 2 sentences explaining the opposing view, potential drawbacks, or what critics are saying.

CRITICAL INSTRUCTION: Do NOT return JSON. You must return your analysis in the exact format below for every single story (1 through ${stories.length}), separated by "---":

STORY 1
WHY IT MATTERS: <your text here>
OTHER SIDE: <your text here>
---
STORY 2
...
`;

  const simplifiedStories = stories.map((s, i) => `STORY ${i + 1}\nHeadline: ${s.headline}\nSummary: ${s.summary}\n`);

  const result = await callASI(system, `Analyze these stories:\n\n${simplifiedStories.join('\n')}`);

  // Parse delimited text
  const blocks = result.split('---').map((b: string) => b.trim()).filter(Boolean);

  const finalStories = stories.map((story, index) => {
    const block = blocks[index] || '';

    // Extract sections
    const whyMatch = block.match(/WHY IT MATTERS:\s*([\s\S]*?)(?=OTHER SIDE:|$)/i);
    const otherMatch = block.match(/OTHER SIDE:\s*([\s\S]*?)$/i);

    return {
      ...story,
      why_it_matters: whyMatch ? whyMatch[1].trim() : "Analysis pending.",
      other_side: otherMatch ? otherMatch[1].trim() : "Analysis pending."
    };
  });

  return finalStories;
}

// ─────────────────────────────────────────
// MAIN ROUTE
// Orchestrates all 3 agents in sequence
// ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') || 'tech';

  // Accept standard page parameter, defaulting to 1
  const pageParam = searchParams.get('page');
  const page = pageParam ? parseInt(pageParam, 10) : 1;

  try {
    // Agent 1 — fetch + pick top 10 paginated
    const stories = await fetcherAgent(category, page);

    // Run Agent 2 (Context) and Agent 3 (Analysis) concurrently!
    const [withContext, withAnalysis] = await Promise.all([
      contextAgent(stories),
      analystAgent(stories)
    ]);

    // Merge the parallel results back into the final story objects
    const finalStories = stories.map((s: any, i: number) => ({
      ...s,
      context: withContext[i]?.context || 'Context pending.',
      why_it_matters: withAnalysis[i]?.why_it_matters || 'Analysis pending.',
      other_side: withAnalysis[i]?.other_side || 'Analysis pending.'
    }));

    return NextResponse.json({
      category,
      page,
      count: finalStories.length,
      stories: finalStories
    });
  } catch (e: any) {
    console.error(`[news/${category}] Error:`, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}