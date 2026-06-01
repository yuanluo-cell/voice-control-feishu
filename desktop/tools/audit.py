"""Audit log for tool invocations (~/.voice-feishu/logs/tools.jsonl)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


def _log_path() -> Path:
    path = Path.home() / ".voice-feishu" / "logs" / "tools.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def append_tool_record(
    *,
    tool: str,
    args: dict[str, Any],
    result: str,
    duration_ms: float,
    context: dict[str, Any],
    ok: bool,
) -> None:
    row = {
        "ts": time.time(),
        "tool": tool,
        "args": args,
        "result": result if len(result) < 8000 else result[:8000] + "…[truncated]",
        "duration_ms": duration_ms,
        "context": context,
        "ok": ok,
    }
    line = json.dumps(row, ensure_ascii=False)
    with _log_path().open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
