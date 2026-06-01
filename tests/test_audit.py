from __future__ import annotations

from pathlib import Path

import pytest
from desktop.tools import audit


def test_append_tool_record_writes_jsonl(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    target = tmp_path / "tools.jsonl"

    def _fake_log() -> Path:
        target.parent.mkdir(parents=True, exist_ok=True)
        return target

    monkeypatch.setattr(audit, "_log_path", _fake_log)
    audit.append_tool_record(
        tool="feishu_contact_search",
        args={"query": "x"},
        result='{"ok":true}',
        duration_ms=12.5,
        context={"url": "u"},
        ok=True,
    )
    text = target.read_text(encoding="utf-8").strip()
    assert "feishu_contact_search" in text
    assert '"ok": true' in text or '"ok":true' in text
