from typing import Any
from unittest.mock import patch

from desktop.context_store import (
    context_instructions_fragment,
    context_instructions_fragment_from,
    fetch_remote_context,
    set_page_context,
)


def test_context_fragment_empty() -> None:
    set_page_context({})
    assert context_instructions_fragment() == ""


def test_context_fragment_nonempty() -> None:
    set_page_context({"url": "https://x", "title": "T", "doc_token": "abc"})
    frag = context_instructions_fragment()
    assert "https://x" in frag
    assert "abc" in frag


def test_fragment_from_empty_dict() -> None:
    assert context_instructions_fragment_from({}) == ""


def test_fragment_from_full_dict() -> None:
    frag = context_instructions_fragment_from(
        {
            "url": "https://x",
            "title": "T",
            "doc_token": "abc",
            "selected_text": "hello",
        }
    )
    assert "https://x" in frag
    assert "T" in frag
    assert "abc" in frag
    assert "hello" in frag


def test_fragment_from_truncates_selected_text() -> None:
    long_text = "a" * 5000
    frag = context_instructions_fragment_from({"selected_text": long_text})
    # only 2000 chars of the excerpt should appear
    assert frag.count("a") == 2000


def test_fetch_remote_context_server_unreachable() -> None:
    # Point at a port that is almost certainly not listening; must return {} silently.
    import desktop.context_store as cs

    with patch.object(cs, "_CONTEXT_URL", "http://127.0.0.1:1/context"):
        assert cs.fetch_remote_context(timeout_s=0.1) == {}


def test_fetch_remote_context_url_error() -> None:
    import urllib.error

    def _raise(*_a: Any, **_kw: Any) -> Any:
        raise urllib.error.URLError("boom")

    with patch("desktop.context_store.urllib.request.urlopen", side_effect=_raise):
        assert fetch_remote_context() == {}


def test_fetch_remote_context_bad_json() -> None:
    class _Resp:
        status = 200

        def read(self) -> bytes:
            return b"not-json"

        def __enter__(self) -> "_Resp":
            return self

        def __exit__(self, *_a: Any) -> None:
            return None

    with patch("desktop.context_store.urllib.request.urlopen", return_value=_Resp()):
        assert fetch_remote_context() == {}


def test_fetch_remote_context_non_200() -> None:
    class _Resp:
        status = 500

        def read(self) -> bytes:
            return b"{}"

        def __enter__(self) -> "_Resp":
            return self

        def __exit__(self, *_a: Any) -> None:
            return None

    with patch("desktop.context_store.urllib.request.urlopen", return_value=_Resp()):
        assert fetch_remote_context() == {}


def test_fetch_remote_context_success() -> None:
    class _Resp:
        status = 200

        def read(self) -> bytes:
            return b'{"url": "https://x", "doc_token": "abc"}'

        def __enter__(self) -> "_Resp":
            return self

        def __exit__(self, *_a: Any) -> None:
            return None

    with patch("desktop.context_store.urllib.request.urlopen", return_value=_Resp()):
        ctx = fetch_remote_context()
    assert ctx == {"url": "https://x", "doc_token": "abc"}
