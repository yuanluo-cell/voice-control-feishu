#!/usr/bin/env python3
"""Phase 1–2 smoke: mic → OpenAI Realtime [+ tools] → playback."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _ensure_path() -> None:
    root = _repo_root()
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


async def _async_main(
    *,
    seconds: float,
    dry_run: bool,
    with_tools: bool,
    toggle: bool,
) -> int:
    _ensure_path()
    logging.basicConfig(level=logging.INFO)

    from desktop.audio import (
        SAMPLE_RATE,
        pcm16_numpy_to_b64,
        play_pcm16_bytes,
        record_fixed_seconds,
        record_toggle,
    )
    from desktop.config import get_openai_api_key
    from desktop.context_store import (
        context_instructions_fragment_from,
        fetch_remote_context,
    )
    from desktop.prompts import VOICE_ASSISTANT_ZH

    if with_tools:
        from desktop.realtime import exchange_audio_turn_with_tools
        from desktop.tools.schemas import FEISHU_REALTIME_TOOLS
    else:
        from desktop.realtime import exchange_audio_turn

    if toggle:
        print("Press Enter to start recording...", end="", flush=True)
        input()
        samples = record_toggle()
    else:
        print(f"Recording for {seconds:.1f}s — speak now.")
        samples = record_fixed_seconds(seconds)
    duration = len(samples) / SAMPLE_RATE
    print(f"Recorded {duration:.2f}s ({len(samples)} samples)")
    step = SAMPLE_RATE // 10
    chunks: list[str] = []
    for i in range(0, len(samples), step):
        chunks.append(pcm16_numpy_to_b64(samples[i : i + step]))

    if dry_run:
        print(f"[dry-run] {len(chunks)} chunks — skipping API.")
        return 0

    api_key = get_openai_api_key()
    instructions = VOICE_ASSISTANT_ZH
    ctx = fetch_remote_context()
    frag = context_instructions_fragment_from(ctx)
    if frag:
        instructions = f"{instructions}\n\n【浏览器上下文】\n{frag}"

    if with_tools:
        pcm_reply, latency = await exchange_audio_turn_with_tools(
            api_key,
            pcm_chunk_b64_list=chunks,
            tools=FEISHU_REALTIME_TOOLS,
            instructions=instructions,
        )
    else:
        pcm_reply, latency = await exchange_audio_turn(
            api_key,
            pcm_chunk_b64_list=chunks,
            instructions=instructions,
        )

    if latency is not None:
        print(f"Latency commit → first audio delta: {latency:.3f}s")
    if not pcm_reply:
        print("No audio returned.", file=sys.stderr)
        return 1
    print("Playing reply…")
    play_pcm16_bytes(pcm_reply)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Realtime voice smoke test")
    parser.add_argument("--seconds", type=float, default=4.0, help="Recording length")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Capture audio only; do not call OpenAI",
    )
    parser.add_argument(
        "--with-tools",
        action="store_true",
        help="Enable Feishu tools (lark-cli) on the Realtime session",
    )
    parser.add_argument(
        "--toggle",
        action="store_true",
        help="Toggle recording: press Enter to start, press Enter again to stop",
    )
    args = parser.parse_args()
    raise SystemExit(
        asyncio.run(
            _async_main(
                seconds=args.seconds,
                dry_run=args.dry_run,
                with_tools=args.with_tools,
                toggle=args.toggle,
            )
        )
    )


if __name__ == "__main__":
    main()
