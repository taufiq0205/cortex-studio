from __future__ import annotations

import json
import os
import re
from enum import Enum
from typing import AsyncIterator, Literal

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LM_STUDIO_URL: str = os.getenv(
    "LM_STUDIO_URL", "http://localhost:1234/v1/chat/completions"
)
LM_STUDIO_MODEL: str = os.getenv("LM_STUDIO_MODEL", "gemma")

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Cortex Studio API",
    version="0.4.0",
    description=(
        "A lightweight AI platform demonstrating LLM integration, "
        "streaming responses, structured multi-schema outputs, and agent-style routing. "
        "Visit `/docs` for the interactive API explorer."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Tool / schema definitions
# ---------------------------------------------------------------------------


class Tool(str, Enum):
    SUMMARIZE = "summarize"
    SENTIMENT = "sentiment"
    ENTITIES  = "entities"


# ── Pydantic output models (used for server-side validation) ─────────────

class SummarizeOutput(BaseModel):
    summary: str = Field(..., description="Concise summary of the topic")
    keywords: list[str] = Field(..., description="Key terms extracted from the topic")


class SentimentOutput(BaseModel):
    sentiment: Literal["positive", "neutral", "negative"] = Field(
        ..., description="Overall sentiment detected"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0"
    )
    reasoning: str = Field(..., description="Brief explanation of the sentiment verdict")


class EntityOutput(BaseModel):
    people: list[str] = Field(default_factory=list, description="Named people mentioned")
    places: list[str] = Field(default_factory=list, description="Locations or places mentioned")
    organizations: list[str] = Field(default_factory=list, description="Organizations or companies mentioned")
    concepts: list[str] = Field(default_factory=list, description="Key abstract concepts or topics")


# ── System prompts per tool ──────────────────────────────────────────────

_TOOL_PROMPTS: dict[Tool, str] = {
    Tool.SUMMARIZE: (
        'Return ONLY valid JSON matching this schema exactly: '
        '{"summary": "<string>", "keywords": ["<string>", ...]}. '
        "No explanations, no markdown fences, no extra keys."
    ),
    Tool.SENTIMENT: (
        'Return ONLY valid JSON matching this schema exactly: '
        '{"sentiment": "positive"|"neutral"|"negative", "confidence": <float 0-1>, "reasoning": "<string>"}. '
        "confidence must be a number. No explanations, no markdown fences."
    ),
    Tool.ENTITIES: (
        'Return ONLY valid JSON matching this schema exactly: '
        '{"people": ["<string>", ...], "places": ["<string>", ...], '
        '"organizations": ["<string>", ...], "concepts": ["<string>", ...]}. '
        "Lists may be empty if nothing is found. No markdown fences."
    ),
}

_TOOL_MODELS: dict[Tool, type[BaseModel]] = {
    Tool.SUMMARIZE: SummarizeOutput,
    Tool.SENTIMENT: SentimentOutput,
    Tool.ENTITIES:  EntityOutput,
}

# ---------------------------------------------------------------------------
# Data models — request / response
# ---------------------------------------------------------------------------


class HistoryMessage(BaseModel):
    """A single prior turn in the conversation."""
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Current user message")
    mode: Literal["chat", "json"] | None = Field(
        None,
        description=(
            "'chat' → direct reply; 'json' → structured JSON output. "
            "Omit for automatic agent routing."
        ),
    )
    history: list[HistoryMessage] = Field(
        default_factory=list,
        description="Prior conversation turns for multi-turn context.",
    )


# ---------------------------------------------------------------------------
# Agent routing
# ---------------------------------------------------------------------------

# JSON-intent patterns → triggers JSON mode in auto routing
_JSON_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bsummar(ize|ise|y)\b", re.IGNORECASE),
    re.compile(r"\banalyz(e|se)\b", re.IGNORECASE),
    re.compile(r"\bextract\b", re.IGNORECASE),
    re.compile(r"\blist (the )?(key|main|top|important)\b", re.IGNORECASE),
    re.compile(r"\bkey (points?|takeaway|concept|term|idea)\b", re.IGNORECASE),
    re.compile(r"\bidentify\b", re.IGNORECASE),
    re.compile(r"\bclassify\b", re.IGNORECASE),
    re.compile(r"\bcategorize\b", re.IGNORECASE),
    re.compile(r"\benumerate\b", re.IGNORECASE),
    re.compile(r"\bcompare\b", re.IGNORECASE),
    re.compile(r"\bgive me (a )?(brief|short|quick) overview\b", re.IGNORECASE),
    re.compile(r"\bsentiment\b", re.IGNORECASE),
    re.compile(r"\bwhat (is|are) (the )?(tone|feeling|opinion)\b", re.IGNORECASE),
    re.compile(r"\b(who|what|where) (is|are) mentioned\b", re.IGNORECASE),
    re.compile(r"\bentities\b", re.IGNORECASE),
    re.compile(r"\bpeople (and|or) (places|organizations)\b", re.IGNORECASE),
]

# Sentiment-specific
_SENTIMENT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bsentiment\b", re.IGNORECASE),
    re.compile(r"\b(positive|negative|neutral)\b", re.IGNORECASE),
    re.compile(r"\btone\b", re.IGNORECASE),
    re.compile(r"\bfeeling\b", re.IGNORECASE),
    re.compile(r"\bemotion(s|al)?\b", re.IGNORECASE),
    re.compile(r"\bopinion\b", re.IGNORECASE),
    re.compile(r"\bvibe\b", re.IGNORECASE),
]

# Entity-extraction-specific
_ENTITY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bentities\b", re.IGNORECASE),
    re.compile(r"\bwho (is|are) mentioned\b", re.IGNORECASE),
    re.compile(r"\bpeople (and|or) (places?|organizations?)\b", re.IGNORECASE),
    re.compile(r"\bnamed (entities|people|persons)\b", re.IGNORECASE),
    re.compile(r"\borganizations? (mentioned|in)\b", re.IGNORECASE),
    re.compile(r"\bextract (people|names?|entities)\b", re.IGNORECASE),
]


def resolve_mode(
    message: str, requested_mode: Literal["chat", "json"] | None
) -> Literal["chat", "json"]:
    """
    Priority:
      1. Explicit mode from the caller.
      2. Pattern-based routing: any JSON-intent pattern → json.
      3. Default: chat.
    """
    if requested_mode is not None:
        return requested_mode
    if any(p.search(message) for p in _JSON_PATTERNS):
        return "json"
    return "chat"


def resolve_tool(message: str) -> Tool:
    """Pick the JSON schema/tool based on message intent."""
    if any(p.search(message) for p in _ENTITY_PATTERNS):
        return Tool.ENTITIES
    if any(p.search(message) for p in _SENTIMENT_PATTERNS):
        return Tool.SENTIMENT
    return Tool.SUMMARIZE


def build_messages(
    message: str,
    mode: Literal["chat", "json"],
    tool: Tool,
    history: list[HistoryMessage],
) -> list[dict[str, str]]:
    """Construct the full OpenAI messages array with history and system prompt."""
    turns: list[dict[str, str]] = []
    if mode == "json":
        turns.append({"role": "system", "content": _TOOL_PROMPTS[tool]})
    for h in history:
        turns.append({"role": h.role, "content": h.content})
    turns.append({"role": "user", "content": message})
    return turns


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def collect_lm_studio(
    messages: list[dict[str, str]],
    temperature: float = 0.7,
) -> str:
    """Non-streaming call to LM Studio — for JSON mode validation."""
    payload = {
        "model": LM_STUDIO_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(LM_STUDIO_URL, json=payload)
            response.raise_for_status()
    except httpx.ConnectError as exc:
        raise RuntimeError("Cannot reach LM Studio. Make sure it is running.") from exc
    except httpx.TimeoutException as exc:
        raise RuntimeError("LM Studio request timed out.") from exc
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"LM Studio returned HTTP {exc.response.status_code}.") from exc

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"Unexpected response format from LM Studio: {data}") from exc


async def stream_lm_studio(
    messages: list[dict[str, str]],
    temperature: float = 0.7,
) -> AsyncIterator[str]:
    """Streaming call to LM Studio — for chat mode."""
    payload = {
        "model": LM_STUDIO_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", LM_STUDIO_URL, json=payload) as response:
                if response.status_code != 200:
                    yield _sse({"type": "error", "detail": f"LM Studio returned HTTP {response.status_code}"})
                    return
                async for raw_line in response.aiter_lines():
                    if not raw_line.startswith("data: "):
                        continue
                    chunk_str = raw_line[6:]
                    if chunk_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(chunk_str)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield _sse({"type": "token", "content": delta})
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except httpx.ConnectError:
        yield _sse({"type": "error", "detail": "Cannot reach LM Studio. Make sure it is running."})
        return
    except httpx.TimeoutException:
        yield _sse({"type": "error", "detail": "LM Studio request timed out."})
        return
    yield _sse({"type": "done"})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", summary="Health check", tags=["Meta"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "Cortex Studio API", "version": "0.4.0"}


@app.post("/chat", summary="Send a message (streaming SSE)", tags=["Chat"])
async def chat(request: ChatRequest) -> StreamingResponse:
    """Stream the LLM reply as Server-Sent Events.

    **Chat mode**: tokens streamed one-by-one as the model generates them.

    **JSON mode**: response collected, stripped of markdown, validated against
    one of three schemas (`summarize`, `sentiment`, `entities`) selected by
    the agent router. Returns a structured, pretty-printed JSON block only
    after passing Pydantic validation — guaranteeing schema conformance.

    **SSE event shape:**
    - `{"type": "meta",  "mode_used": "chat"|"json", "schema_used": "summarize"|"sentiment"|"entities"|null}`
    - `{"type": "token", "content": "..."}` — per token (chat) or full JSON (json mode)
    - `{"type": "done"}`
    - `{"type": "error", "detail": "..."}`
    """
    mode = resolve_mode(request.message, request.mode)
    tool = resolve_tool(request.message) if mode == "json" else Tool.SUMMARIZE
    messages = build_messages(request.message, mode, tool, request.history)

    async def event_generator() -> AsyncIterator[str]:
        yield _sse({
            "type": "meta",
            "mode_used": mode,
            "schema_used": tool.value if mode == "json" else None,
        })

        if mode == "json":
            try:
                raw = await collect_lm_studio(messages)
            except RuntimeError as exc:
                yield _sse({"type": "error", "detail": str(exc)})
                return

            # Strip accidental markdown fences
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)

            try:
                parsed = json.loads(cleaned)
                model_cls = _TOOL_MODELS[tool]
                validated = model_cls(**parsed)
                formatted = json.dumps(validated.model_dump(), indent=2)
                yield _sse({"type": "token", "content": formatted})
            except json.JSONDecodeError:
                yield _sse({"type": "error", "detail": f"LLM did not return valid JSON.\nRaw output:\n{raw}"})
                return
            except ValidationError as exc:
                yield _sse({"type": "error", "detail": f"Schema mismatch ({exc.error_count()} error(s)).\nRaw output:\n{raw}"})
                return

        else:
            async for event in stream_lm_studio(messages):
                yield event
            return

        yield _sse({"type": "done"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
