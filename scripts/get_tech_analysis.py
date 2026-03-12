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

class TechAnalysisRequest(Model):
    ticker: str

class IndicatorSignal(Model):
    indicator: str
    latest_value: float
    previous_value: float
    signal: str

class TechAnalysisResponse(Model):
    symbol: str
    analysis: List[IndicatorSignal]

if len(sys.argv) < 2:
    print(json.dumps({"error": "No ticker provided"}))
    sys.exit(1)

ticker = sys.argv[1].upper()

agent = Agent(
    name="tech_analyzer",
    seed="user_agent_secure_seed_flario_123",
    mailbox=f"{AGENTVERSE_API_KEY}@https://agentverse.ai",
)

AI_AGENT_ADDRESS = "agent1q085746wlr3u2uh4fmwqplude8e0w6fhrmqgsnlp49weawef3ahlutypvu6"

@agent.on_event("startup")
async def send_message(ctx: Context):
    await ctx.send(AI_AGENT_ADDRESS, TechAnalysisRequest(ticker=ticker))
    asyncio.create_task(timeout(ctx))

async def timeout(ctx):
    await asyncio.sleep(15)
    print(json.dumps({"error": "Timeout", "message": "Failed to receive response from the Technical Analysis Agent."}))
    os._exit(1)

@agent.on_message(TechAnalysisResponse)
async def handle_response(ctx: Context, sender: str, msg: TechAnalysisResponse):
    result = {
        "symbol": msg.symbol,
        "analysis": [{"indicator": i.indicator, "latest_value": i.latest_value, "previous_value": i.previous_value, "signal": i.signal} for i in msg.analysis]
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
