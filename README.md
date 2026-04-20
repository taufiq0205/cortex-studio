# 🧠 Cortex Studio

**Full-stack AI platform demonstrating LLM integration, structured outputs, and agent-style routing.**

Built with Next.js + FastAPI + LM Studio. No LangChain. No magic. Just clean, readable code that shows you understand how LLM systems actually work.

---

## Features

- **Chat Mode** — Free-form conversation with a locally hosted LLM
- **JSON Mode** — Structured output enforcement via system prompt engineering; returns `{ summary, keywords }` every time
- **Agent Routing** — Automatic mode selection based on message intent (keyword-based dispatcher, no frameworks)
- **Structured Outputs** — Machine-readable responses with a predictable JSON schema
- **Zero heavy dependencies** — Pure `requests` on the backend; plain `fetch` on the frontend

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Next.js   │────▶│   FastAPI    │────▶│  LM Studio  │
│  Frontend   │◀────│   Backend    │◀────│ (Local LLM) │
└─────────────┘     └──────────────┘     └─────────────┘
   :3000                :8000                 :1234
```

**Request lifecycle:**
1. User submits a message with an optional mode from the Next.js UI
2. FastAPI receives the request and applies agent routing if no mode is specified
3. Backend constructs the appropriate prompt (plain or JSON-enforcing system message)
4. LM Studio runs inference on the local model and returns a completion
5. FastAPI extracts the content and sends it back to the frontend

Full data-flow diagrams and component descriptions are in [`docs/architecture.md`](docs/architecture.md).

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend   | Python 3.11+, FastAPI, Uvicorn    |
| AI Layer  | LM Studio, Gemma (OpenAI-compat API) |
| HTTP      | `requests` (Python), `fetch` (browser) |

---

## Setup

### 1. LM Studio

1. Download [LM Studio](https://lmstudio.ai/) and install it
2. Download a model (Gemma 2B / 7B recommended, any GGUF works)
3. Start the local server: **Local Server** tab → **Start Server**
4. Confirm it is running at `http://localhost:1234`

---

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install fastapi uvicorn requests
uvicorn main:app --reload --port 8000
```

Backend will be available at `http://localhost:8000`.

---

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:3000`.

---

## API Documentation

### `POST /chat`

Send a message to the AI backend with an optional mode selector.

**Request**

```http
POST http://localhost:8000/chat
Content-Type: application/json
```

```json
{
  "message": "string",
  "mode": "chat" | "json"   // optional — omit to trigger auto-routing
}
```

| Field     | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `message` | string | Yes      | The user's input text                            |
| `mode`    | string | No       | `"chat"` or `"json"`. Omit for agent routing.   |

---

**Response**

```json
{
  "response": "string",
  "mode": "chat" | "json"
}
```

| Field      | Type   | Description                                              |
|------------|--------|----------------------------------------------------------|
| `response` | string | The model's output (free text or JSON string)            |
| `mode`     | string | The mode that was actually used (after routing)          |

---

## Example Input / Output

### Chat Mode

**Request:**
```json
{
  "message": "What is retrieval-augmented generation?",
  "mode": "chat"
}
```

**Response:**
```json
{
  "response": "Retrieval-Augmented Generation (RAG) is a technique that combines a retrieval system with a generative model. Instead of relying solely on the model's parametric knowledge, RAG fetches relevant documents from an external knowledge base at inference time and includes them in the prompt, allowing the model to produce more accurate and grounded responses.",
  "mode": "chat"
}
```

---

### JSON Mode

**Request:**
```json
{
  "message": "Summarize AI in e-commerce",
  "mode": "json"
}
```

**Response:**
```json
{
  "response": "{\"summary\": \"AI in e-commerce enables personalized recommendations, dynamic pricing, demand forecasting, and intelligent customer support, driving both revenue growth and operational efficiency.\", \"keywords\": [\"personalization\", \"recommendation engines\", \"dynamic pricing\", \"demand forecasting\", \"chatbots\"]}",
  "mode": "json"
}
```

---

### Auto-Routing (no mode specified)

**Request:**
```json
{
  "message": "Summarize the history of neural networks"
}
```

Backend detects `"summarize"` → routes to `json` mode automatically.

---

## Design Philosophy

**Minimal dependencies, maximum clarity.**

- The backend is a single `main.py`. Every function is readable in isolation — no magic, no autowiring.
- Prompt engineering is done inline, not hidden in a chain. You can read the exact system prompt that enforces JSON output.
- The routing logic is four lines of Python. It is easy to extend to regex patterns, intent classifiers, or embeddings-based routing when the project scales.
- The OpenAI-compatible API format means you can swap LM Studio for any provider (OpenAI, Anthropic via compatibility layer, Ollama) by changing one URL and one model name.

This is the kind of code that is maintainable at scale: explicit over implicit, flat over nested, boring over clever.

---

## Future Improvements

- [ ] **Streaming responses** — Use `stream=True` + Server-Sent Events for real-time token output
- [ ] **Multi-model support** — Route different query types to different models (e.g., code → CodeLlama, general → Gemma)
- [ ] **Conversation memory** — Maintain message history per session for multi-turn dialogue
- [ ] **Authentication** — JWT-based auth layer on the FastAPI backend
- [ ] **Embeddings-based routing** — Replace keyword matching with a lightweight vector similarity classifier
- [ ] **JSON schema validation** — Parse and validate JSON mode output against a Pydantic model before returning
- [ ] **Docker Compose** — Single-command local environment setup

---

## Project Structure

```
cortex-studio/
├── backend/
│   └── main.py              # FastAPI app, routing, LM Studio client
├── frontend/
│   ├── app/
│   │   └── page.tsx         # Main page
│   └── components/
│       └── ChatInterface.tsx # Chat UI component
├── docs/
│   └── architecture.md      # System design and data flow
├── README.md
└── .gitignore
```

---

## Author

Built by Taufiq as a portfolio project .

---

*Stack: Next.js · FastAPI · LM Studio · TypeScript · Python*
