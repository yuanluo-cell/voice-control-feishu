"""PCM capture / playback helpers for OpenAI Realtime (24 kHz mono int16)."""

from __future__ import annotations

import base64
import queue
from typing import Any, cast

import numpy as np
import sounddevice as sd

SAMPLE_RATE = 24_000


def record_fixed_seconds(seconds: float, *, channels: int = 1) -> np.ndarray:
    """Blocking microphone capture; returns int16 mono samples."""
    frames = int(seconds * SAMPLE_RATE)
    audio = sd.rec(frames, samplerate=SAMPLE_RATE, channels=channels, dtype="int16")
    sd.wait()
    if channels == 1:
        return cast(np.ndarray, audio.reshape(-1))
    return cast(np.ndarray, audio[:, 0].copy())


def record_toggle(*, channels: int = 1) -> np.ndarray:
    """Background recording until user presses Enter. Returns int16 mono samples."""
    q: queue.Queue[np.ndarray] = queue.Queue()

    def callback(
        indata: np.ndarray,
        frames: int,
        time: Any,
        status: sd.CallbackFlags,
    ) -> None:
        del frames, time, status
        q.put(indata.copy())

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=channels,
        dtype="int16",
        callback=callback,
    ):
        input("Recording... press Enter to stop ")

    chunks: list[np.ndarray] = []
    while not q.empty():
        chunks.append(q.get())
    if not chunks:
        return np.empty(0, dtype=np.int16)
    arr = np.concatenate(chunks)
    if channels == 1:
        return arr.reshape(-1)
    return arr[:, 0].copy()


def pcm16_numpy_to_b64(samples: np.ndarray) -> str:
    """Encode int16 mono numpy array as base64."""
    if samples.dtype != np.int16:
        raise TypeError("samples must be int16")
    return base64.b64encode(samples.tobytes()).decode("ascii")


def play_pcm16_bytes(data: bytes) -> None:
    """Play raw PCM16 mono at SAMPLE_RATE (blocking)."""
    arr = np.frombuffer(data, dtype=np.int16).copy()
    sd.play(arr, samplerate=SAMPLE_RATE)
    sd.wait()
