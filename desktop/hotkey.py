"""Global shortcut registration (best-effort)."""

from __future__ import annotations

import logging
from collections.abc import Callable

LOG = logging.getLogger(__name__)


def register_hotkey_best_effort(on_activate: Callable[[], None]) -> None:
    """Register ⌘⇧Space — requires Accessibility permission on macOS."""
    try:
        from pynput import keyboard
    except ImportError as exc:
        raise RuntimeError("pynput not installed") from exc

    hotkeys = keyboard.GlobalHotKeys(
        {
            "<cmd>+<shift>+<space>": on_activate,
        }
    )
    hotkeys.start()
    LOG.info("GlobalHotKeys started: ⌘⇧Space")
