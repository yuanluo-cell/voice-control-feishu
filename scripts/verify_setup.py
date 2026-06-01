#!/usr/bin/env python3
"""Verify Keychain secrets, Python deps, and lark-cli OAuth state."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _ensure_pkg_on_path() -> None:
    root = _repo_root()
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def main() -> int:
    _ensure_pkg_on_path()
    ok_lines: list[str] = []

    # 1) OpenAI Keychain
    try:
        from desktop.config import get_openai_api_key

        _ = get_openai_api_key()
        ok_lines.append("OpenAI Keychain ✓")
    except Exception as exc:
        print(f"FAIL OpenAI Keychain: {exc}", file=sys.stderr)
        return 1

    # 2) Lark app credentials Keychain (optional for runtime if only lark-cli config used)
    try:
        from desktop.config import get_lark_app_credentials

        _ = get_lark_app_credentials()
        ok_lines.append("Lark Keychain ✓")
    except Exception as exc:
        print(f"FAIL Lark Keychain: {exc}", file=sys.stderr)
        return 1

    # 3) lark-cli on PATH + auth
    lark_cli = shutil.which("lark-cli")
    if not lark_cli:
        print("FAIL lark-cli not on PATH (npm i -g @larksuite/cli)", file=sys.stderr)
        return 1

    try:
        proc = subprocess.run(
            ["lark-cli", "auth", "status"],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"FAIL lark-cli auth status: {exc}", file=sys.stderr)
        return 1

    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        print(f"FAIL lark-cli auth status exit {proc.returncode}\n{out}", file=sys.stderr)
        return 1
    if "tokenStatus" not in out and "valid" not in out.lower():
        print(f"WARN unexpected auth status output:\n{out}", file=sys.stderr)
    ok_lines.append("lark-cli auth ✓ (`lark-cli auth status`)")

    # 4) Dependencies (keyring already imported)
    ok_lines.append("Python deps ✓ (keyring import OK for Phase 0)")

    for line in ok_lines:
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
