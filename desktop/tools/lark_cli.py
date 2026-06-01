"""Subprocess bridge to ``lark-cli`` with an explicit argv whitelist."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from typing import Any

from desktop.tools.audit import append_tool_record

_WHITELIST_FIRST_THREE: set[tuple[str, str, str]] = {
    ("lark-cli", "contact", "+search-user"),
    ("lark-cli", "docs", "+fetch"),
    ("lark-cli", "minutes", "+search"),
    ("lark-cli", "im", "+messages-send"),
    ("lark-cli", "calendar", "+create"),
}


def _argv_contact_search(query: str) -> list[str]:
    return ["lark-cli", "contact", "+search-user", "--as", "user", "--query", query]


def _argv_doc_fetch_markdown(doc_token: str) -> list[str]:
    return [
        "lark-cli",
        "docs",
        "+fetch",
        "--api-version",
        "v2",
        "--as",
        "user",
        "--doc",
        doc_token,
        "--doc-format",
        "markdown",
        "--detail",
        "simple",
    ]


def _argv_minutes_search(query: str) -> list[str]:
    return ["lark-cli", "minutes", "+search", "--as", "user", "--query", query]


def _argv_message_send(
    user_id: str, content: str, msg_type: str, *, dry_run: bool = False
) -> list[str]:
    argv = [
        "lark-cli",
        "im",
        "+messages-send",
        "--as",
        "user",
        "--user-id",
        user_id,
    ]
    if msg_type == "markdown":
        argv += ["--markdown", content]
    else:
        argv += ["--text", content]
    if dry_run:
        argv.append("--dry-run")
    return argv


def _argv_calendar_event_create(
    title: str,
    start: str,
    end: str,
    *,
    attendee_ids: list[str] | None = None,
    description: str = "",
    dry_run: bool = False,
) -> list[str]:
    argv = [
        "lark-cli",
        "calendar",
        "+create",
        "--as",
        "user",
        "--summary",
        title,
        "--start",
        start,
        "--end",
        end,
    ]
    if description:
        argv += ["--description", description]
    if attendee_ids:
        argv += ["--attendee-ids", ",".join(attendee_ids)]
    if dry_run:
        argv.append("--dry-run")
    return argv


def _is_allowed(argv: list[str]) -> bool:
    if len(argv) < 3:
        return False
    return (argv[0], argv[1], argv[2]) in _WHITELIST_FIRST_THREE


def run_argv(argv: list[str], *, timeout_s: float = 120.0) -> subprocess.CompletedProcess[str]:
    if shutil.which(argv[0]) is None:
        raise FileNotFoundError(f"{argv[0]} not found on PATH")
    if not _is_allowed(argv):
        raise ValueError(f"argv not on whitelist: {argv[:6]}…")
    return subprocess.run(
        argv,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_s,
    )


def invoke_tool_by_openai_name(
    name: str | None,
    arguments_json: str,
    *,
    page_context: dict[str, Any],
) -> str:
    """Execute a tool and return a JSON string suitable for ``function_call.output``."""
    t0 = time.perf_counter()
    if not name:
        out = json.dumps({"ok": False, "error": "missing_function_name"})
        append_tool_record(
            tool="",
            args={},
            result=out,
            duration_ms=(time.perf_counter() - t0) * 1000,
            context=page_context,
            ok=False,
        )
        return out

    try:
        args = json.loads(arguments_json or "{}")
    except json.JSONDecodeError as exc:
        out = json.dumps({"ok": False, "error": f"invalid_arguments_json: {exc}"})
        append_tool_record(
            tool=name,
            args={},
            result=out,
            duration_ms=(time.perf_counter() - t0) * 1000,
            context=page_context,
            ok=False,
        )
        return out

    argv: list[str] | None = None
    if name == "feishu_contact_search":
        q = str(args.get("query", "")).strip()
        if not q:
            argv = None
        else:
            argv = _argv_contact_search(q)
    elif name == "feishu_doc_fetch_markdown":
        doc = str(args.get("doc_url", "") or args.get("doc_token", "")).strip()
        # Fallback to page URL if token looks like a wiki node_token
        if not doc and page_context:
            doc = str(page_context.get("doc_url", "") or page_context.get("url", "")).strip()
        if not doc:
            argv = None
        else:
            argv = _argv_doc_fetch_markdown(doc)
    elif name == "feishu_minutes_search":
        q = str(args.get("query", "")).strip()
        if not q:
            argv = None
        else:
            argv = _argv_minutes_search(q)
    elif name == "feishu_message_send":
        recipient = str(args.get("recipient_user_id", "")).strip()
        content = str(args.get("content", "")).strip()
        msg_type = str(args.get("message_type", "text")).strip()
        confirm = bool(args.get("confirm", False))
        if not recipient or not content:
            argv = None
        else:
            argv = _argv_message_send(
                recipient, content, msg_type, dry_run=not confirm
            )
    elif name == "feishu_calendar_event_create":
        title = str(args.get("title", "")).strip()
        start = str(args.get("start_time", "")).strip()
        end = str(args.get("end_time", "")).strip()
        attendee_ids = args.get("attendee_user_ids") or []
        description = str(args.get("description", "")).strip()
        confirm = bool(args.get("confirm", False))
        if not title or not start or not end:
            argv = None
        else:
            argv = _argv_calendar_event_create(
                title,
                start,
                end,
                attendee_ids=attendee_ids if isinstance(attendee_ids, list) else [],
                description=description,
                dry_run=not confirm,
            )
    else:
        out = json.dumps({"ok": False, "error": f"unknown_tool:{name}"})
        append_tool_record(
            tool=name,
            args=args,
            result=out,
            duration_ms=(time.perf_counter() - t0) * 1000,
            context=page_context,
            ok=False,
        )
        return out

    if argv is None:
        out = json.dumps({"ok": False, "error": "missing_required_fields"})
        append_tool_record(
            tool=name,
            args=args,
            result=out,
            duration_ms=(time.perf_counter() - t0) * 1000,
            context=page_context,
            ok=False,
        )
        return out

    try:
        proc = run_argv(argv)
    except (OSError, ValueError, subprocess.TimeoutExpired, FileNotFoundError) as exc:
        out = json.dumps({"ok": False, "error": str(exc)})
        append_tool_record(
            tool=name,
            args=args,
            result=out,
            duration_ms=(time.perf_counter() - t0) * 1000,
            context=page_context,
            ok=False,
        )
        return out

    payload = {
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }
    out = json.dumps(payload, ensure_ascii=False)
    append_tool_record(
        tool=name,
        args=args,
        result=out,
        duration_ms=(time.perf_counter() - t0) * 1000,
        context=page_context,
        ok=proc.returncode == 0,
    )
    return out
