"""In-memory page context pushed by the Chrome extension (Phase 3).

The in-process ``_CTX`` only works inside the uvicorn server process.
Other processes (e.g. ``scripts/smoke_test.py``, future desktop shell)
must read a fresh snapshot via ``fetch_remote_context`` over HTTP.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

_CTX: dict[str, Any] = {}

_CONTEXT_URL = "http://127.0.0.1:17890/context"


def set_page_context(data: dict[str, Any]) -> None:
    """Replace current browser context (called from FastAPI)."""
    global _CTX
    _CTX = dict(data)


def get_page_context() -> dict[str, Any]:
    """Snapshot for tool calls / prompt injection (in-process only)."""
    return dict(_CTX)


def fetch_remote_context(timeout_s: float = 0.5) -> dict[str, Any]:
    """Fetch a snapshot from the local context server.

    Returns ``{}`` on any failure (server down, timeout, non-200,
    JSON parse error). Never raises.
    """
    try:
        with urllib.request.urlopen(_CONTEXT_URL, timeout=timeout_s) as resp:
            if resp.status != 200:
                return {}
            raw = resp.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        return {}
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    return parsed


def context_instructions_fragment_from(ctx: dict[str, Any]) -> str:
    """Build the instructions fragment from an explicit context dict."""
    if not ctx:
        return ""
    parts = []
    if url := ctx.get("url"):
        parts.append(f"当前浏览器页面 URL: {url}")
    if title := ctx.get("title"):
        parts.append(f"页面标题: {title}")
    if doc_url := ctx.get("doc_url"):
        parts.append(f"当前文档链接: {doc_url}")
    if doc := ctx.get("doc_token"):
        parts.append(f"当前文档 token（如有）: {doc}")
    if sel := ctx.get("selected_text"):
        excerpt = str(sel)[:2000]
        parts.append(f"用户选中文本摘录:\n{excerpt}")
    return "\n".join(parts)


def context_instructions_fragment() -> str:
    """Short fragment appended to Realtime ``instructions`` (in-process)."""
    return context_instructions_fragment_from(get_page_context())
