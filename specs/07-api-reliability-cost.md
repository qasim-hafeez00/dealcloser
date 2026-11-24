# M7: Agent API, reliability, cost

## 1. Endpoints (FastAPI, `api/app/main.py`)

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /chat` | open | `{"user_id": str, "thread_id": str, "message": str}` | `{"reply": str, "tool_calls": [{"name": str, "args": {}}], "tokens": {"in": int, "out": int}}`. **Exactly these 3 keys** |
| `GET /health` | open | – | `text/plain` `ok` (200). No DB/LLM calls: always fast |
| `GET /` | open | – | `{"name":"DealCloser Agent API","model":"claude-haiku-5-5","endpoints":["/chat","/health"],"docs":"<repo url>"}` |
| `GET /health/deep` | service | – | `{"db":"ok","store":"ok","checkpointer":"ok","model":"claude-haiku-5-5","version":"<git sha>","uptime_s":123}` |
| `GET /internal/memory/{user_id}` | service | – | `{"profile":{}, "notes":[], "viewed":[]}` |
| `DELETE /internal/memory/{user_id}` | service | – | `{"deleted": n}` |
| `POST /internal/claim` | service | `{"from": str, "to": str}` | `{"moved": {...}}` (P1) |
| `POST /internal/followups/draft` | service | `{"user_ids": [str]?, "limit": 10}` | `{"drafts":[{"id","user_id","draft"}], "tokens":{...}}` (P1 bonus) |

`/docs` (Swagger) stays enabled; useful for judges.

## 2. `/chat` input handling

| Case | Status | Reply |
|---|---|---|
| Valid | 200 | agent reply |
| Invalid JSON / not an object | 400 | "Invalid request: send JSON with user_id, thread_id and message." |
| Missing / empty `user_id` | 400 | "Invalid request: user_id is required." |
| Missing `thread_id` | 200 | treated as `"default"` |
| Missing `message` / not a string | 400 | "Invalid request: message must be a string." |
| Message empty / whitespace | 200 | "Hi! I'm Ava from Apex Motors. What kind of car are you looking for?" (no LLM, `blocked_by='empty'`) |
| Message > 2,000 chars | 200 | truncated to 2,000 and processed |
| Non-string ids (numbers) | 200 | cast to string |
| Extra fields | ignored | |
| Rate limited | 429 | "You're sending messages too quickly, please wait a few seconds." |
| Spend cap reached | 200 | "Our assistant is temporarily unavailable. Please call us or use the contact form." (no LLM) |
| Internal error / timeout | 200 | "Sorry, something went wrong on my side. Please try again." |

Every non-200 still uses the same JSON shape (`tool_calls: []`, `tokens: {"in":0,"out":0}`). A custom `RequestValidationError` handler and a catch-all middleware make sure FastAPI's default 422/500 bodies **never** leak out.

## 3. Reliability

| Mechanism | Setting |
|---|---|
| Process | uvicorn, **1 worker** (async), so in-memory locks and rate limits are consistent |
| Per-thread lock | `dict[str, asyncio.Lock]` keyed by internal thread key; LRU-evicted at 5,000 entries. A second request on the same thread waits (max 50 s) instead of corrupting state |
| Timeouts | Anthropic 30 s per call, 2 retries (SDK); whole turn 45 s (`asyncio.wait_for`) |
| DB | Pool with `check_connection` (survives Neon suspend); every query has a 10 s statement timeout (`SET statement_timeout` on connect) |
| Startup | Connect → run schema → `saver.setup()` → `store.setup()` → seed if `vehicles` is empty → warm the pool. If the DB isn't reachable, retry 5× with backoff, then still start (health ok; chat returns the apology) |
| Idempotent writes | Booking uniqueness enforced by the DB; the tool re-checks inside a transaction |
| Logging | JSON lines to stdout: request id, user_id hash, thread, latency, tokens, tool names, blocked_by, error class. **No message content, no secrets** (content goes to chat_log in the DB only) |
| Request ID | `X-Request-Id` response header (uuid4) |
| CORS | `allow_origins=["*"]`, methods GET/POST/OPTIONS |
| Keep-alive | GitHub Actions cron every 30 min → `/health` (+ Vercel `/`) |
| Latency targets | p50 < 3 s, p95 < 7 s for one-tool turns; guard refusals < 150 ms |

### Rate limits (in-memory sliding window)
- 30 requests/min per `user_id`
- 120 requests/min across all users (protects the $2 key)
- Generous enough that a sequential grader never hits them.

## 4. Cost

| Lever | Effect |
|---|---|
| Haiku 5.5 ($0.10 / $0.50 per M tokens) | baseline |
| Effort low / thinking minimal (if supported) | fewer output tokens, lower latency |
| `max_tokens=600`, prompt says < 120 words | bounded output |
| Guard refusals, empty-message reply, confirmation prompts, spend-cap reply: **no LLM** | zero-cost safety turns |
| Tool output capped at 1,500 chars, compact lines | smaller input on the 2nd model call |
| History trimmed to 24 messages | input doesn't grow without limit |
| Prompt caching of tools + fixed prompt | cache reads are much cheaper (verified via usage) |
| Memory written by a tool, not an extra summariser call | no extra call per turn |
| No fallback model, no summarisation middleware | no hidden calls |
| Model/tool call limits (6/8) | no runaway loops |
| Dev testing with a **fake model** in unit tests; live benchmark run at most 3 times tonight | saves workspace spend (the cost score may count it) |

**Spend cap:** `SPEND_CAP_USD=1.60`. Spend = `Σ(tokens_in)/1e6*0.10 + Σ(tokens_out)/1e6*0.50` over chat_log + followups (cached in memory, refreshed every 60 s). Above the cap → degraded reply. Shown on the admin Usage page with a gauge. (The cap protects the $2 key, which would otherwise die and zero every test.)

**Expected cost:** typical turn = 1–2 model calls × ~3.5k input + ~150 output → ~$0.0004–0.0008 per turn. A 300-turn benchmark costs about $0.20.

## 5. Files
```
api/app/main.py        FastAPI app, routes, error handlers, middleware (request id, logging)
api/app/config.py      env settings (pydantic-settings)
api/app/db.py          pool, schema/seed runner, query helpers
api/app/graph.py       StateGraph build (guard, agent, lead_tracker)
api/app/agent.py       create_agent + middleware list
api/app/prompts.py     system prompt, refusal texts, confirmation templates
api/app/guard.py       safety rules
api/app/tools/*.py     inventory.py, financing.py, booking.py, profile.py, dealer.py
api/app/memory.py      store helpers, memory block rendering
api/app/confirm.py     interrupt detection, yes/no parsing, resume payloads
api/app/chat_service.py  the /chat flow (lock, rate limit, spend cap, accounting, chat_log)
api/app/followups.py   follow-up drafter (bonus)
api/app/scripts/seed.py, reset.py
```

## 6. Cut list
P1: `/internal/claim`, `/internal/followups/draft`. P2: per-IP limits.
