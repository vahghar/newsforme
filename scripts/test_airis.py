import asyncio
import sys
import os
import json
from uagents import Agent, Context, Model
from dotenv import load_dotenv

load_dotenv()
AGENTVERSE_API_KEY = os.getenv("AGENTVERSE_API_KEY")

class Message(Model):
    message: str

class AIRISRequest(Model):
    query: str
    
class AIRISRequest2(Model):
    text: str

agent = Agent(
    name="test_airis",
    seed="test_airis_seed_12345",
    mailbox=f"{AGENTVERSE_API_KEY}@https://agentverse.ai",
)

AIRIS_ADDRESS = "agent1qt05zd2vflz4vrytdyr2agz2775gv9e5hz99h06tq4uz6lv8fzq3k2dumzs"

@agent.on_event("startup")
async def send_messages(ctx: Context):
    await ctx.send(AIRIS_ADDRESS, Message(message="Hello AIRIS, verify this: tech stocks are up."))
    print("Sent generic Message")
    asyncio.create_task(timeout(ctx))

async def timeout(ctx):
    await asyncio.sleep(10)
    print("Timeout waiting for AIRIS response")
    os._exit(0)

@agent.on_message(Model)
async def handle_response(ctx: Context, sender: str, msg: Model):
    print(f"Received from AIRIS: {msg.model_dump_json()}")
    os._exit(0)

if __name__ == "__main__":
    import logging
    logging.getLogger("uagents").setLevel(logging.CRITICAL)
    agent.run()
