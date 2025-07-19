from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.agent import agent_runnable
from app.vector_store import add_documents, delete_chat_documents
import uvicorn
import os
from sse_starlette.sse import EventSourceResponse
import json
import asyncio
from typing import Optional, List
import base64
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

# Load env vars
load_dotenv()


def get_allowed_origins() -> list[str]:
    configured_origins = os.getenv("CORS_ORIGINS", "")
    origins = [
        origin.strip()
        for origin in configured_origins.split(",")
        if origin.strip()
    ]
    if origins:
        return origins

    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

api_key = os.getenv("GOOGLE_API_KEY")
gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
if not api_key:
    print("CRITICAL ERROR: GOOGLE_API_KEY is not set!")
else:
    print(f"INFO: GOOGLE_API_KEY found (starts with {api_key[:5]}...)")
    print(f"INFO: Using Gemini model: {gemini_model}")

# Vision LLM for image transcription (Gemini has native vision)
vision_llm = ChatGoogleGenerativeAI(model=gemini_model, temperature=0)

async def transcribe_image_with_vision(image_data: bytes) -> str:
    """Use Gemini Vision to transcribe text from an image."""
    try:
        base64_image = base64.b64encode(image_data).decode('utf-8')
        messages = [
            HumanMessage(
                content=[
                    {"type": "text", "text": "Transcribe the text in this image verbatim. If it allows, describe any charts or visual information in detail. If it is empty, return empty string."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            )
        ]
        response = await vision_llm.ainvoke(messages)
        return response.content
    except Exception as e:
        print(f"Vision transcription failed: {e}")
        return ""

app = FastAPI(title="Research Architect API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    content: str
    
class ResearchRequest(BaseModel):
    query: str
    chat_id: Optional[str] = None
    messages: List[Message] = []
    filters: List[str] = []

@app.post("/research")
async def research_endpoint(request: ResearchRequest):
    """Stream research results via SSE with real token-level streaming."""
    
    async def event_generator():
        initial_state = {
            "question": request.query,
            "filters": request.filters,
            "context": [],
            "steps_taken": [],
            "chat_id": request.chat_id,
            "chat_history": request.messages,
            "sources": [],
            "grade_passed": None,
            "research_mode": None,
        }
        
        async for event in agent_runnable.astream_events(initial_state, version="v2"):
            kind = event["event"]
            
            # 1. Stream individual tokens from the LLM
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if hasattr(chunk, "content") and chunk.content:
                    yield json.dumps({"token": chunk.content})
                    
            # 2. Node lifecycle events for step tracking
            elif kind == "on_chain_start":
                node_name = event.get("name", "")
                if node_name == "router":
                    yield json.dumps({"step": {"name": "router", "status": "running", "label": "Analyzing query..."}})
                elif node_name == "search":
                    mode = event.get("data", {}).get("input", {}).get("research_mode")
                    label = "Searching papers..." if mode == "academic" else "Searching the web..."
                    yield json.dumps({"step": {"name": "search", "status": "running", "label": label}})
                elif node_name == "grade":
                    yield json.dumps({"step": {"name": "grade", "status": "running", "label": "Evaluating relevance..."}})
                elif node_name in ("generate", "generate_chat"):
                    yield json.dumps({"step": {"name": "generate", "status": "running", "label": "Synthesizing answer..."}})
                    
            elif kind == "on_chain_end":
                node_name = event.get("name", "")
                output = event.get("data", {}).get("output", {})
                
                if node_name == "router":
                    step = output.get("current_step", "")
                    route_label = {
                        "routing_web": "Web Research",
                        "routing_vector": "Document Search", 
                        "routing_chat": "Conversation"
                    }.get(step, step)
                    if step == "routing_web" and output.get("research_mode") == "academic":
                        route_label = "Paper Research"
                    yield json.dumps({"step": {"name": "router", "status": "done", "label": f"Route: {route_label}"}})
                    
                elif node_name == "search":
                    sources = output.get("sources", [])
                    yield json.dumps({"step": {"name": "search", "status": "done", "label": f"Found {len(sources)} sources"}})
                    # Send sources
                    if sources:
                        yield json.dumps({"sources": sources})
                        sources_sent = True
                        
                elif node_name == "grade":
                    passed = output.get("grade_passed", True)
                    label = "Results relevant ✓" if passed else "Low relevance ⚠️"
                    yield json.dumps({"step": {"name": "grade", "status": "done", "label": label}})
                    
                elif node_name in ("generate", "generate_chat"):
                    answer = output.get("answer", "")
                    if answer:
                        yield json.dumps({"token": answer})
                    yield json.dumps({"step": {"name": "generate", "status": "done", "label": "Complete"}})
        
        yield json.dumps({"done": True})
    
    return EventSourceResponse(event_generator())

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    chat_id: str = Form(...) 
):
    try:
        print(f"--- UPLOAD: Receiving file {file.filename} for chat_id={chat_id} ---")
        content = ""
        filename = file.filename.lower()
        
        if filename.endswith(".pdf"):
            print("--- UPLOAD: Processing PDF ---")
            try:
                from pypdf import PdfReader
                import io
                file_bytes = await file.read()
                reader = PdfReader(io.BytesIO(file_bytes))
                print(f"--- UPLOAD: PDF has {len(reader.pages)} pages ---")
                
                for page_num, page in enumerate(reader.pages):
                    text = page.extract_text()
                    if text and len(text.strip()) > 10:
                        content += text + "\n"
                    else:
                        # Vision OCR fallback
                        try:
                            if hasattr(page, 'images') and page.images:
                                for img in page.images:
                                    try:
                                        transcription = await transcribe_image_with_vision(img.data)
                                        content += f"\n[Page {page_num} Transcription]:\n{transcription}\n"
                                    except Exception as tx_err:
                                        print(f"--- UPLOAD: Transcription ERROR: {tx_err} ---")
                        except Exception as img_err:
                            print(f"--- UPLOAD: Image extraction failed: {img_err} ---")
                            
            except Exception as pdf_err:
                print(f"--- UPLOAD: PDF Extraction failed: {pdf_err} ---")
                raise pdf_err
        
        elif filename.endswith((".png", ".jpg", ".jpeg")):
            print(f"--- UPLOAD: Processing Image {filename} ---")
            try:
                image_data = await file.read()
                transcription = await transcribe_image_with_vision(image_data)
                content = f"[Image Transcription of {filename}]:\n{transcription}"
            except Exception as img_err:
                print(f"--- UPLOAD: Image Analysis failed: {img_err} ---")
                raise img_err
        
        else:
            content_bytes = await file.read()
            content = content_bytes.decode("utf-8", errors="ignore")
            
        if not content.strip():
            print("--- UPLOAD WARNING: Content is empty! ---")
        
        await add_documents([content], [{"source": file.filename}], chat_id=chat_id)
        print("--- UPLOAD: Successfully added to vector store ---")
        
        return {"status": "success", "filename": file.filename, "chat_id": chat_id}
            
    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/chat/{chat_id}")
async def delete_chat(chat_id: str):
    """Clear all vector data associated with this chat_id."""
    try:
        delete_chat_documents(chat_id)
        return {"status": "success", "message": f"Data for chat {chat_id} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "Research Architect API"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
