#!/usr/bin/env python3
"""Diagnose context server POST/GET/CORS."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

_URL = "http://127.0.0.1:17890/context"


def _req(method: str, body: bytes | None = None) -> tuple[int, str]:
    req = urllib.request.Request(_URL, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Origin", "https://example.feishu.cn")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()
    except urllib.error.URLError as exc:
        return 0, str(exc)


def main() -> None:
    print("=== Context Server Diagnostic ===\n")

    # 1. GET (should be empty initially)
    status, body = _req("GET")
    print(f"1. GET {status}")
    print(f"   Body: {body}\n")

    # 2. POST mock payload
    payload = json.dumps(
        {
            "url": "https://xxx.feishu.cn/wiki/AbCdEfGh",
            "title": "Test Wiki",
            "doc_token": "AbCdEfGh",
            "doc_url": "https://xxx.feishu.cn/wiki/AbCdEfGh",
            "selected_text": "hello",
        }
    ).encode()
    status, body = _req("POST", payload)
    print(f"2. POST {status}")
    print(f"   Body: {body}\n")

    # 3. GET again
    status, body = _req("GET")
    print(f"3. GET after POST {status}")
    print(f"   Body: {body}\n")

    # 4. Check CORS preflight
    req = urllib.request.Request(
        _URL,
        method="OPTIONS",
        headers={
            "Origin": "https://xxx.feishu.cn",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            cors_headers = {
                k: resp.headers.get(k)
                for k in [
                    "Access-Control-Allow-Origin",
                    "Access-Control-Allow-Methods",
                    "Access-Control-Allow-Headers",
                ]
            }
            print(f"4. CORS Preflight {resp.status}")
            for k, v in cors_headers.items():
                print(f"   {k}: {v}")
    except Exception as exc:
        print(f"4. CORS Preflight FAILED: {exc}")


if __name__ == "__main__":
    main()
