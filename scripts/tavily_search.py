import sys
import os
import json
import asyncio
import logging
from typing import List
from uagents import Agent, Context, Model
from dotenv import load_dotenv

load_dotenv()
AGENTVERSE_API_KEY = os.getenv("AGENTVERSE_API_KEY")

class WebSearchRequest(Model):
    query: str

class WebSearchResult(Model):
    title: str
    url: str
    content: str

class WebSearchResponse(Model):
    query: str
    results: List[WebSearchResult]

if len(sys.argv) < 2:
    print(json.dumps({"error": "No query provided"}))
    sys.exit(1)

query = sys.argv[1]

agent = Agent(
    name="tavily_searcher",
    seed="user_agent_secure_seed_flario_123",
    mailbox=f"{AGENTVERSE_API_KEY}@https://agentverse.ai",
)

AI_AGENT_ADDRESS = "agent1qt5uffgp0l3h9mqed8zh8vy5vs374jl2f8y0mjjvqm44axqseejqzmzx9v8"

@agent.on_event("startup")
async def send_message(ctx: Context):
    await ctx.send(AI_AGENT_ADDRESS, WebSearchRequest(query=query))
    asyncio.create_task(timeout(ctx))

async def timeout(ctx):
    await asyncio.sleep(15)
    print(json.dumps({"error": "Timeout", "message": "Failed to receive response from the Tavily Search Agent."}))
    os._exit(1)

@agent.on_message(WebSearchResponse)
async def handle_response(ctx: Context, sender: str, msg: WebSearchResponse):
    result = {
        "query": msg.query,
        "results": [{"title": r.title, "url": r.url, "content": r.content} for r in msg.results[:3]] # get top 3
    }
    print("AgentResponseOutputStart---")
    print(json.dumps(result))
    print("---AgentResponseOutputEnd")
    sys.stdout.flush()
    os._exit(0)

if __name__ == "__main__":
    if not AGENTVERSE_API_KEY:
        print(json.dumps({"error": "AGENTVERSE_API_KEY is not set"}))
        sys.exit(1)
    
    # Suppress verbose uagents startup logs so stdout is clean
    logging.getLogger("uagents").setLevel(logging.CRITICAL)
    agent.run()
