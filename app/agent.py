from typing import List, AsyncIterator
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from app.state import AgentState
from app.vector_store import add_documents, search_documents
from app.scholarly_search import (
    build_provider_queries,
    fetch_openalex_related_works,
    format_sources_for_context,
    format_reading_path,
    normalize_query,
    rank_sources,
    search_arxiv,
    search_crossref,
    search_openalex,
    search_semantic_scholar,
)

from tavily import TavilyClient
import os

# --- Models ---
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
llm = ChatGoogleGenerativeAI(model=GEMINI_MODEL, temperature=0)
tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

ACADEMIC_KEYWORDS = [
    "paper",
    "papers",
    "phd",
    "literature review",
    "systematic review",
    "meta-analysis",
    "journal",
    "journal article",
    "conference paper",
    "arxiv",
    "pubmed",
    "scholar",
    "citation",
    "citations",
    "methodology",
    "benchmark",
    "baseline",
    "peer reviewed",
    "peer-reviewed",
    "abstract",
]

ACADEMIC_DOMAINS = [
    "arxiv.org",
    "scholar.google.com",
    "semanticscholar.org",
    "pubmed.ncbi.nlm.nih.gov",
    "nature.com",
    "sciencedirect.com",
    "openreview.net",
    "aclanthology.org",
    "ieeexplore.ieee.org",
]

MAX_CONTEXT_SEGMENTS = 6
MAX_CONTEXT_CHARS = 14000
MAX_SEGMENT_CHARS = 2400


def build_academic_query(question: str) -> str:
    normalized = normalize_query(question)
    return (
        f"{normalized} research papers journal articles arxiv "
        f"systematic review benchmark dataset evaluation"
    )


def _trim_text(value: str, max_chars: int) -> str:
    text = (value or "").strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _compress_context_segments(segments: List[str], max_segments: int = MAX_CONTEXT_SEGMENTS) -> str:
    cleaned_segments = [_trim_text(segment, MAX_SEGMENT_CHARS) for segment in segments if segment and segment.strip()]
    if len(cleaned_segments) > max_segments:
        cleaned_segments = cleaned_segments[:max_segments]

    compressed: List[str] = []
    total = 0
    for segment in cleaned_segments:
        remaining = MAX_CONTEXT_CHARS - total
        if remaining <= 0:
            break
        clipped = _trim_text(segment, min(MAX_SEGMENT_CHARS, remaining))
        if not clipped:
            continue
        compressed.append(clipped)
        total += len(clipped)

    return "\n\n".join(compressed)

# --- Nodes ---

async def router_node(state: AgentState):
    """
    Decide whether to search web, search vector store, or just chat.
    """
    question = state["question"]
    filters = state.get("filters") or []
    print(f"--- ROUTER: Analyzing '{question}' ---")
    
    q_lower = question.lower()
    
    # Keyword overrides for reliability
    if any(k in q_lower for k in ["doc", "file", "pdf", "uploaded", "content of"]):
        print("--- ROUTER: Keyword detected -> VECTOR ---")
        return {"current_step": "routing_vector"}

    if filters or any(k in q_lower for k in ACADEMIC_KEYWORDS):
        print("--- ROUTER: Keyword detected -> ACADEMIC WEB ---")
        return {"current_step": "routing_web", "research_mode": "academic"}
    
    if any(k in q_lower for k in ["latest", "current", "version", "news", "price", "stock", 
                                     "weather", "today", "now", "vs", "compare", "research",
                                     "study", "evidence", "data on", "statistics"]):
        print("--- ROUTER: Keyword detected -> WEB ---")
        return {"current_step": "routing_web", "research_mode": "web"}
         
    if any(k in q_lower for k in ["remember", "my name", "i told you", "history", "previous"]):
        print("--- ROUTER: Keyword detected -> CHAT ---")
        return {"current_step": "routing_chat"}

    if any(k in q_lower for k in ["why", "how", "compare", "evidence", "method", "methods", "benchmark", "benchmarks", "dataset", "datasets", "literature", "review"]):
        print("--- ROUTER: Defaulting analytical query -> ACADEMIC WEB ---")
        return {"current_step": "routing_web", "research_mode": "academic"}

    # LLM classification fallback
    messages = [
        SystemMessage(content="""You are a routing assistant. Classify the user's query into one of these categories:
        - 'WEB': Needs live external information. CHOOSE THIS for:
            - Current events, news, weather, sports scores.
            - "Latest" or "Current" status of anything (software versions, prices, stocks).
            - Facts that change over time (population, laws, release dates).
            - Research questions that need external evidence, studies, or data.
            - Specific lookup questions where accuracy matters more than conversation.
        - 'CHAT': Purely conversational ("hi", "how are you"), philosophy, creative writing, or fundamental knowledge that is static (e.g. "how to define a function in python", "history of Rome").
        - 'VECTOR': Questions about uploaded files, documents, or "what did I say earlier?".

        Reply with ONLY one word: WEB, CHAT, or VECTOR.
        """),
        HumanMessage(content=question)
    ]
    response = await llm.ainvoke(messages)
    decision = response.content.strip().upper()
    print(f"--- ROUTER: LLM decided -> {decision} ---")
    
    if "WEB" in decision:
        research_mode = "academic" if any(k in q_lower for k in ["research", "study", "evidence", "paper", "papers", "method", "benchmark", "dataset"]) else "web"
        return {"current_step": "routing_web", "research_mode": research_mode}
    elif "VECTOR" in decision:
        return {"current_step": "routing_vector"}
    else:
        return {"current_step": "routing_chat"}

def route_decision(state: AgentState):
    step = state.get("current_step")
    if step == "routing_web":
        return "search"
    elif step == "routing_vector":
        return "generate"
    else:
        # CHAT route — skip vector search entirely
        return "generate_chat"

async def search_node(state: AgentState):
    """
    Search the web using Tavily API and extract structured sources.
    Uses paper-focused search behavior for academic queries.
    """
    question = state["question"]
    research_mode = state.get("research_mode") or "web"
    filters = state.get("filters") or []
    search_query = question
    provider_query = question
    search_kwargs = {"search_depth": "advanced", "max_results": 6}

    if research_mode == "academic":
        search_query = build_academic_query(question)
        provider_query = normalize_query(question)
        provider_queries = build_provider_queries(question, filters=filters)
        search_kwargs["include_domains"] = ACADEMIC_DOMAINS
        print(f"--- SEARCH: Searching academic sources for '{question}' ---")
    else:
        print(f"--- SEARCH: Searching Tavily for '{question}' ---")
    
    sources = []
    results_text = ""
    
    try:
        if research_mode == "academic":
            provider_results: List[dict] = []
            for provider in (
                search_semantic_scholar,
                search_openalex,
                search_arxiv,
                search_crossref,
            ):
                try:
                    provider_name = provider.__name__.replace("search_", "")
                    provider_results.extend(provider(provider_queries.get(provider_name, provider_query)))
                except Exception as provider_err:
                    print(f"--- SEARCH WARNING: {provider.__name__} failed: {provider_err} ---")

            sources = rank_sources(question, provider_results, limit=8, filters=filters)
            expanded_results = list(sources)
            for seed in sources[:2]:
                try:
                    expanded_results.extend(fetch_openalex_related_works(seed, limit=3))
                except Exception as related_err:
                    print(f"--- SEARCH WARNING: related works fetch failed: {related_err} ---")
            sources = rank_sources(question, expanded_results, limit=8, filters=filters)
            results_text = format_sources_for_context(sources)
            reading_path = format_reading_path(sources)
            if reading_path:
                results_text += f"\n\n{reading_path}"

            # Fallback to Tavily with academic-domain filters if the scholarly providers are sparse
            if len(sources) < 4:
                response = tavily.search(query=search_query, **search_kwargs)
                results_list = response.get("results", [])
                tavily_sources = [
                    {
                        "title": r.get("title", "Unknown"),
                        "url": r.get("url", ""),
                        "snippet": (r.get("content", "")[:280] if r.get("content", "") else ""),
                    }
                    for r in results_list
                    if r.get("url")
                ]
                sources = rank_sources(question, sources + tavily_sources, limit=8, filters=filters)
            results_text = format_sources_for_context(sources)
            reading_path = format_reading_path(sources)
            if reading_path:
                results_text += f"\n\n{reading_path}"
        else:
            response = tavily.search(query=search_query, **search_kwargs)
            results_list = response.get('results', [])
            
            # Extract structured sources
            for r in results_list:
                sources.append({
                    "title": r.get('title', 'Unknown'),
                    "url": r.get('url', ''),
                    "snippet": r.get('content', '')[:280]
                })
            
            # Format for context
            results_text = "\n\n".join(
                [
                    f"Source: {r.get('title', 'Unknown')}\n"
                    f"Content: {r.get('content', '')}\n"
                    f"URL: {r.get('url', '')}"
                    for r in results_list
                ]
            )
        
    except Exception as e:
        print(f"--- SEARCH FAILED: {e} ---")
        results_text = f"Search failed: {e}"

    # Store in Vector DB for long-term retrieval
    if isinstance(results_text, str) and results_text.strip():
        await add_documents(
            [results_text], 
            [{"source": f"{research_mode}_search"}], 
            chat_id=state.get("chat_id")
        )
    
    current_context = state.get("context", [])
    if research_mode == "academic":
        current_context.append(f"Scholarly Search Results:\n{results_text}")
    else:
        current_context.append(f"Web Search Results:\n{results_text}") 
    
    return {
        "context": current_context,
        "sources": sources,
        "steps_taken": state.get("steps_taken", []) + ["search"],
        "current_step": "grading",
        "research_mode": research_mode,
        "filters": filters,
    }

async def grade_node(state: AgentState):
    """
    Grade the relevance of search results. If irrelevant, flag it.
    """
    question = state["question"]
    context = state["context"][-1] if state["context"] else ""
    research_mode = state.get("research_mode") or "web"
    mode_hint = (
        "Prefer peer-reviewed papers, preprints, benchmark papers, surveys, or primary academic sources."
        if research_mode == "academic"
        else "Prefer broadly credible and relevant web sources."
    )
    
    messages = [
        SystemMessage(content="""You are a research relevance grader. Evaluate if the search results are relevant and useful 
for answering the user's research question. Consider:
- Do the results directly address the question?
- Are the sources credible and informative?
- Is there enough substance to form a good answer?
- Source preference: """ + mode_hint + """

Reply with ONLY 'YES' or 'NO'."""),
        HumanMessage(content=f"Question: {question}\nContext: {context}")
    ]
    
    response = await llm.ainvoke(messages)
    grade = response.content.strip().upper()
    passed = "YES" in grade
    
    print(f"--- GRADE: {grade} (passed={passed}) ---")
    
    return {
        "steps_taken": state.get("steps_taken", []) + [f"grade ({grade})"],
        "current_step": "generating",
        "grade_passed": passed,
        "research_mode": research_mode,
        "filters": state.get("filters") or [],
    }

async def generate_node(state: AgentState):
    """
    Generate the final answer using web + vector context, with source citations.
    """
    question = state["question"]
    chat_id = state.get("chat_id")
    research_mode = state.get("research_mode") or "web"
    filters = state.get("filters") or []
    
    # Index user question for long-term memory
    if question and question.strip():
        await add_documents(
            texts=[question], 
            metadatas=[{"source": "chat_history", "role": "user"}], 
            chat_id=chat_id
        )
    
    # Scope vector search to specific files if attachments present
    file_filter = None
    history = state.get("chat_history", [])
    if history:
        last_msg = history[-1]
        atts = []
        if isinstance(last_msg, dict):
            atts = last_msg.get('attachments', [])
        elif hasattr(last_msg, 'attachments'):
            atts = last_msg.attachments
            
        if atts:
            file_filter = []
            for a in atts:
                if isinstance(a, dict):
                    file_filter.append(a.get('name'))
                elif hasattr(a, 'name'):
                    file_filter.append(a.name)
    
    # Vector retrieval
    vector_context = await search_documents(question, chat_id=chat_id, file_filter=file_filter, k=5)
    
    # Combine context
    web_context = state.get("context", [])
    combined_context_str = _compress_context_segments(web_context + vector_context)
    sources = state.get("sources", [])

    if research_mode == "academic" and not sources:
        return {
            "steps_taken": state.get("steps_taken", []) + ["generate"],
            "current_step": "complete",
            "answer": (
                "I couldn't find relevant scholarly sources for this query, so I can't reliably summarize recent diffusion model papers from evidence.\n\n"
                "Try narrowing the request, for example:\n"
                "- recent text-to-image diffusion papers\n"
                "- diffusion transformers papers since 2024\n"
                "- sampling efficiency papers for diffusion models\n"
                "- controllability and editing limitations in diffusion papers\n\n"
                "If you'd like, I can help rephrase the search so it targets papers more precisely."
            ),
            "research_mode": research_mode,
            "filters": filters,
            "sources": [],
        }
    
    # Format chat history
    history_messages = []
    if history:
        for msg in history:
            if hasattr(msg, 'role'):
                role, content = msg.role, msg.content
            else:
                role, content = msg.get('role'), msg.get('content')
                
            if role == 'user':
                history_messages.append(HumanMessage(content=content))
            elif role == 'assistant':
                history_messages.append(AIMessage(content=content))
    
    # Build source reference for the prompt
    source_list_str = ""
    if sources:
        source_list_str = "\n\nAvailable Sources:\n" + "\n".join(
            [f"- [{s['title']}]({s['url']})" for s in sources[:8] if s.get('url')]
        )
    
    # Grade warning
    grade_warning = ""
    if state.get("grade_passed") is False:
        grade_warning = """
⚠️ IMPORTANT: The search results were graded as NOT highly relevant to this question.
Inform the user that the sources found may not fully address their query, 
and suggest they refine their research question for better results.
Do NOT fill the gaps with an unsourced literature summary or broad academic background."""

    filter_rules = ""
    if research_mode == "academic" and filters:
        filter_labels = ", ".join(sorted(filters))
        filter_rules = f"- Respect the active research filters: {filter_labels}. If the evidence conflicts with those filters, say so explicitly.\n"

    mode_rules = """ACADEMIC MODE:
- Prioritize papers, surveys, benchmarks, preprints, and other scholarly sources over generic blogs or marketing pages.
- Explicitly name important papers, datasets, metrics, baselines, and methodological differences whenever the context contains them.
- If evidence is mixed, compare methods, datasets, and limitations instead of pretending there is consensus.
- Distinguish between survey/review claims and primary empirical findings.
- If the sources look weak, sparse, or non-academic, say so clearly.
- If there are too few relevant sources to answer confidently, stop and say that instead of using general background knowledge as if it came from papers.
- Highlight research gaps, unresolved questions, and what a PhD student should read next.
- When the context includes a reading path, turn it into a staged reading recommendation: foundational -> benchmark/survey -> current frontier.
- For paper-oriented questions, structure as: Research Question → Key Papers → Datasets/Metrics → Methodological Notes → Limitations/Gaps → Reading List → Sources.
""" + filter_rules if research_mode == "academic" else ""

    system_prompt = f"""You are Research Architect — an intelligent research assistant that synthesizes information from multiple sources into clear, well-cited answers.

RULES:
1. CITATIONS: When using information from web search results, you MUST cite sources inline using markdown links: [Source Title](url). Place citations naturally in the text near the claims they support.
2. SOURCES SECTION: At the end of your response, include a "## Sources" section listing all sources you referenced.
3. MEMORY: Prioritize 'Previous Conversation History'. If the user asks "What is my name?" or "What did I say?", look for it in the history.
4. CONTEXT: You have access to search results and uploaded file content in the 'Context' section. Use them.
5. RELEVANCE: If the context contains irrelevant results, IGNORE them and rely on History or General Knowledge.
6. FILES: If the user asks about an uploaded document, the content will be in the 'Context'.
{grade_warning}
{mode_rules}

FORMATTING:
- Use Markdown headers (##, ###) to organize your answer into clear sections
- Use **bold** for key terms and findings
- Use bullet points for lists of findings or comparisons
- Use code blocks for technical examples
- Keep paragraphs short and scannable
- For research questions, structure as: Overview → Key Findings → Analysis → Sources
{source_list_str}

Be thorough, accurate, and always cite your sources."""

    messages = [
        SystemMessage(content=system_prompt),
    ] + history_messages + [
        HumanMessage(content=f"Research Question: {question}\n\nContext:\n{combined_context_str}")
    ]
    
    response = await llm.ainvoke(messages)
    
    return {
        "steps_taken": state.get("steps_taken", []) + ["generate"],
        "current_step": "complete",
        "answer": response.content,
        "research_mode": research_mode,
        "filters": filters,
    }

async def generate_chat_node(state: AgentState):
    """
    Generate a conversational response (no web search, no vector search).
    For pure chat interactions.
    """
    question = state["question"]
    chat_id = state.get("chat_id")
    
    # Index for memory
    if question and question.strip() and chat_id:
        await add_documents(
            texts=[question], 
            metadatas=[{"source": "chat_history", "role": "user"}], 
            chat_id=chat_id
        )
    
    # Format chat history
    history = state.get("chat_history", [])
    history_messages = []
    if history:
        for msg in history:
            if hasattr(msg, 'role'):
                role, content = msg.role, msg.content
            else:
                role, content = msg.get('role'), msg.get('content')
                
            if role == 'user':
                history_messages.append(HumanMessage(content=content))
            elif role == 'assistant':
                history_messages.append(AIMessage(content=content))
    
    system_prompt = """You are Research Architect — an intelligent research assistant. 
You're currently in conversational mode. Be helpful, friendly, and concise.
If you think the user's question would benefit from a web search or document analysis, 
suggest they rephrase with terms like "research", "latest", "compare", etc.

Use markdown formatting for clarity."""

    messages = [
        SystemMessage(content=system_prompt),
    ] + history_messages + [
        HumanMessage(content=question)
    ]
    
    response = await llm.ainvoke(messages)
    
    return {
        "steps_taken": state.get("steps_taken", []) + ["generate_chat"],
        "current_step": "complete",
        "answer": response.content,
        "sources": [],
        "research_mode": state.get("research_mode"),
    }

# --- Graph Definition ---
def build_agent():
    workflow = StateGraph(AgentState)

    workflow.add_node("router", router_node)
    workflow.add_node("search", search_node)
    workflow.add_node("grade", grade_node)
    workflow.add_node("generate", generate_node)
    workflow.add_node("generate_chat", generate_chat_node)

    workflow.set_entry_point("router")
    
    workflow.add_conditional_edges(
        "router",
        route_decision,
        {
            "search": "search",
            "generate": "generate",
            "generate_chat": "generate_chat"
        }
    )
    
    workflow.add_edge("search", "grade")
    workflow.add_edge("grade", "generate")
    workflow.add_edge("generate", END)
    workflow.add_edge("generate_chat", END)

    return workflow.compile()

# Initialize the agent runnable
agent_runnable = build_agent()
