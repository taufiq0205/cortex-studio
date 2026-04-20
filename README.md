# 🧠 Cortex Studio

**Full-stack AI platform demonstrating LLM integration, structured outputs, and agent-style routing.**

Built with Next.js + FastAPI + LM Studio. No LangChain. No magic. Just clean, readable code that shows you understand how LLM systems actually work.

---

## Features

| Feature | Description |
|---|---|
| **Real-time Streaming** | Responses stream token-by-token via Server-Sent Events — no waiting for the full reply |
| **Multi-turn Conversation** | Full conversation history is sent with every request for genuine contextual memory |
| **Smart Agent Routing** | 16+ regex patterns auto-detect intent and select the right mode — no manual selection needed |
| **3 Structured JSON Schemas** | `summarize`, `sentiment`, and `entities` — each server-side validated with Pydantic before delivery |
| **Professional UI** | Glassmorphism design with avatars, timestamps, message animations, copy-to-clipboard, and schema badges |
| **Session Persistence** | Chat history survives page refresh via `localStorage` |
| **Zero heavy AI frameworks** | No LangChain, no LlamaIndex — pure `httpx` on the backend, plain `fetch` on the frontend |

---

## Architecture

```
┌─────────────────────┐     SSE stream      ┌────────────────────┐     HTTP/stream     ┌──────────────────┐
│  Next.js Frontend   │ ──────────────────▶ │  FastAPI Backend   │ ──────────────────▶ │   LM Studio      │
│  (App Router + TS)  │ ◀────────────────── │  (Python + httpx)  │ ◀────────────────── │  (Local LLM)     │
└─────────────────────┘   text/event-stream └────────────────────┘   OpenAI-compat API └──────────────────┘
        :3000                                       :8000                                      :1234
```

**Request lifecycle:**
1. User types a message; the frontend collects the full conversation history
2. `POST /chat` — sends `{ message, mode?, history[] }` to FastAPI
3. FastAPI runs `resolve_mode()` → `resolve_tool()` to pick mode and JSON schema
4. **Chat mode:** FastAPI proxies a streaming request to LM Studio and pipes SSE tokens directly to the browser
5. **JSON mode:** FastAPI collects the full response, strips markdown fences, validates with Pydantic, then emits a single formatted JSON block
6. The frontend renders tokens live; JSON responses use JetBrains Mono and a schema-colored badge

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Python 3.11+, FastAPI 0.115+, Uvicorn, httpx |
| AI Layer | LM Studio, Gemma / any GGUF (OpenAI-compatible API) |
| Fonts | Inter (UI), JetBrains Mono (JSON output) via `next/font/google` |
| Testing | pytest 8+ (30 passing unit tests) |

---

## Setup

### 1. LM Studio

1. Download [LM Studio](https://lmstudio.ai/) and install it
2. Download a model — Gemma 2B / 7B recommended (any GGUF works)
3. Go to the **Local Server** tab → click **Start Server**
4. Confirm it is running at `http://localhost:1234`

---

### 2. Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment (optional — defaults work out of the box)
copy .env.example .env          # Windows
# cp .env.example .env          # macOS / Linux

# Start the server
uvicorn main:app --reload --port 8000
```

Backend available at `http://localhost:8000` · Interactive API docs at `http://localhost:8000/docs`

---

### 3. Frontend

```bash
cd frontend

# Configure environment
copy .env.local.example .env.local   # Windows
# cp .env.local.example .env.local   # macOS / Linux

npm install
npm run dev
```

Frontend available at `http://localhost:3000`

---

### Environment Variables

**Backend (`backend/.env`)**

| Variable | Default | Description |
|---|---|---|
| `LM_STUDIO_URL` | `http://localhost:1234/v1/chat/completions` | LM Studio API endpoint |
| `LM_STUDIO_MODEL` | `gemma` | Model name to pass in the payload |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |

**Frontend (`frontend/.env.local`)**

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL |

---

## API Documentation

Interactive Swagger UI is available at **`http://localhost:8000/docs`** when the backend is running.

### `POST /chat`

Streams the LLM reply as Server-Sent Events.

**Request**

```http
POST http://localhost:8000/chat
Content-Type: application/json
```

```json
{
  "message": "string",
  "mode": "chat" | "json",
  "history": [
    { "role": "user",      "content": "string" },
    { "role": "assistant", "content": "string" }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | Current user message |
| `mode` | `"chat"` \| `"json"` | No | Force a mode. Omit to trigger auto agent routing |
| `history` | array | No | Prior conversation turns for multi-turn context |

---

**SSE Event Stream**

The response is `Content-Type: text/event-stream`. Events arrive as `data: <JSON>\n\n` lines:

| Event | Shape | Description |
|---|---|---|
| `meta` | `{"type":"meta","mode_used":"chat"\|"json","schema_used":"summarize"\|"sentiment"\|"entities"\|null}` | First event — signals which mode and schema were selected |
| `token` | `{"type":"token","content":"..."}` | One per generated token (chat) or full JSON block (json mode) |
| `done` | `{"type":"done"}` | End of stream |
| `error` | `{"type":"error","detail":"..."}` | Any failure — LM Studio unreachable, timeout, schema mismatch |

---

### `GET /`

Health check.

```json
{ "status": "ok", "service": "Cortex Studio API", "version": "0.4.0" }
```

---

## Agent Routing

### Mode Routing (`resolve_mode`)

If no `mode` is passed, the backend scans the message against **16+ compiled regex patterns** to choose `chat` or `json`:

```
"summarize" / "summarise"  → json
"analyze" / "analyse"      → json
"extract"                  → json
"list the key/main..."     → json
"identify"                 → json
"classify" / "categorize"  → json
"sentiment" / "tone"       → json
"entities" / "who mentioned" → json
everything else            → chat
```

### Tool / Schema Routing (`resolve_tool`)

Once `json` mode is selected, a second routing pass picks the **JSON schema**:

| Trigger phrases | Schema selected | Output shape |
|---|---|---|
| summarize, analyze, extract, key points... | `summarize` | `{ "summary": string, "keywords": string[] }` |
| sentiment, tone, feeling, emotion, opinion... | `sentiment` | `{ "sentiment": "positive"\|"neutral"\|"negative", "confidence": float, "reasoning": string }` |
| entities, who is mentioned, named entities... | `entities` | `{ "people": [], "places": [], "organizations": [], "concepts": [] }` |

All JSON outputs are **Pydantic-validated on the backend** before being sent to the client. Markdown fences accidentally added by the model are automatically stripped.

---

## Example Input / Output

### Chat Mode

**Request:**
```json
{
  "message": "What is retrieval-augmented generation?",
  "mode": "chat",
  "history": []
}
```

**SSE stream:**
```
data: {"type":"meta","mode_used":"chat","schema_used":null}
data: {"type":"token","content":"Retrieval-Augmented Generation (RAG) "}
data: {"type":"token","content":"is a technique that combines..."}
...
data: {"type":"done"}
```

---

### JSON Mode — Summarize (auto-routed)

**Request:**
```json
{ "message": "Summarize AI in e-commerce" }
```

**SSE stream:**
```
data: {"type":"meta","mode_used":"json","schema_used":"summarize"}
data: {"type":"token","content":"{\n  \"summary\": \"AI in e-commerce enables personalized recommendations...\",\n  \"keywords\": [\"personalization\", \"dynamic pricing\", \"chatbots\"]\n}"}
data: {"type":"done"}
```

---

### JSON Mode — Sentiment (auto-routed)

**Request:**
```json
{ "message": "What is the sentiment of: 'This product completely exceeded my expectations!'" }
```

**SSE stream:**
```
data: {"type":"meta","mode_used":"json","schema_used":"sentiment"}
data: {"type":"token","content":"{\n  \"sentiment\": \"positive\",\n  \"confidence\": 0.97,\n  \"reasoning\": \"Strong positive language with 'exceeded expectations'\"\n}"}
data: {"type":"done"}
```

---

### JSON Mode — Entities (auto-routed)

**Request:**
```json
{ "message": "Who is mentioned in: 'Elon Musk founded SpaceX in California in 2002.'" }
```

**SSE stream:**
```
data: {"type":"meta","mode_used":"json","schema_used":"entities"}
data: {"type":"token","content":"{\n  \"people\": [\"Elon Musk\"],\n  \"places\": [\"California\"],\n  \"organizations\": [\"SpaceX\"],\n  \"concepts\": [\"aerospace\", \"private spaceflight\"]\n}"}
data: {"type":"done"}
```

---

## Running Tests

```bash
cd backend
.venv\Scripts\pytest tests/ -v      # Windows
# .venv/bin/pytest tests/ -v        # macOS / Linux
```

```
30 passed in 0.33s
```

Tests cover:
- `resolve_mode` — all 16+ routing patterns, case insensitivity, explicit overrides
- `resolve_tool` — schema selection (summarize / sentiment / entities), priority ordering
- `build_messages` — history injection, system prompt placement, per-tool prompt correctness

---

## Project Structure

```
cortex-studio/
├── backend/
│   ├── main.py              # FastAPI app, agent routing, streaming, Pydantic schemas
│   ├── requirements.txt     # fastapi, uvicorn, httpx, pydantic, pytest
│   ├── .env.example         # Environment variable template
│   └── tests/
│       └── test_main.py     # 30 unit tests
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx         # Full chat UI — streaming, history, localStorage, copy
│   │   ├── layout.tsx       # Font loading (Inter + JetBrains Mono), metadata
│   │   └── globals.css      # Animations, scrollbar, CSS variables
│   ├── .env.local.example   # Frontend env variable template
│   └── package.json
├── docs/
│   └── architecture.md      # System design and data flow
├── README.md
└── .gitignore
```

---

## Design Philosophy

**Minimal dependencies, maximum clarity.**

- The backend is a single `main.py`. Every function is readable in isolation — no magic, no autowiring
- Prompt engineering is done inline — you can read the exact system prompt that enforces each JSON schema
- Routing is explicit: `resolve_mode()` checks 16 regex patterns; `resolve_tool()` picks the right Pydantic schema — easy to extend to embeddings-based classification
- The OpenAI-compatible API format means you can swap LM Studio for any provider (OpenAI, Anthropic via compatibility layer, Ollama) by changing one environment variable
- SSE streaming is implemented directly with `httpx.AsyncClient` — no third-party streaming libraries

This is the kind of code that is maintainable at scale: explicit over implicit, flat over nested, boring over clever.

---

## Author

Built by me as a portfolio project demonstrating full-stack AI engineering skills.

---

*Stack: Next.js · FastAPI · LM Studio · TypeScript · Python · Tailwind CSS · pytest*
