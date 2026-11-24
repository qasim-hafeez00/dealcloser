# DealCloser specs: index

`PLAN.md` is the overview. These files are the build contract: if something isn't written here, we don't build it, and if it is written here, it has a priority.

## Priority levels
- **P0**: graded or required. Built first and deployed before any P1 work starts.
- **P1**: what makes it a real product (judged in "product quality" and the demo). Built after P0 is live.
- **P2**: polish. Only if there's time left. Each P2 item is listed in its module's cut list.

Order: **all P0 across all modules → deploy → P1 → redeploy → P2 → freeze at 23:30.**

## Modules

| ID | Module | Spec | Criteria it serves | Depends on |
|---|---|---|---|---|
| M1 | Database (Neon) | [01-database.md](01-database.md) | LT memory, isolation, reliability | – |
| M2 | Auth and identity | [02-auth.md](02-auth.md) | isolation, product | M1 |
| M3 | LangGraph agent | [03-agent-graph.md](03-agent-graph.md) | task success, ST memory, safety, cost | M1, M4 |
| M4 | Tools | [04-tools.md](04-tools.md) | task success, tool accuracy | M1 |
| M5 | Memory and isolation | [05-memory-isolation.md](05-memory-isolation.md) | ST/LT memory, isolation | M1, M3 |
| M6 | Safety | [06-safety.md](06-safety.md) | safety | M3 |
| M7 | Agent API, reliability, cost | [07-api-reliability-cost.md](07-api-reliability-cost.md) | reliability, cost, everything automated | M3–M6 |
| M8 | Website: customer side | [08-web-customer.md](08-web-customer.md) | product, demo | M1, M2, M7 |
| M9 | Website: admin dashboard | [09-web-admin.md](09-web-admin.md) | product, demo, bonus | M1, M2, M7 |
| M10 | Testing and benchmark | [10-testing-benchmark.md](10-testing-benchmark.md) | benchmark table, tests.json | M7 |
| M11 | Deployment and ops | [11-deploy-ops.md](11-deploy-ops.md) | uptime (scores 0 if offline) | M7–M9 |
| M12 | Docs, demo, submission | [12-docs-demo-submission.md](12-docs-demo-submission.md) | GitHub, demo, form | all |
| – | Edge-case master list | [13-edge-cases.md](13-edge-cases.md) | reliability, safety | all |

## Suggested split for the group (fill in names)

| Role | Owns | Starts |
|---|---|---|
| Builder (with Claude) | M1, M3–M7, M11, then M8/M9 | now |
| Frontend helper | M8/M9 page content, copy, testing the live site against the specs | when M7 is deployed |
| QA / benchmark | M10: runs the manual checklist and test cases, reports failures | when M7 is deployed |
| Docs / pitch / video | M12: README text, pitch, video script, recording, canvas photo, form answers | now (script), 21:00 (record) |

## Global conventions (every module follows these)

| Thing | Rule |
|---|---|
| Currency | USD, whole dollars, shown as `$27,900` |
| Dealer time zone | `Asia/Karachi` (env `DEALER_TZ`). All slot times shown in dealer time; stored as `timestamptz` |
| Vehicle IDs | `APX-101` … `APX-124`. Accept any case, plus `apx104`, `APX 104`, `104` |
| Booking IDs | Number shown as `TD-1001` (sequence starts at 1001). Tools accept `TD-1001` or `1001` |
| Callback IDs | `CB-501` (sequence starts at 501) |
| `user_id` | Any string 1–128 chars after trimming. Website: `u_<uuid>` (signed in), `g_<uuid>` (guest). Graders: anything |
| `thread_id` | Any string 1–128 chars after trimming; defaults to `"default"` if missing. Website: uuid v4 |
| Internal thread key | `f"{user_id}::{thread_id}"` |
| Store namespace | `("buyer", user_id)` |
| Model | `claude-haiku-5-5` only, everywhere (agent and follow-up drafter) |
| Errors | API never returns a stack trace; always the `{reply, tool_calls, tokens}` shape |
| Secrets | Only in `.env` (local), HF Space secrets, Vercel env. Never in git, logs or replies |

## Definition of done (per module)
1. Every P0 item in the spec is built.
2. Unit tests for its rules pass (`pytest` / `npm run build`).
3. The edge cases listed for it in `13-edge-cases.md` were checked.
4. Works on the deployed URL, not just locally.
