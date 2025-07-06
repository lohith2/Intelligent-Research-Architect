import uvicorn
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Optional

class Message(BaseModel):
    role: str
    content: str
    attachments: Optional[List[dict]] = None
    
class ResearchRequest(BaseModel):
    query: str
    chat_id: Optional[str] = None
    messages: List[Message] = []
    attachments: Optional[List[dict]] = None

if __name__ == "__main__":
    load_dotenv()
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
