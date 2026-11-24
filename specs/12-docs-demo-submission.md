# M12: Docs, demo, submission

## 1. Deliverables checklist
| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Live website URL (Vercel) | builder | ☐ |
| 2 | Agent API base URL (HF Space) | builder | ☐ |
| 3 | Public GitHub repo + README (diagram, setup, GIF, benchmark table, memory note) + `.env.example`, no keys | builder + docs | ☐ |
| 4 | `tests.json` (10 cases) | builder | ☐ |
| 5 | 2–3 min demo video (YouTube unlisted or Drive, anyone with link) | docs | ☐ |
| 6 | Paper canvas photo (Drive, anyone with link) | team | ☐ |
| 7 | Google Form (group leader) | leader | ☐ |
| 8 | Google Classroom submission (same links) | leader | ☐ |

## 2. README structure
1. **Title + one-liner + badges** (live site, API health, demo video)
2. **The problem and business case** (5 lines): dealers miss after-hours leads → a 24/7 AI rep that qualifies and books → $79/mo + $5 per attended test drive; LLM cost < $0.01 per conversation
3. **Demo GIF** (`docs/demo.gif`, ≤ 8 MB, ~20 s: chat → search → booking confirmation → admin pipeline)
4. **Live links:** website, admin login (demo admin credentials **only if** we create a separate read-only demo admin; otherwise "on request"), API base, `/docs`
5. **Architecture diagram:** Mermaid (renders on GitHub) + `docs/architecture.png` export
   ```mermaid
   flowchart LR
     U[Buyer browser] --> W[Next.js on Vercel]
     A[Dealer admin] --> W
     W -- /api/chat proxy --> API[FastAPI on HF Spaces]
     G[Grader] -- POST /chat --> API
     API --> LG{{LangGraph}}
     LG --> GU[guard] --> AG[agent: Claude Haiku 5.5 + 13 tools] --> LT[lead_tracker]
     GU -- blocked --> LT
     AG <--> T[(tools)]
     LG --> CP[(Checkpointer: short-term)]
     LG --> ST[(Store: long-term)]
     T --> DB[(Neon Postgres)]
     CP --> DB
     ST --> DB
     W --> DB
   ```
6. **How the agent works:** nodes table, tools table (name → purpose → confirmation?), human-in-the-loop flow
7. **Memory design note** (required): short vs long table from M5 §1–2, where it's stored, the isolation layers (M5 §3, condensed)
8. **Safety:** the layers table (M6 §1) + example refusals
9. **Cost and reliability:** levers + spend cap + measured $/turn
10. **Benchmark results:** table from `bench/results.md`, date run, how to reproduce
11. **API contract:** request/response examples, curl
12. **Setup:** prerequisites, Neon, `.env`, `pip install`, `uvicorn`, `npm i && npm run dev`, seed, tests, deploy (HF + Vercel)
13. **Repo structure**
14. **Limitations and next steps** (open `/chat` by grader requirement, simulated follow-up sending, WhatsApp channel next)
15. **Team and credits** (starter repo patterns credited)

## 3. Demo video script (2:45)
| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Landing page | "Small car dealers lose buyers after hours. DealCloser gives them a 24/7 AI sales rep." |
| 0:15–0:45 | Chat: "Family car, about $35k, 7 seats" → recommendations with car cards and tool chips | "Ava qualifies the buyer, searches live inventory with real tools, and saves preferences." |
| 0:45–1:05 | "Monthly on APX-120 with $5k down?" → payment | "Financing and trade-in estimates come from deterministic tools, not guesses." |
| 1:05–1:30 | "Book Thursday at 11" → confirm card → Confirm → booked TD-… | "Risky actions pause for confirmation: LangGraph human-in-the-loop over our stateless API." |
| 1:30–1:50 | New chat: "What would you recommend?" → uses the remembered budget | "Long-term memory per user in Postgres; short-term per thread." |
| 1:50–2:05 | Injection attempt + off-topic → refusals; second browser shows isolation | "Guard node blocks injection at zero token cost; users are isolated at every layer." |
| 2:05–2:35 | Admin: overview KPIs → lead detail with score breakdown and transcript → follow-up draft | "The dealer sees a live pipeline, every conversation, and AI follow-ups: our GrowthPilot integration." |
| 2:35–2:45 | Architecture diagram + benchmark table | "Haiku 5.5, about $0.0006 per turn, X% benchmark pass rate. Thanks!" |

Recording: OBS or the Xbox Game Bar (Win+G), 1080p, browser zoom 110%, demo data seeded, the chat pre-tested. Upload to YouTube unlisted.

## 4. Demo GIF
ScreenToGif (Windows) or the Chrome GIF recorder; 960 px wide, 12 fps, about 20 s.

## 5. Google Form answers (draft; finalised after the benchmark)
- **Track:** DealCloser (car dealership), with a bonus GrowthPilot integration (AI follow-up drafting in the admin).
- **Nodes:** `guard` (rule-based safety: injection/off-topic/fraud/other-user, zero tokens) → `agent` (LangChain `create_agent` on claude-haiku-5-5 with 13 tools and middleware: dynamic memory prompt, history trim, human-in-the-loop, call limits, tool-error handling, output guard) → `lead_tracker` (deterministic CRM update: lead stage and score).
- **Tools:** search_inventory, get_vehicle_details, compare_vehicles, estimate_financing, estimate_trade_in, check_test_drive_slots, book_test_drive (confirm), cancel_test_drive (confirm), my_test_drives, save_buyer_profile, dealer_info, request_callback, forget_me (confirm).
- **Memory:** short-term = LangGraph Postgres checkpointer keyed `user_id::thread_id`; long-term = LangGraph Postgres store namespace `("buyer", user_id)` holding the profile (budget, body, seats, fuel, timeline, financing, trade-in, contact), notes, and recently viewed cars, injected into every prompt. All on Neon.
- **Safety:** refuses off-topic and injection (guard + prompt), never reveals the prompt, never invents prices or discounts, confirms before booking/cancelling/deleting memory (reply "yes" to confirm).
- **Demo data:** Apex Motors, 24 cars APX-101…APX-124 (APX-108 reserved, APX-115 sold); SUVs under $30k: APX-109, APX-104, APX-105; 7+ seats: APX-106, 107, 120, 121; EVs: 110–112; test drives Mon–Sat 10:00–17:00 on the hour (Asia/Karachi), next 14 days; financing default 7.9% APR.
- **Example prompts:** the tests.json inputs.
