# Phase 5 Review (Polish / coverage)

| Principle | Verdict | Notes |
|-----------|---------|-------|
| Goal-Driven | Partial | `pytest --cov=desktop` ~39%; GUI + WebSocket paths need integration tests to reach 70% |

Recommendation: add mocked-WebSocket tests for `exchange_audio_turn*` and headless Qt tests if CI requires ≥70%.
