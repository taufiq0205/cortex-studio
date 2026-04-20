"""
Unit tests for Cortex Studio backend.

Run with:  pytest backend/tests/ -v
"""
from __future__ import annotations

import json
import sys
import os

# Ensure the backend package is importable when running from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import (  # noqa: E402
    Tool,
    resolve_mode,
    resolve_tool,
    build_messages,
    HistoryMessage,
)

# ---------------------------------------------------------------------------
# resolve_mode — mode routing
# ---------------------------------------------------------------------------


class TestResolveMode:
    """resolve_mode() should respect explicit modes and fall back to routing."""

    def test_explicit_chat_wins(self):
        assert resolve_mode("summarize everything", "chat") == "chat"

    def test_explicit_json_wins(self):
        assert resolve_mode("hello world", "json") == "json"

    def test_summarize_keyword_routes_json(self):
        assert resolve_mode("summarize the history of AI", None) == "json"

    def test_summarise_british_spelling(self):
        assert resolve_mode("summarise this article", None) == "json"

    def test_analyze_routes_json(self):
        assert resolve_mode("analyze this document", None) == "json"

    def test_extract_routes_json(self):
        assert resolve_mode("extract the key points", None) == "json"

    def test_identify_routes_json(self):
        assert resolve_mode("identify the main themes", None) == "json"

    def test_compare_routes_json(self):
        assert resolve_mode("compare transformer and RNN architectures", None) == "json"

    def test_enumerate_routes_json(self):
        assert resolve_mode("enumerate the advantages of neural networks", None) == "json"

    def test_sentiment_keyword_routes_json(self):
        assert resolve_mode("what is the sentiment of this review?", None) == "json"

    def test_entities_keyword_routes_json(self):
        assert resolve_mode("extract the entities from this paragraph", None) == "json"

    def test_generic_question_routes_chat(self):
        assert resolve_mode("What is the capital of France?", None) == "chat"

    def test_greeting_routes_chat(self):
        assert resolve_mode("Hello, how are you?", None) == "chat"

    def test_empty_message_routes_chat(self):
        # min_length=1 prevents truly empty messages via the API,
        # but the function itself should not crash
        assert resolve_mode("a", None) == "chat"

    def test_case_insensitive(self):
        assert resolve_mode("SUMMARIZE AI in healthcare", None) == "json"
        assert resolve_mode("Analyze the report", None) == "json"


# ---------------------------------------------------------------------------
# resolve_tool — schema selection within JSON mode
# ---------------------------------------------------------------------------


class TestResolveTool:
    """resolve_tool() should pick the best JSON schema for the message."""

    def test_summarize_is_default(self):
        assert resolve_tool("Summarize AI in e-commerce") == Tool.SUMMARIZE

    def test_analyze_maps_to_summarize(self):
        assert resolve_tool("Analyze quantum computing") == Tool.SUMMARIZE

    def test_sentiment_keyword(self):
        assert resolve_tool("What is the sentiment of this review?") == Tool.SENTIMENT

    def test_tone_maps_to_sentiment(self):
        assert resolve_tool("What is the tone of this paragraph?") == Tool.SENTIMENT

    def test_feeling_maps_to_sentiment(self):
        assert resolve_tool("Describe the feeling of this passage") == Tool.SENTIMENT

    def test_entities_keyword(self):
        assert resolve_tool("Extract the entities from this article") == Tool.ENTITIES

    def test_who_is_mentioned_maps_to_entities(self):
        assert resolve_tool("Who is mentioned in this text?") == Tool.ENTITIES

    def test_named_entities_maps_to_entities(self):
        assert resolve_tool("List the named entities in the paragraph") == Tool.ENTITIES

    def test_entity_patterns_take_priority_over_sentiment(self):
        # If both entity and sentiment terms appear, entity should win
        # (entity patterns are checked first in resolve_tool)
        assert resolve_tool("extract people and their sentiment") == Tool.ENTITIES


# ---------------------------------------------------------------------------
# build_messages — message construction
# ---------------------------------------------------------------------------


class TestBuildMessages:
    """build_messages() should produce correct OpenAI-format payloads."""

    def test_chat_mode_no_history(self):
        msgs = build_messages("Hello", "chat", Tool.SUMMARIZE, [])
        assert msgs == [{"role": "user", "content": "Hello"}]

    def test_json_mode_prepends_system_prompt(self):
        msgs = build_messages("Summarize AI", "json", Tool.SUMMARIZE, [])
        assert msgs[0]["role"] == "system"
        assert "JSON" in msgs[0]["content"]
        assert msgs[-1] == {"role": "user", "content": "Summarize AI"}

    def test_history_is_injected(self):
        history = [
            HistoryMessage(role="user",      content="Hi"),
            HistoryMessage(role="assistant", content="Hello!"),
        ]
        msgs = build_messages("tell me more", "chat", Tool.SUMMARIZE, history)
        assert msgs[0] == {"role": "user",      "content": "Hi"}
        assert msgs[1] == {"role": "assistant", "content": "Hello!"}
        assert msgs[2] == {"role": "user",      "content": "tell me more"}

    def test_json_mode_with_history_has_system_first(self):
        history = [HistoryMessage(role="user", content="Prior turn")]
        msgs = build_messages("summary", "json", Tool.SUMMARIZE, history)
        assert msgs[0]["role"] == "system"
        assert msgs[1] == {"role": "user", "content": "Prior turn"}
        assert msgs[2] == {"role": "user", "content": "summary"}

    def test_sentiment_tool_uses_correct_prompt(self):
        msgs = build_messages("What's the sentiment?", "json", Tool.SENTIMENT, [])
        assert "sentiment" in msgs[0]["content"].lower()

    def test_entities_tool_uses_correct_prompt(self):
        msgs = build_messages("List entities", "json", Tool.ENTITIES, [])
        assert "people" in msgs[0]["content"].lower()
