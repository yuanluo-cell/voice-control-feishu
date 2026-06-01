"""Read secrets from macOS Keychain via the keyring library."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass

import keyring

KEYRING_SERVICE = "voice-feishu"


def _get_via_security_cli(account: str) -> str | None:
    """Fallback when keyring returns Keychain Access Denied (-128), e.g. CI/sandbox."""
    try:
        proc = subprocess.run(
            ["security", "find-generic-password", "-s", KEYRING_SERVICE, "-a", account, "-w"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    out = (proc.stdout or "").strip()
    return out or None


def get_openai_api_key() -> str:
    """Return OPENAI_API_KEY stored under service ``voice-feishu``, account ``openai``."""
    raw: str | None = None
    try:
        raw = keyring.get_password(KEYRING_SERVICE, "openai")
    except Exception:
        raw = None
    if not raw or not raw.strip():
        raw = _get_via_security_cli("openai")
    if not raw or not raw.strip():
        msg = (
            "Missing OPENAI_API_KEY in Keychain. Run:\n"
            "  security add-generic-password -s voice-feishu -a openai -w <sk-...> -U"
        )
        raise RuntimeError(msg)
    return raw.strip()


@dataclass(frozen=True)
class LarkAppCredentials:
    """Feishu/Lark self-built app credentials (not user OAuth tokens)."""

    app_id: str
    app_secret: str


def get_lark_app_credentials() -> LarkAppCredentials:
    """JSON ``{\"app_id\":\"...\",\"app_secret\":\"...\"}`` under account ``lark``."""
    raw: str | None = None
    try:
        raw = keyring.get_password(KEYRING_SERVICE, "lark")
    except Exception:
        raw = None
    if not raw or not raw.strip():
        raw = _get_via_security_cli("lark")
    if not raw or not raw.strip():
        msg = (
            "Missing Lark app credentials in Keychain. Run:\n"
            '  security add-generic-password -s voice-feishu -a lark '
            "-w '{\"app_id\":\"...\",\"app_secret\":\"...\"}' -U"
        )
        raise RuntimeError(msg)
    try:
        data = json.loads(raw.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError("Keychain voice-feishu/lark must contain JSON object") from exc
    app_id = data.get("app_id")
    app_secret = data.get("app_secret")
    if not isinstance(app_id, str) or not isinstance(app_secret, str):
        raise RuntimeError("Keychain JSON must include string fields app_id and app_secret")
    if not app_id.strip() or not app_secret.strip():
        raise RuntimeError("app_id and app_secret must be non-empty strings")
    return LarkAppCredentials(app_id=app_id.strip(), app_secret=app_secret.strip())
