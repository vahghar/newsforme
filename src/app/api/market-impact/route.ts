import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

const API_KEY = process.env.API_KEY || process.env.ASI_ONE_API_KEY; // Using our configured key
const ENDPOINT = 'https://api.asi1.ai/v1/chat/completions';
const MODEL = 'asi1';

export async function POST(req: NextRequest) {
  try {
    const { headline, summary, sessionId } = await req.json();

    if (!headline || !summary || !sessionId) {
      return NextResponse.json({ error: 'Missing req parameters' }, { status: 400 });
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Helper to send SSE chunks easily
    const sendChunk = async (text: string) => {
      const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
      await writer.write(new TextEncoder().encode(payload));
    };

    const processRequest = async () => {
      try {
        await sendChunk("Identifying company ticker...\n");

        // 1. Get ticker via ASI model
        const messages = [
            { role: 'system', content: 'You are a financial extractor. Extract the single most prominent publicly traded company ticker symbol from this text. If no specific company is mentioned, map the topic to the most relevant Sector ETF: Fed/rates/bonds -> TLT, Banking/Finance -> XLF, Energy -> XLE, Tech/AI -> QQQ, Biotech/Pharma -> XBI. If it is broad market news or fits none of the above, use SPY. Reply with ONLY the raw uppercase ticker symbol (e.g. AMZN, AAPL, TLT, SPY), no other text, no explanations.' },
            { role: 'user', content: `Headline: ${headline}\nSummary: ${summary}` }
          ];

          const aiRes = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'x-session-id': sessionId,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model: MODEL, messages, stream: false }),
          });

          if (!aiRes.ok) {
            const errText = await aiRes.text();
            await sendChunk(`\n⚠️ ASI LLM API Failed (Status ${aiRes.status}). Ensure API_KEY is set in Vercel!\nDetails: ${errText}\n`);
            await sendChunk("\n[DONE]\n\n");
            await writer.close();
            return;
          }

        const aiData = await aiRes.json();
        let ticker = aiData.choices?.[0]?.message?.content?.trim().replace(/[^A-Z]/g, '') || '';
        
        // If the LLM generates a full sentence instead of a ticker, it will be > 5 characters long.
        // If it completely fails, it will be length 0. In both cases, strictly fallback to SPY!
        if (ticker.length === 0 || ticker.length > 5) {
            ticker = 'SPY';
        }
        
        const isFallbackETF = ['TLT', 'XLF', 'XLE', 'QQQ', 'XBI', 'SPY'].includes(ticker);

        if (isFallbackETF) {
          await sendChunk(`No specific company found. Analyzing relevant sector ETF: ${ticker}\nCalling Technical Analysis Agent on Agentverse...\n`);
        } else {
          await sendChunk(`Ticker identified: ${ticker}\nCalling Technical Analysis Agent on Agentverse...\n`);
        }

        // 2. Fetch Technical Analysis Data from external Python Backend
        let result: any = null;
        
        // Locally this defaults to the actual Render API Server. In Production Vercel, it uses the Render URL automatically.
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
        
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

        const analysisRes = await fetch(`${baseUrl}/api/tech_analysis?ticker=${ticker}`, { headers: fetchHeaders });
        
        if (!analysisRes.ok) {
            const errorLog = await analysisRes.text();
            await sendChunk(`\nERROR: External Python API failed with status ${analysisRes.status}.\nDetails: ${errorLog}\n`);
            await sendChunk("\n");
            await writer.close();
            return;
        }
        result = await analysisRes.json();

        // 3. Extract and parse JSON result
        if (result) {
          try {
            const buySignals = result.analysis.filter((i: any) => i.signal === 'BUY').length;
            const sellSignals = result.analysis.filter((i: any) => i.signal === 'SELL').length;
            const totalSignals = result.analysis.length;
            
            let formattedResponse = `\n📊 TECHNICAL ANALYSIS FOR ${result.symbol}:\n\n`;
            
            for (const item of result.analysis) {
              const arrow = item.signal === 'BUY' ? '🟢 BUY ' : (item.signal === 'SELL' ? '🔴 SELL' : '⚪ HOLD');
              formattedResponse += `- ${item.indicator.padEnd(6)}: ${item.latest_value.toFixed(2).padStart(8)}  (${arrow})\n`;
            }

            formattedResponse += `\n`;
            
            if (buySignals > sellSignals && buySignals > totalSignals / 2) {
                formattedResponse += `Strong BUY signals detected (${buySignals}/${totalSignals} indicators). Momentum is currently bullish based on moving averages.`;
            } else if (sellSignals > buySignals && sellSignals > totalSignals / 2) {
                formattedResponse += `Strong SELL signals detected (${sellSignals}/${totalSignals} indicators). Momentum is currently bearish based on moving averages.`;
            } else {
                formattedResponse += `Mixed signals detected (${buySignals} BUY, ${sellSignals} SELL). The asset is currently showing horizontal movement or consolidation.`;
            }

            await sendChunk(formattedResponse);
          } catch (e) {
            await sendChunk(`\nERROR: Failed to parse Agentverse response.\n`);
          }
        }

        await sendChunk("\n");
        await writer.close();
      } catch (err: any) {
        console.error(err);
        await sendChunk(`\nERROR: Internal execution failed: ${err.message}\n`);
        await sendChunk("\n");
        await writer.close();
      }
    };

    // Run the extraction process without blocking the HTTP response start
    processRequest();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Market Impact API error:', error);
    return NextResponse.json({ error: 'Failed to analyze market impact' }, { status: 500 });
  }
}
