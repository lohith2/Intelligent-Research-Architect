from dotenv import load_dotenv
load_dotenv()

import asyncio
from app.agent import agent_runnable

async def main():
    print("Starting agent test...")
    initial_state = {"question": "Who won the super bowl in 2024?", "context": [], "steps_taken": []}
    async for event in agent_runnable.astream(initial_state):
        print("Event:", event)

if __name__ == "__main__":
    asyncio.run(main())
