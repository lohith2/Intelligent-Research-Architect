# 🔭 Intelligent Research Architect

> AI-powered research assistant for paper discovery, literature review, document analysis, and source-backed synthesis.

🌐 **Live App:** [intelligent-research-architect.vercel.app](https://intelligent-research-architect.vercel.app/)

---

## ✨ Features

| Capability | Description |
|---|---|
| 📚 **Scholarly Search** | Search academic sources and synthesize paper-focused answers |
| 📄 **Document Upload** | Upload PDFs, text files, and images for document-aware research |
| 🧠 **Session Memory** | Chat memory scoped per session — no cross-contamination |
| 🃏 **Source Cards** | View research steps, source citations, and streaming answers |
| 📤 **Export Tools** | Export as Markdown, BibTeX, reading lists, and reading paths |
| 🔍 **Research Filters** | Filter by `Recent` · `Survey` · `Benchmark` · `Seminal` |

---

## 🛠️ Tech Stack

### Frontend
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-black?style=flat&logo=framer&logoColor=white)

### Backend
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi)
![LangGraph](https://img.shields.io/badge/LangGraph-FF6B35?style=flat)
![Google Gemini](https://img.shields.io/badge/Google_Gemini-4285F4?style=flat&logo=google&logoColor=white)
![Chroma](https://img.shields.io/badge/Chroma_Vector_DB-000000?style=flat)
![Tavily](https://img.shields.io/badge/Tavily_Search-FF4785?style=flat)

---

## 📁 Project Structure

```
Intelligent-Research-Architect/
├── app/          # FastAPI backend, agent logic, vector store, scholarly search
└── frontend/     # React + Vite frontend
```

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/lohith2/Intelligent-Research-Architect.git
cd "Intelligent Research Architect"
```

### 2. Set up virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
GOOGLE_API_KEY=your_google_api_key
TAVILY_API_KEY=your_tavily_api_key
GEMINI_MODEL=gemini-2.5-flash
SEMANTIC_SCHOLAR_API_KEY=optional
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

### 5. Run locally

```bash
# Start backend
./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001

# Start frontend (new terminal)
cd frontend && npm run dev
```

| Service | URL |
|---|---|
| 🖥️ Frontend | http://127.0.0.1:5173 |
| ⚙️ Backend | http://127.0.0.1:8001 |

---

## 💡 Example Prompts

```
Find recent survey papers on retrieval augmented generation evaluation
```
```
Compare benchmark papers for multimodal reasoning since 2023
```
```
What are the main research gaps in mechanistic interpretability for transformers?
```
```
Summarize this uploaded paper and list its datasets, metrics, and limitations
```

---

## 🏆 Why This Over a Generic Chatbot?

- **Literature-first design** — purpose-built for academic research workflows, not general Q&A
- **Isolated sessions** — per-chat memory keeps research contexts clean and separate
- **Source-traceable outputs** — every claim links back to a paper, not a black-box response
- **Reusable artifacts** — export to BibTeX or reading lists to feed directly into your workflow

---

## ⚙️ Notes

- Best results with valid API keys and strong scholarly provider coverage
- Answer freshness depends on Tavily and Semantic Scholar index recency
- Gemini 2.5 Flash is used by default — swap `GEMINI_MODEL` for Pro if needed
