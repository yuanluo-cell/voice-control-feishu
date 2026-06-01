"""Unit tests for Realtime audio delta parsing."""

from __future__ import annotations

from desktop.realtime import session_update_voice_only


def test_session_update_contains_push_to_talk_and_pcm_rates() -> None:
    ev = session_update_voice_only(instructions="hi")
    sess = ev["session"]
    assert sess["audio"]["input"]["turn_detection"] is None
    assert sess["audio"]["input"]["format"]["rate"] == 24_000


def test_audio_delta_formats() -> None:
    from desktop.realtime import _audio_delta_b64

    assert _audio_delta_b64({"type": "response.output_audio.delta", "delta": "QQ=="}) == "QQ=="
    assert _audio_delta_b64({"type": "response.audio.delta", "delta": "Qg=="}) == "Qg=="
    assert _audio_delta_b64({"type": "response.done"}) is None
