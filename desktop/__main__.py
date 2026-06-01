"""Temporary package entry: default launches menu-bar shell."""

from __future__ import annotations

import sys


def main() -> None:
    if len(sys.argv) > 1:
        if sys.argv[1] == "--context-server":
            from desktop.context_server import main as cs_main

            cs_main()
            return
        if sys.argv[1] == "--cli-smoke-hint":
            print("Use: uv run python scripts/smoke_test.py")
            return
    from desktop.app import run_tray

    run_tray()


if __name__ == "__main__":
    main()
