# Cortex Studio — Architecture

## System Overview

Cortex Studio is a full-stack AI platform composed of three layers that communicate over HTTP:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cortex Studio                            │
│                                                                 │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │   Next.js   │────▶│   FastAPI    │────▶│   LM Studio     │  │
│  │  Frontend   │◀────│   Backend    │◀────│  (Local LLM)    │  │
│  │  :3000      │     │  :8000       │     │  :1234          │  │
│  └─────────────┘     └──────────────┘     └─────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### Frontend — Next.js (App Router, TypeScript, Tailwind CSS)

**Location:** `frontend/`

Responsibilities:
- Renders the chat UI (textarea, mode dropdown, send button, response panel)
- Maintains local state: message input, selected mode, response, loading flag
- POSTs to `http://localhost:8000/chat` with `{ message, mode }`
- Displays raw or JSON-formatted response in a `<pre>` block

Key files:
- `frontend/app/page.tsx` — main page component
- `frontend/components/ChatInterface.tsx` — chat UI with mode toggle

---

### Backend — FastAPI (Python)

**Location:** `backend/main.py`

Responsibilities:
- Exposes `POST /chat` endpoint
- Implements agent routing logic (mode detection)
- Builds the appropriate prompt for Chat or JSON mode
- Forwards the request to LM Studio via OpenAI-compatible HTTP call
- Returns the model's response to the frontend

Key modules (all in `main.py` to stay minimal):
- `route_mode()` — agent routing function
- `build_messages()` — prompt construction
- `call_lm_studio()` — HTTP client for LM Studio

---

### AI Layer — LM Studio

**Location:** External process on `http://localhost:1234`

Responsibilities:
- Hosts a local LLM (Gemma or any compatible model)
- Exposes an OpenAI-compatible REST API
- Accepts `POST /v1/chat/completions` with messages array
- Returns generated text completions

---

## Data Flow

### Chat Mode

```
User types message
       │
       ▼
Frontend: POST /chat { message: "Hello", mode: "chat" }
       │
       ▼
Backend: mode = "chat"
  → messages = [
      { role: "user", content: "Hello" }
    ]
       │
       ▼
LM Studio: POST /v1/chat/completions
  → model: "gemma"
  → temperature: 0.7
       │
       ▼
Backend: extract choices[0].message.content
       │
       ▼
Frontend: display response in <pre> block
```

---

### JSON Mode

```
User types message (or selects JSON mode explicitly)
       │
       ▼
Frontend: POST /chat { message: "Summarize AI in e-commerce", mode: "json" }
       │
       ▼
Backend: mode = "json"
  → messages = [
      { role: "system", content: "Return ONLY valid JSON. No explanations.
                                   Schema: { summary: string, keywords: string[] }" },
      { role: "user",   content: "Summarize AI in e-commerce" }
    ]
       │
       ▼
LM Studio: POST /v1/chat/completions
       │
       ▼
Backend: extract and return raw JSON string
       │
       ▼
Frontend: display structured JSON in <pre> block
```

---

## Agent Routing Logic

When `mode` is omitted from the request, the backend applies a lightweight rule-based router:

```python
def route_mode(message: str) -> str:
    if "summarize" in message.lower():
        return "json"
    return "chat"
```

**Routing table:**

| Condition                        | Resolved Mode | Behavior                        |
|----------------------------------|---------------|---------------------------------|
| `mode = "chat"` (explicit)       | chat          | Direct LLM call, free text      |
| `mode = "json"` (explicit)       | json          | System prompt enforces JSON     |
| `mode` omitted, "summarize" in msg | json        | Auto-routed to JSON mode        |
| `mode` omitted, no keyword match | chat          | Default free-text response      |

This pattern is a minimal approximation of intent-based agent routing without framework overhead.

---

## Design Decisions

| Decision                        | Rationale                                                   |
|---------------------------------|-------------------------------------------------------------|
| No LangChain / heavy frameworks | Demonstrates understanding of underlying LLM mechanics      |
| Single `main.py` backend        | Clarity over premature abstraction for a portfolio MVP      |
| OpenAI-compatible API format    | Portable: swap LM Studio for OpenAI/Anthropic with one line |
| Rule-based routing              | Simple, transparent, debuggable — appropriate for MVP scope |
| System prompt for JSON mode     | Standard prompt-engineering pattern; no schema lib needed   |

---

## Port Reference

| Service    | Default Port | Configurable |
|------------|-------------|--------------|
| LM Studio  | 1234        | Yes (LM Studio UI) |
| FastAPI    | 8000        | Yes (`uvicorn --port`) |
| Next.js    | 3000        | Yes (`next dev --port`) |
