"""Local HTTP server: receives Feishu page context from the MV3 extension."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from desktop.context_store import set_page_context


class PrivateNetworkAccessMiddleware(BaseHTTPMiddleware):
    """Add Access-Control-Allow-Private-Network for Chrome PNA (CORS to localhost)."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


app = FastAPI(title="voice-feishu context", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(PrivateNetworkAccessMiddleware)


class PageContextIn(BaseModel):
    url: str = ""
    title: str = ""
    doc_token: str | None = None
    doc_url: str | None = None
    selected_text: str = Field(default="")


@app.post("/context")
async def post_context(body: PageContextIn) -> dict[str, Any]:
    payload = body.model_dump()
    set_page_context(payload)
    return {"ok": True}


@app.get("/context")
async def get_context() -> dict[str, Any]:
    from desktop.context_store import get_page_context

    return get_page_context()


def main() -> None:
    import uvicorn

    uvicorn.run(
        "desktop.context_server:app",
        host="127.0.0.1",
        port=17_890,
        reload=False,
    )


if __name__ == "__main__":
    main()
