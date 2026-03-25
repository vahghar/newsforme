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

        const aiData = await aiRes.json();
        const ticker = aiData.choices?.[0]?.message?.content?.trim().replace(/[^A-Z]/g, '');
        const isFallbackETF = ['TLT', 'XLF', 'XLE', 'QQQ', 'XBI', 'SPY'].includes(ticker || '');

        if (!ticker || ticker.length > 5) {
          await sendChunk("\n⚠️ Could not determine a valid ticker to analyze.\n");
          await sendChunk("\n[DONE]\n\n");
          await writer.close();
          return;
        }

        if (isFallbackETF) {
          await sendChunk(`No specific company found. Analyzing relevant sector ETF: ${ticker}\nCalling Technical Analysis Agent on Agentverse...\n`);
        } else {
          await sendChunk(`Ticker identified: ${ticker}\nCalling Technical Analysis Agent on Agentverse...\n`);
        }

        // 2. Hybrid execution mode based on environment
        let result: any = null;
        
        if (process.env.VERCEL === "1" || process.env.NEXT_PUBLIC_VERCEL_ENV) {
            // VERCEL PRODUCTION MODE - USE SERVERLESS HTTP ENDPOINT
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || `https://${process.env.VERCEL_URL}`;
            const analysisRes = await fetch(`${baseUrl}/api/tech_analysis?ticker=${ticker}`);
            
            if (!analysisRes.ok) {
                const errorLog = await analysisRes.text();
                await sendChunk(`\nERROR: Vercel Python API failed with status ${analysisRes.status}.\nDetails: ${errorLog}\n`);
                await sendChunk("\n");
                await writer.close();
                return;
            }
            result = await analysisRes.json();
        } else {
            // LOCAL DEVELOPMENT MODE - USE NATIVE PYTHON
            const scriptPath = path.join(process.cwd(), 'scripts', 'get_tech_analysis.py');
            const { stdout } = await execAsync(`python "${scriptPath}" ${ticker}`);
            
            const startMarker = "AgentResponseOutputStart---";
            const endMarker = "---AgentResponseOutputEnd";
            const startIndex = stdout.indexOf(startMarker);
            const endIndex = stdout.indexOf(endMarker);
            
            if (startIndex !== -1 && endIndex !== -1) {
                const jsonStr = stdout.substring(startIndex + startMarker.length, endIndex).trim();
                result = JSON.parse(jsonStr);
            } else {
                await sendChunk(`\nERROR: Local Python script failed to return valid data.\n`);
                await sendChunk("\n");
                await writer.close();
                return;
            }
        }

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
