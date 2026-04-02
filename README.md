# Intelligent Research Architect

Intelligent Research Architect is an AI research assistant built for paper discovery, literature review, document analysis, and research workflows.

It combines live scholarly search, chat-based research sessions, uploaded document retrieval, and source-backed answers in a simple web interface.

Live app: [Intelligent Research Architect](https://intelligent-research-architect.vercel.app/)

## Features

- Search academic sources and synthesize paper-focused answers
- Upload PDFs, text files, and images for document-aware research
- Keep memory scoped to each chat session
- Show source cards, research steps, and streaming answers
- Export results as Markdown, BibTeX, reading lists, and reading paths
- Apply research filters like `Recent`, `Survey`, `Benchmark`, and `Seminal`

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion

### Backend

- FastAPI
- LangGraph
- LangChain
- Google Gemini
- Chroma vector storage
- Tavily

## Project Structure

```text
app/        FastAPI backend, agent logic, vector store, scholarly search
frontend/   React + Vite frontend
```

## Setup

### 1. Clone the project

```bash
git clone https://github.com/lohith2/Intelligent-Research-Architect.git
cd "Intelligent Research Architect"
```

### 2. Create and activate a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install backend dependencies

```bash
pip install -r requirements.txt
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

## Environment Variables

Create a `.env` file in the project root:

```env
GOOGLE_API_KEY=your_google_api_key
TAVILY_API_KEY=your_tavily_api_key
GEMINI_MODEL=gemini-2.5-flash
SEMANTIC_SCHOLAR_API_KEY=optional
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

## Run Locally

### Start the backend

```bash
./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

### Start the frontend

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://127.0.0.1:5173
```

Backend:

```text
http://127.0.0.1:8001
```

## Example Prompts

- Find recent survey papers on retrieval augmented generation evaluation
- Compare benchmark papers for multimodal reasoning since 2023
- What are the main research gaps in mechanistic interpretability for transformers?
- Summarize this uploaded paper and list its datasets, metrics, and limitations

## What Makes It Useful

- Better suited for literature review than a generic chatbot
- Per-chat memory helps keep research sessions isolated
- Source-aware outputs make it easier to trace claims back to papers
- Export tools help turn searches into reusable research artifacts

## Notes

- Best results come from valid API keys and strong scholarly provider coverage
- Freshness depends on upstream providers like arXiv, OpenAlex, Crossref, Semantic Scholar, and Tavily
- Python 3.10+ is recommended for better long-term compatibility
