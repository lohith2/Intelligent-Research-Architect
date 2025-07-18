import asyncio
from app.vector_store import get_vectorstore
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv
import os

load_dotenv()

async def debug_store():
    # Force initialization
    if "GOOGLE_API_KEY" not in os.environ:
        print("Error: GOOGLE_API_KEY not set.")
        return

    print("Initializing vector store...")
    vectorstore = get_vectorstore()
    
    # Check collection count
    count = vectorstore._collection.count()
    print(f"Total documents in store: {count}")
    
    # Peek at results
    if count > 0:
        print("\n--- Peeking at random documents ---")
        peek = vectorstore._collection.peek(limit=5)
        for i, meta in enumerate(peek['metadatas']):
            print(f"Doc {i}: Metadata: {meta}")
            # print(f"Content: {peek['documents'][i][:200]}...") # truncate
            
    # Try a relevant search
    query = "secret code"
    print(f"\n--- Searching for '{query}' ---")
    results = vectorstore.similarity_search(query, k=3)
    for doc in results:
        print(f"Found: {doc.metadata} - Content start: {doc.page_content[:100]}")

if __name__ == "__main__":
    asyncio.run(debug_store())
