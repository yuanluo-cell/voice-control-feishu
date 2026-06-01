"""Extra unit tests to raise coverage without hitting external services."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from desktop.context_server import app
from desktop.prompts import VOICE_ASSISTANT_ZH
from desktop.realtime import session_update_voice_only
from desktop.tools.schemas import FEISHU_REALTIME_TOOLS
from fastapi.testclient import TestClient


def test_voice_prompt_nonempty() -> None:
    assert "飞书" in VOICE_ASSISTANT_ZH


def test_feishu_tools_list() -> None:
    names = {t["name"] for t in FEISHU_REALTIME_TOOLS}
    assert "feishu_doc_fetch_markdown" in names


def test_session_update_shape() -> None:
    payload = session_update_voice_only(instructions="ping")
    assert payload["session"]["audio"]["input"]["turn_detection"] is None


def test_context_http_roundtrip() -> None:
    client = TestClient(app)
    res = client.post(
        "/context",
        json={
            "url": "https://x.feishu.cn/docx/abc123",
            "title": "hi",
            "doc_token": "abc123",
            "selected_text": "",
        },
    )
    assert res.status_code == 200
    body = client.get("/context").json()
    assert body["doc_token"] == "abc123"


@patch("desktop.config.keyring.get_password")
def test_openai_from_keyring(mock_gp: MagicMock) -> None:
    import desktop.config as cfg

    mock_gp.return_value = "sk-unit-test"
    assert cfg.get_openai_api_key() == "sk-unit-test"
