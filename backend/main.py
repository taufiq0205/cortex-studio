from __future__ import annotations

import json
import os
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LM_STUDIO_URL: str = os.getenv(
    "LM_STUDIO_URL", "http://localhost:1234/v1/chat/completions"
)
LM_STUDIO_MODEL: str = os.getenv("LM_STUDIO_MODEL", "gemma")

JSON_SYSTEM_PROMPT = (
    'Return ONLY valid JSON matching this schema: {"summary": string, "keywords": string[]}. '
    "No explanations, no markdown."
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Cortex Studio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User message to send to the LLM")
    mode: Literal["chat", "json"] | None = Field(
        None,
        description=(
            "Inference mode. 'chat' sends the message directly; "
            "'json' enforces structured JSON output. "
            "Omit to enable automatic agent routing."
        ),
    )


class ChatResponse(BaseModel):
    reply: str = Field(..., description="Raw text reply from the LLM")
    mode_used: Literal["chat", "json"] = Field(
        ..., description="The mode that was actually used for this request"
    )

# ---------------------------------------------------------------------------
# LLM helper
# ---------------------------------------------------------------------------


async def call_lm_studio(
    messages: list[dict[str, str]],
    temperature: float = 0.7,
) -> str:
    """Send a request to the LM Studio OpenAI-compatible endpoint and return the
    assistant's reply text."""
    payload = {
        "model": LM_STUDIO_MODEL,
        "messages": messages,
        "temperature": temperature,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(LM_STUDIO_URL, json=payload)
            response.raise_for_status()
        except httpx.ConnectError as exc:
            raise HTTPException(
                status_code=503,
                detail="Cannot reach LM Studio. Make sure it is running on the configured URL.",
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"LM Studio returned an error: {exc.response.status_code}",
            ) from exc
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=504,
                detail="LM Studio request timed out.",
            ) from exc

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected response format from LM Studio: {data}",
        ) from exc


# ---------------------------------------------------------------------------
# Agent routing
# ---------------------------------------------------------------------------


def resolve_mode(message: str, requested_mode: Literal["chat", "json"] | None) -> Literal["chat", "json"]:
    """Determine which inference mode to use.

    Priority:
    1. Explicit mode from the caller.
    2. Agent routing: messages that contain 'summarize' → json, otherwise → chat.
    """
    if requested_mode is not None:
        return requested_mode
    return "json" if "summarize" in message.lower() else "chat"


def build_messages(message: str, mode: Literal["chat", "json"]) -> list[dict[str, str]]:
    """Construct the OpenAI-format messages list."""
    if mode == "json":
        return [
            {"role": "system", "content": JSON_SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ]
    return [{"role": "user", "content": message}]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", summary="Health check")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "Cortex Studio API"}


@app.post("/chat", response_model=ChatResponse, summary="Send a message to the LLM")
async def chat(request: ChatRequest) -> ChatResponse:
    mode = resolve_mode(request.message, request.mode)
    messages = build_messages(request.message, mode)
    reply = await call_lm_studio(messages)
    return ChatResponse(reply=reply, mode_used=mode)
