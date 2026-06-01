"""OpenAI Realtime ``session.tools`` definitions for Feishu helpers."""

from __future__ import annotations

from typing import Any

FEISHU_REALTIME_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "feishu_contact_search",
        "description": "Search Feishu contacts by name keyword.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Name or keyword to search"},
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "feishu_doc_fetch_markdown",
        "description": (
            "Fetch current Feishu doc body as markdown via lark-cli. "
            "Use doc_token from browser extension context when available."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doc_token": {
                    "type": "string",
                    "description": "Doc token or URL fragment from Feishu doc page",
                },
                "doc_url": {
                    "type": "string",
                    "description": "Full Feishu doc/wiki URL (preferred over token)",
                },
            },
            "required": [],
        },
    },
    {
        "type": "function",
        "name": "feishu_minutes_search",
        "description": "Search meeting minutes / notes (MVP path for meeting todos).",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword such as meeting title or speaker",
                },
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "feishu_message_send",
        "description": (
            "Send a text or markdown message to a Feishu user. "
            "If you do not know the recipient's user_id, call feishu_contact_search first. "
            "ALWAYS call with confirm=false first for a dry-run preview, "
            "verbally confirm the content with the user, then call again with confirm=true."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "recipient_user_id": {
                    "type": "string",
                    "description": "Recipient open_id (ou_xxx) from contact search",
                },
                "content": {
                    "type": "string",
                    "description": "Message body (plain text or markdown)",
                },
                "message_type": {
                    "type": "string",
                    "enum": ["text", "markdown"],
                    "default": "text",
                    "description": "Message format",
                },
                "confirm": {
                    "type": "boolean",
                    "default": False,
                    "description": "false = dry-run preview only; true = actually send",
                },
            },
            "required": ["recipient_user_id", "content"],
        },
    },
    {
        "type": "function",
        "name": "feishu_calendar_event_create",
        "description": (
            "Create a Feishu calendar event and invite attendees. "
            "Use ISO 8601 for start_time and end_time (e.g. 2026-05-23T14:00:00+08:00). "
            "If you do not know attendee user_ids, call feishu_contact_search first. "
            "ALWAYS call with confirm=false first for a dry-run preview, "
            "verbally confirm the details with the user, then call again with confirm=true."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Event title / summary",
                },
                "start_time": {
                    "type": "string",
                    "description": "Start time in ISO 8601 with timezone",
                },
                "end_time": {
                    "type": "string",
                    "description": "End time in ISO 8601 with timezone",
                },
                "attendee_user_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "default": [],
                    "description": "List of attendee open_ids (ou_xxx)",
                },
                "description": {
                    "type": "string",
                    "default": "",
                    "description": "Event description",
                },
                "confirm": {
                    "type": "boolean",
                    "default": False,
                    "description": "false = dry-run preview only; true = actually create",
                },
            },
            "required": ["title", "start_time", "end_time"],
        },
    },
]
