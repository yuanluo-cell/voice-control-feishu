"""Minimal asyncio WebSocket client for OpenAI Realtime (audio + optional tools)."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

import websockets

from desktop.audio import SAMPLE_RATE

LOG = logging.getLogger(__name__)

REALTIME_URI = "wss://api.openai.com/v1/realtime?model=gpt-realtime-2"


def session_update_voice_only(*, instructions: str) -> dict[str, Any]:
    """Configure push-to-talk PCM in/out without server VAD."""
    return {
        "type": "session.update",
        "session": {
            "type": "realtime",
            "model": "gpt-realtime-2",
            "output_modalities": ["audio"],
            "instructions": instructions,
            "audio": {
                "input": {
                    "format": {"type": "audio/pcm", "rate": SAMPLE_RATE},
                    "turn_detection": None,
                },
                "output": {
                    "format": {"type": "audio/pcm", "rate": SAMPLE_RATE},
                    "voice": "marin",
                },
            },
        },
    }


def _audio_delta_b64(event: dict[str, Any]) -> str | None:
    kind = event.get("type")
    if kind in {"response.output_audio.delta", "response.audio.delta"}:
        return event.get("delta") if isinstance(event.get("delta"), str) else None
    return None


@asynccontextmanager
async def _realtime_session(
    api_key: str,
    *,
    instructions: str,
    timeout_s: float,
    tools: list[dict[str, Any]] | None = None,
) -> AsyncIterator[Any]:
    headers = {"Authorization": f"Bearer {api_key}"}
    async with websockets.connect(
        REALTIME_URI,
        additional_headers=headers,
        max_size=None,
        open_timeout=30,
        ping_interval=20,
        ping_timeout=20,
    ) as ws:
        await _wait_event(ws, {"session.created"}, timeout_s=timeout_s)
        payload = session_update_voice_only(instructions=instructions)
        if tools is not None:
            payload["session"]["tools"] = tools
            payload["session"]["tool_choice"] = "auto"
        await ws.send(json.dumps(payload))
        await _wait_event(ws, {"session.updated"}, timeout_s=timeout_s)
        yield ws


async def exchange_audio_turn(
    api_key: str,
    *,
    pcm_chunk_b64_list: list[str],
    instructions: str = (
        "用户使用中文简短说话。请用普通话礼貌、简短地回答。"
        "默认一两句话即可。"
    ),
    timeout_s: float = 120.0,
) -> tuple[bytes, float | None]:
    """
    Send one committed utterance and collect assistant PCM bytes.

    Returns (pcm_bytes, seconds_from_commit_to_first_audio_delta or None).
    """
    first_delta_at: float | None = None
    pcm_out = bytearray()
    commit_sent_at = 0.0

    async with _realtime_session(
        api_key,
        instructions=instructions,
        timeout_s=timeout_s,
        tools=None,
    ) as ws:
        for chunk_b64 in pcm_chunk_b64_list:
            await ws.send(
                json.dumps({"type": "input_audio_buffer.append", "audio": chunk_b64})
            )

        commit_sent_at = time.perf_counter()
        await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
        await ws.send(json.dumps({"type": "response.create"}))

        async for raw in ws:
            event = json.loads(raw)
            kind = event.get("type")
            if kind == "error":
                raise RuntimeError(json.dumps(event, ensure_ascii=False))

            b64_chunk = _audio_delta_b64(event)
            if b64_chunk:
                if first_delta_at is None:
                    first_delta_at = time.perf_counter() - commit_sent_at
                pcm_out.extend(base64.b64decode(b64_chunk))

            if kind == "response.done":
                break

    return bytes(pcm_out), first_delta_at


async def exchange_audio_turn_with_tools(
    api_key: str,
    *,
    pcm_chunk_b64_list: list[str],
    tools: list[dict[str, Any]],
    instructions: str,
    timeout_s: float = 180.0,
) -> tuple[bytes, float | None]:
    """Send audio with ``session.tools`` enabled (Feishu helpers via ``lark-cli``)."""
    # imported lazily to keep Phase 1 imports light
    from desktop.context_store import fetch_remote_context
    from desktop.tools.lark_cli import invoke_tool_by_openai_name

    ctx_snapshot = fetch_remote_context()
    first_delta_at: float | None = None
    pcm_out = bytearray()
    commit_sent_at = 0.0
    deadline = time.perf_counter() + timeout_s
    # When a tool call is dispatched we issue a follow-up response.create, so the
    # next response.done must not terminate the loop — we still owe the user the
    # post-tool spoken answer.
    expecting_more = False

    async with _realtime_session(
        api_key,
        instructions=instructions,
        timeout_s=timeout_s,
        tools=tools,
    ) as ws:
        for chunk_b64 in pcm_chunk_b64_list:
            await ws.send(
                json.dumps({"type": "input_audio_buffer.append", "audio": chunk_b64})
            )

        commit_sent_at = time.perf_counter()
        await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
        await ws.send(json.dumps({"type": "response.create"}))

        while time.perf_counter() < deadline:
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                break
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            event = json.loads(raw)
            kind = event.get("type")
            if kind == "error":
                raise RuntimeError(json.dumps(event, ensure_ascii=False))

            b64_chunk = _audio_delta_b64(event)
            if b64_chunk:
                if first_delta_at is None:
                    first_delta_at = time.perf_counter() - commit_sent_at
                pcm_out.extend(base64.b64decode(b64_chunk))

            if kind == "response.function_call_arguments.done":
                out = invoke_tool_by_openai_name(
                    cast(str | None, event.get("name")),
                    str(event.get("arguments") or "{}"),
                    page_context=ctx_snapshot,
                )
                cid = event.get("call_id")
                if not cid:
                    LOG.warning("function_call_arguments.done without call_id: %s", event)
                    continue
                await ws.send(
                    json.dumps(
                        {
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": cid,
                                "output": out,
                            },
                        }
                    )
                )
                await ws.send(json.dumps({"type": "response.create"}))
                expecting_more = True
                continue

            if kind == "response.done":
                if expecting_more:
                    # Consume the response.done that closes the tool-call response;
                    # keep looping to receive the follow-up audio response.
                    expecting_more = False
                    continue
                break

    return bytes(pcm_out), first_delta_at


async def _wait_event(ws: Any, kinds: set[str], *, timeout_s: float) -> dict[str, Any]:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise TimeoutError(f"Timed out waiting for {kinds}")
        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        event = json.loads(raw)
        if event.get("type") in kinds:
            return cast(dict[str, Any], event)
        if event.get("type") == "error":
            raise RuntimeError(json.dumps(event, ensure_ascii=False))
        LOG.debug("skip event %s", event.get("type"))
