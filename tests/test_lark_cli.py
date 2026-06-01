"""Tests for lark-cli whitelist wrapper."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

from desktop.tools import lark_cli


@patch("desktop.tools.lark_cli.subprocess.run")
@patch("desktop.tools.lark_cli.shutil.which")
def test_contact_search_allowed(mock_which: MagicMock, mock_run: MagicMock) -> None:
    mock_which.return_value = "/usr/bin/lark-cli"
    mock_run.return_value = subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout='{"ok":true}',
        stderr="",
    )
    out = lark_cli.invoke_tool_by_openai_name(
        "feishu_contact_search",
        '{"query":"alice"}',
        page_context={},
    )
    assert "ok" in out
    mock_run.assert_called_once()
    argv = mock_run.call_args[0][0]
    assert argv[:4] == ["lark-cli", "contact", "+search-user", "--as"]


@patch("desktop.tools.lark_cli.shutil.which")
def test_unknown_tool(mock_which: MagicMock) -> None:
    mock_which.return_value = "/x/lark-cli"
    out = lark_cli.invoke_tool_by_openai_name(
        "does_not_exist",
        "{}",
        page_context={},
    )
    assert "unknown_tool" in out
