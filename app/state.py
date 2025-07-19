from typing import TypedDict, List, Optional

class Source(TypedDict, total=False):
    title: str
    url: str
    snippet: str
    provider: str
    authors: str
    year: str
    venue: str
    doi: str
    citation_count: int
    pdf_url: str
    source_type: str
    paper_role: str
    provenance: str

class AgentState(TypedDict):
    question: str
    chat_history: List[dict]
    filters: Optional[List[str]]
    context: List[str]
    steps_taken: List[str]
    current_step: Optional[str]
    research_mode: Optional[str]
    answer: Optional[str]
    chat_id: Optional[str]
    sources: List[Source]
    grade_passed: Optional[bool]
