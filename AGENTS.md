# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

> Source: [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills), derived from [Andrej Karpathy's observations on LLM coding pitfalls](https://x.com/karpathy/status/2015883857489522876).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Project-Specific Addendum (voice-feishu)

These project-specific rules are layered on top of the four principles above. They are **non-negotiable** for all coding sub-agents working on this repo.

### A. Credential handling
- **Never** write secrets to `.env`, source code, or any committed file. Read from macOS Keychain via `keyring`.
- Allowed Keychain entries (`service=voice-feishu`):
  - `openai` → OPENAI_API_KEY
  - `lark` → JSON `{"app_id": "...", "app_secret": "..."}`
- If a credential is missing, **fail loud** with a clear instruction message; do not invent fallbacks.

### B. CLI command safety
- All **`lark-cli`** subprocess invocations go through `desktop/tools/lark_cli.py`.
- That module maintains a **command whitelist**. Out-of-whitelist commands are rejected before exec.
- Destructive operations (send message, approve, delete, modify shared doc) require a `--dry-run`-first pattern that yields a preview to the model.

### C. Logging
- Every tool call appends one JSON line to `~/.voice-feishu/logs/tools.jsonl`.
- Required fields: `ts, tool, args, result, duration_ms, context, ok`.
- Never log raw audio bytes or full API tokens; mask to last 4 chars.

### D. Phase boundaries
- Each Phase has a written **Definition of Done** in `docs/AGENTS.md`. Do not start a Phase before the prior Phase's DoD is met.
- Each Phase must include at least one runnable verification (script or test) that the supervisor can invoke independently.

### E. Sub-agent boundaries
- A sub-agent must not modify files outside its declared scope in `docs/AGENTS.md`.
- If a sub-agent discovers a needed change outside its scope, it reports back to the supervisor; it does not silently expand its scope.

### F. Python style
- Python 3.11+, type hints required on all public functions.
- `ruff` + `mypy --strict` must pass. Match existing style when editing.
- Prefer `asyncio` over threads for I/O concurrency.
