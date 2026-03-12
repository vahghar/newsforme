import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_KEY || process.env.ASI_ONE_API_KEY;
const ASI_BASE = 'https://api.asi1.ai/v1/chat/completions';
const MODEL = 'asi1-mini'; // Or asi1 based on speed preference

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId, context } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // If there is context passed (meaning it is the first message for this story),
    // we inject a system prompt at the beginning of the messages array.
    let payloadMessages = [...messages];
    if (context && messages.length === 1) {
      payloadMessages = [
        {
          role: 'system',
          content: `You are the Flario Fact-Checker Agent. The user is currently reading the following news story:\n\n${context}\n\nAnswer any questions they have specifically based on this story context. Keep your answers concise, informative, and objective.`
        },
        ...messages
      ];
    }

    const response = await fetch(ASI_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY || ''}`,
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: payloadMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json({ error: err.error?.message || 'ASI API Failed' }, { status: response.status });
    }

    // Return the readable stream directly to the client
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream'
      }
    });

  } catch (error: any) {
    console.error('[chat] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
