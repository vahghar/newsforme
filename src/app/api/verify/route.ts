import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

const API_KEY = process.env.API_KEY || process.env.ASI_ONE_API_KEY;
const ENDPOINT = 'https://api.asi1.ai/v1/chat/completions';
const MODEL = 'asi1';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { headline, summary, sessionId } = body;

        if (!headline || !summary || !sessionId) {
            return NextResponse.json({ error: 'Missing req parameters' }, { status: 400 });
        }

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        const sendChunk = async (text: string) => {
            const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
            await writer.write(new TextEncoder().encode(payload));
        };

        const processRequest = async () => {
            try {
                await sendChunk("Connecting to Agentverse...\nCalling Tavily Search Agent...\n");

                // 1. Hybrid Vercel / Local Python Execution for Tavily
                let searchContext = "";
                let result: any = null;
                
                if (process.env.VERCEL === "1" || process.env.NEXT_PUBLIC_VERCEL_ENV) {
                    const baseUrl = process.env.NEXT_PUBLIC_API_URL || `https://${process.env.VERCEL_URL}`;
                    
                    const fetchHeaders: Record<string, string> = {};
                    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
                        fetchHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
                    }
                    if (req.headers.has('cookie')) {
                        fetchHeaders['cookie'] = req.headers.get('cookie') as string;
                    }
                    if (req.headers.has('x-vercel-protection-bypass')) {
                        fetchHeaders['x-vercel-protection-bypass'] = req.headers.get('x-vercel-protection-bypass') as string;
                    }

                    const searchRes = await fetch(`${baseUrl}/api/tavily?query=${encodeURIComponent(headline)}`, { headers: fetchHeaders });
                    if (searchRes.ok) {
                        result = await searchRes.json();
                    } else {
                        const errorLog = await searchRes.text();
                        await sendChunk(`\n⚠️ Vercel Tavily Python API failed with status ${searchRes.status}.\nDetails: ${errorLog}\n`);
                    }
                } else {
                    const scriptPath = path.join(process.cwd(), 'scripts', 'tavily_search.py');
                    const { stdout } = await execAsync(`python "${scriptPath}" "${headline}"`);
                    const startMarker = "AgentResponseOutputStart---";
                    const endMarker = "---AgentResponseOutputEnd";
                    const startIndex = stdout.indexOf(startMarker);
                    const endIndex = stdout.indexOf(endMarker);
                    
                    if (startIndex !== -1 && endIndex !== -1) {
                        const jsonStr = stdout.substring(startIndex + startMarker.length, endIndex).trim();
                        result = JSON.parse(jsonStr);
                    } else {
                        await sendChunk("\n⚠️ Local Tavily Python script failed to return valid data.\n");
                    }
                }
                
                if (result) {
                    try {
                        if (result.results && result.results.length === 0) {
                            await sendChunk("\n⚠️ Search Warning: Agentverse Tavily agent returned 0 valid search results for this headline. Verification may fail.\n\n");
                        }
                        searchContext = `Search Query: ${result.query}\nResults:\n`;
                        for (let i = 0; i < result.results.length; i++) {
                            const r = result.results[i];
                            searchContext += `[${i+1}] Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n\n`;
                        }
                    } catch (e) {
                         console.error("Failed to parse search JSON", e);
                         await sendChunk("\n⚠️ Failed to parse search results.\n");
                    }
                }

                await sendChunk("Evaluating logic and consistency via ASI Agent...\n\n");

                // 2. Call the ASI LLM to evaluate the story against the search context
                const messages = [
                    {
                        role: 'system',
                        content: `You are a strict and objective News Verification Coordinator. You will be provided with a news story and search results from the live internet.
Your task is to verify the claims in the story against the search results provided.
Provide a single, concise paragraph summarizing your findings (max 2-3 sentences). DO NOT output detailed breakdowns or source lists.
At the very end of your response, you MUST output exactly one of the following exact strings as your final conclusion on a new line:
VERDICT: VERIFIED
VERDICT: DISPUTED
VERDICT: UNVERIFIED`
                    },
                    {
                        role: 'user',
                        content: `Please verify this news story:\nHeadline: ${headline}\nSummary: ${summary}\n\n=== LIVE SEARCH CONTEXT ===\n${searchContext}`
                    }
                ];

                const response = await fetch(ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'x-session-id': sessionId,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ model: MODEL, messages, stream: true }),
                });

                if (!response.body) throw new Error('No readable stream from ASI API');

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {
                                const parsed = JSON.parse(line.slice(6));
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    await sendChunk(content);
                                }
                            } catch (e) {}
                        }
                    }
                }
                
                await sendChunk("\n[DONE]\n\n");
                await writer.close();

            } catch (err: any) {
                console.error(err);
                await sendChunk(`\nERROR: Verification failed: ${err.message}\n`);
                await sendChunk("\nVERDICT: UNVERIFIED\n");
                await sendChunk("\n[DONE]\n\n");
                await writer.close();
            }
        };

        processRequest();

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        console.error('Verify API error:', error);
        return NextResponse.json({ error: 'Failed to verify story' }, { status: 500 });
    }
}
