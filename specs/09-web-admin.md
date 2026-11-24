# M9: Admin dashboard

Admin role required (M2). Layout: left sidebar (Overview, Leads, Conversations, Test drives, Callbacks, Inventory, Follow-ups, Safety, Usage & cost, Settings), top bar with a date-range selector (**Today / 7d / 30d / All**, default 7d, stored in the URL `?range=7d`), "Show demo data" toggle (P2), admin name + sign out.
All data comes from server components with parameterised SQL. Charts use Recharts, following the **dataviz skill** (load it before building charts): one categorical palette, labelled axes, tooltips, works in light and dark.
Every chart has an **empty state** ("No conversations in this period") and a loading skeleton.

Deltas compare the selected range with the previous range of the same length (e.g. last 7d vs the 7d before). Shown as ▲/▼ %; "—" when the previous value is 0.

---

### `/admin` Overview (P0)
**KPI tiles (8):**
| Tile | Query (range-filtered) |
|---|---|
| New leads | `count(*) FROM leads WHERE created_at in range` + delta |
| Qualified leads | count with `stage IN ('qualified','visit_booked','won')` and created in range; sub-label "% of leads" |
| Test drives booked | `count(*) FROM bookings WHERE created_at in range AND status <> 'cancelled'` |
| Lead → test drive rate | booked distinct users / new leads |
| Conversations | `count(DISTINCT (user_id, thread_id)) FROM chat_log` |
| Median response time | `percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)` where `blocked_by IS NULL` |
| AI spend | `Σ tokens → $` (chat_log + followups), with "of $1.60 cap" |
| Blocked attempts | `count(*) WHERE blocked_by IN ('injection','off_topic','fraud','other_user','output_leak')` |

**Charts (4):**
1. **Conversations & bookings per day** (combo: bars = conversations, line = bookings), x = days in range.
2. **Lead funnel** (horizontal bars): leads → engaged → qualified → visit booked → won, each with count and % of the first step. A lead counts toward every stage it has reached (the stage order defines it).
3. **What buyers want** (bar): count of leads by preferred `body_type` (plus "unknown").
4. **Tool usage** (bar): count per tool name from `jsonb_array_elements(tool_calls)->>'name'`.

**Tables:**
- **Hot leads** (top 5 by score, stage not won/lost): name/user, score bar, budget, stage, last active (relative), button "Open".
- **Upcoming test drives** (next 5): time, car, customer, status.

### `/admin/leads` (P0)
- **Toolbar:** search (name/email/phone/user_id), stage filter (multi), score range (0–100 slider), timeline filter, sort (score, last active, created, budget), **Export CSV** (P1), view toggle **Table / Pipeline board** (P1).
- **Table columns:** Customer (name or "Anonymous" + user_id, muted), Stage badge (colour per stage), Score (bar + number), Budget, Wants (body · seats · fuel), Timeline, Financing, Messages, Last active, Next test drive, actions (Open).
- **Pipeline board (P1):** columns new / engaged / qualified / visit booked / won / lost with cards (name, score, budget, last active); move stage via a dropdown on the card (no drag and drop).
- 25 per page, server-side pagination.

### `/admin/leads/[userId]` (P0)
| Panel | Content |
|---|---|
| Header | Name, user_id, contact (phone/email), stage selector (new…won/lost; "lost" asks for a reason), created / last active |
| Score breakdown | The 6 score components with ✓/✗ and points (shows *why* the lead is hot) |
| Profile (long-term memory) | From `GET /internal/memory/{id}`: all profile fields, notes, recently viewed cars (mini cards) |
| Activity timeline | Merged, newest first: messages (grouped per thread), bookings created/cancelled, callbacks, follow-ups sent, stage changes |
| Conversations | Threads list → transcript viewer: each turn shows the user message, reply, tool chips (expand → args JSON), tokens in/out, latency, flags (blocked / awaiting confirmation / approved / error) |
| Bookings | Table with status actions |
| Callbacks | Open/done |
| Admin notes | Textarea saved to `leads.admin_notes` |
| Actions | **Draft follow-up** (P1 bonus), Mark won, Mark lost |

### `/admin/conversations` (P1)
Table of threads across users: customer, thread id (short), first message (truncated), turns, tool calls, tokens, est. cost, last at, flags icons (🛡 blocked, ⏳ awaiting confirmation, ⚠ error), source (api/web). Filters: source, flag, search. Click → transcript (same viewer as the lead page).

### `/admin/test-drives` (P0 list, P1 calendar)
- **KPIs:** upcoming (next 7d), completed (range), no-show rate, cancellation rate.
- **Week calendar (P1):** columns Mon–Sat, rows 10:00–17:00, a cell shows car + customer, colour by status; week navigation.
- **List:** time, car (link), customer (link to lead), contact, status, created via (chat), actions: **Mark completed**, **No-show**, **Cancel** (reason). Completed → optional prompt "Mark lead as won?".
- Filters: status, date range, car.

### `/admin/callbacks` (P0)
Queue of open callbacks: ID, customer, reason, preferred time, contact, source (agent/visit form), age; actions **Done**, **Dismiss**. Tab for closed ones.

### `/admin/inventory` (P1)
- **KPIs:** available / reserved / sold counts, avg price of available stock, stock value.
- **Chart:** stock by body type (stacked by status).
- **"Most wanted" (interest ranking):** per vehicle, the count of `get_vehicle_details` + `compare_vehicles` + `check_test_drive_slots` + `book_test_drive` mentions in `chat_log.tool_calls` over the range. Tells the dealer which cars get attention.
- **Table:** ID, car, price (inline edit), mileage, status (dropdown available/reserved/sold), featured toggle, bookings count.
- **Add vehicle** form (zod validation matching the DB checks; next free APX-ID auto-assigned).

### `/admin/follow-ups` (P1, **GrowthPilot bonus**)
- **Eligible leads:** stage engaged/qualified, no message in the last 24 h (demo: configurable 1 h / 24 h / 72 h), no upcoming booking, not contacted in the last 72 h.
- Button **Draft follow-ups (n)** → `POST /api/admin/followups` → API `/internal/followups/draft` → per lead, one Haiku call with the profile + recently viewed + last 6 turns → a personalised 60–90-word email or SMS (mentions specific cars, the next step being a test drive slot, opt-out line). Cost shown per draft.
- **Draft cards:** customer, channel toggle (email/SMS), editable textarea, **Mark as sent** (sets `status='sent'` and `sent_at`; real sending is out of scope and labelled "simulated"), **Dismiss**.
- History tab: sent follow-ups, and whether the lead replied afterwards (any chat_log after `sent_at`): the "reply rate" KPI.

### `/admin/safety` (P0)
- **KPIs:** blocked total, by category; confirmations requested / approved / rejected; output-guard triggers.
- **Chart:** blocked attempts per day stacked by category.
- **Table:** time, customer, category, message (truncated, expandable), source.
- **Confirmations table:** action, customer, outcome (approved / rejected / still pending).

### `/admin/usage` (P1)
- **Gauge:** spend vs $1.60 cap (and vs the $2 key limit).
- **Charts:** tokens in/out per day (stacked bars); est. cost per day (line); latency p50/p95 per day (lines); turns per day split by source (api vs web).
- **Table:** averages: tokens in/out per turn, model calls per turn, cache-read share, cost per conversation, error rate, guard-refusal share (= "free" turns).
- **Benchmark results** (P2): the latest `bench/results.json` rendered as a table.

### `/admin/settings` (P1)
- Dealer policies editor (textarea per topic → `dealer_policies`).
- System status: calls `/api/admin/health` → API `/health/deep` (DB, store, model, version, uptime), shows green/red.
- Read-only config: model, spend cap, time zone, rate limits.

## Admin web API routes (all `role=admin` checked in the handler)
`PATCH /api/admin/leads/[id]` (stage, lost_reason, admin_notes) · `PATCH /api/admin/bookings/[id]` (status, reason) · `PATCH /api/admin/callbacks/[id]` · `POST /api/admin/vehicles`, `PATCH /api/admin/vehicles/[id]` · `POST /api/admin/followups` (draft), `PATCH /api/admin/followups/[id]` (edit/sent/dismiss) · `PUT /api/admin/policies/[topic]` · `GET /api/admin/health` · `GET /api/admin/leads.csv`

## Files
```
web/app/admin/layout.tsx (sidebar, range picker), page.tsx, leads/page.tsx, leads/[userId]/page.tsx,
  conversations/page.tsx, test-drives/page.tsx, callbacks/page.tsx, inventory/page.tsx,
  follow-ups/page.tsx, safety/page.tsx, usage/page.tsx, settings/page.tsx, login/page.tsx
web/components/admin/KpiTile.tsx, Chart*.tsx, DataTable.tsx, StageBadge.tsx, ScoreBar.tsx,
  TranscriptViewer.tsx, Timeline.tsx, RangePicker.tsx
web/lib/admin-queries.ts (all SQL in one place)
```

## Cut list
P0 = Overview, Leads + detail, Test drives list, Callbacks, Safety. P1 = Conversations, calendar, Inventory, Follow-ups, Usage, Settings, pipeline board, CSV. P2 = demo-data toggle, benchmark page.
