# M8: Website, customer side

**Stack:** Next.js (App Router, TypeScript), Tailwind CSS, `pg` + `@vercel/functions` (`attachDatabasePool`, pooled `DATABASE_URL`), `jose`, `bcryptjs`, `zod`, `recharts` (financing charts), `lucide-react` icons. No component library (fast to build, no setup risk).
**Look:** clean automotive style: white/neutral background, one brand colour (deep blue `#1E3A8A`), accent amber for CTAs, Inter font. Dark mode P2.
**Car images:** no photos (licensing, broken links). A **`CarArt` SVG component** draws a body-type silhouette (sedan/suv/hatchback/pickup/minivan/coupe) filled with the car's colour on a soft gradient. It looks consistent and never breaks.

## Global layout
- **Header:** logo "Apex Motors · powered by DealCloser"; nav: Inventory, Financing, Visit us; right: "Sign in" or an account menu (My account, Sign out). Mobile: hamburger.
- **Footer:** hours, address, "AI assistant may make mistakes; prices and availability confirmed at the dealership", links to the GitHub repo and `/admin/login` ("Dealer login").
- **Chat launcher:** floating button bottom-right on every customer page ("Chat with Ava"), with an unread dot when a reply arrives while it's closed.

## Pages

### `/` Home (P0)
| Section | Content / data |
|---|---|
| Hero | H1 "Find your next car in minutes, not weekends." Sub: "Ava, our AI sales assistant, finds matching cars, estimates payments and books test drives 24/7." CTAs: **Chat with Ava** (opens chat), **Browse inventory** |
| Quick search | Body type select + max price select + "Search" → `/inventory?body=suv&max=30000` |
| Stats strip (live from DB) | `{n} cars in stock` (available count), `From ${min price}`, `{n} EVs & hybrids`, "Test drives Mon–Sat" |
| Shop by body type | 6 tiles with CarArt + count per body type (available) → filtered inventory |
| Featured cars | `featured=true AND status='available'`, 6 cards |
| How it works | 3 steps: Tell Ava what you need → Get matches & payments → Book a test drive |
| FAQ | Accordion from `dealer_policies` (hours, warranty, returns, documents) |
| Suggested prompts | Chips that open the chat pre-filled: "SUVs under $30k", "7-seaters for a family", "What's my car worth?", "Cheapest EV" |

### `/inventory` (P0)
- **Filters (left sidebar; drawer on mobile):** body type (checkboxes with counts), make (select), price min/max, year min, mileage max, fuel (checkboxes), seats ≥ (select 2/4/5/7/8), transmission. "Clear all".
- **Top bar:** result count "12 cars", sort (price ↑, price ↓, newest, lowest mileage), toggle "Include reserved/sold" (off by default).
- **URL** stores all filters (shareable, back button works). Server component queries the DB with parameterised SQL.
- **Card:** CarArt, "2021 Honda CR-V EX Hybrid", price `$27,900`, "est. $463/mo" (10% down, 60 mo, 7.9%), chips: mileage, fuel, seats, transmission; badges: Hybrid/EV, 7+ seats, Low miles (< 15k), Reserved/Sold overlay; buttons **Details**, **Ask Ava**.
- **Empty state:** "No exact matches." plus a button "Ask Ava for alternatives", which opens chat pre-filled with the filters in words.

### `/inventory/[id]` (P0)
| Block | Content |
|---|---|
| Header | CarArt large, title, ID badge `APX-104`, status badge, price, est. monthly |
| Specs table | Year, make, model, trim, mileage, fuel, MPG/range, transmission, body, seats, color |
| Features | Bullet chips |
| Description | Text |
| Payment calculator (client) | Inputs: down payment (slider 0–50%), term (36/48/60/72/84), APR (default 7.9). Output: monthly, total interest. **Same formula as the `estimate_financing` tool** (`lib/finance.ts`, with a shared test fixture) |
| Actions | **Book a test drive** → opens chat and sends "I'd like to book a test drive for APX-104"; **Ask a question** → opens chat with "Tell me more about APX-104"; **Compare** (P2) |
| Similar cars | Same body type, price ±20%, available, max 3 |
| Sold/reserved | Banner "This car is sold. See similar cars"; booking button hidden |
| Unknown ID | Custom 404 "Car not found" with a link back to inventory |

### `/financing` (P1)
- Calculator: price, down, term, APR → monthly, total paid, total interest.
- **Charts:** (1) a **stacked area/line chart** of remaining balance and cumulative interest by month; (2) a **donut** of principal vs interest. Built with Recharts (dataviz skill rules: accessible colours, labelled axes, tooltip).
- Table: the yearly amortization summary (year, principal paid, interest paid, balance).
- CTA "Get matched to cars in this budget" → chat with "My budget is about $X per month".

### `/visit` (P1)
Hours table, address, a static map illustration (SVG; no API key), directions text, **contact form** (name, phone or email, message, preferred time; honeypot) → `POST /api/contact` → inserts a `callbacks` row (`source='visit_form'`) → success toast "We'll call you within one business day."

### `/login`, `/signup` (P0): see M2. Includes "Continue as guest" and (P2) "Try demo customer".

### `/account` (P0 basic, P1 full), session required
Tabs:
| Tab | Content |
|---|---|
| **Overview** | "Welcome back, {name}". Upcoming test drives (cards: car, date/time, ID, **Cancel** with a confirm modal → `POST /api/account/bookings/{id}/cancel`, ownership checked server-side). Lead progress bar (stage) and "What you've told us" summary |
| **Conversations** (P1) | List of threads from `chat_log` grouped by thread_id: first message as title, last activity, number of turns. Click → transcript (read-only) + "Continue this conversation" (opens chat on that thread_id) |
| **My preferences** (P1) | Profile from `GET /internal/memory/{id}` (via the web server): budget, needs, timeline, financing, trade-in, notes, recently viewed cars (mini cards) |
| **Privacy** (P1) | Forget my preferences; Delete my account (M2 §7) |

## Chat widget (P0, the heart of the demo)
**Panel:** 400×640 on desktop, full screen on mobile. Header: avatar "Ava", subtitle "AI sales assistant · usually replies in seconds", buttons: New chat, Conversations (signed-in users), Close.

| Feature | Detail |
|---|---|
| Empty state | Greeting + 4 suggested-prompt chips |
| Messages | User right, Ava left; light markdown (bold, lists, line breaks; links open in a new tab); timestamps on hover |
| **Car mentions → cards** | `APX-\d{3}` in a reply is parsed; the widget fetches `/api/vehicles?ids=…` and shows mini cards (art, title, price, "View" link) under the message |
| **Tool chips** | Under each Ava message: small chips per tool call ("🔍 Searched inventory", "💳 Estimated payment", "📅 Checked slots", "✅ Booked test drive") with a tooltip showing the args. Transparency for the demo and judges |
| **Confirmation** | When the proxy returns `awaitingConfirmation: true`: the reply is shown in a highlighted card with **Confirm** / **Change** buttons (send "yes" / "no"); the input still works |
| Sending | Enter sends, Shift+Enter newline; 2,000-char limit with a counter; input disabled while waiting; typing indicator (3 dots) |
| Errors | Network/5xx → inline "Couldn't reach Ava. Retry" with a retry button (resends the same message, same thread) |
| Timeouts | Client abort at 60 s → same error UI |
| Persistence | `thread_id` per user in `localStorage` (`dc_thread_<userId>`); on open, it loads the transcript via `GET /api/threads/{thread_id}` (chat_log rows, scoped to the cookie user). If localStorage is unavailable, a new thread each load |
| New chat | New uuid thread; old one is still available under Conversations |
| Pre-fill API | `window.dispatchEvent(new CustomEvent("dc:chat", {detail: {message, autoSend}}))`, used by the car page, home chips and inventory empty state |
| Accessibility | Focus trapped when open, Esc closes, aria-live polite on new messages, buttons with labels |
| Disclaimer | Small text under the input: "Ava is an AI and can make mistakes. Prices confirmed at the dealership." |

## Web API routes (Next.js route handlers)
| Route | Auth | Does |
|---|---|---|
| `POST /api/chat` | cookie identity | body `{thread_id, message}` (zod-validated; thread_id must be a uuid) → calls `${AGENT_API_URL}/chat` with `user_id` from the session/guest cookie, `X-DealCloser-Source: web` + service token → returns `{reply, toolCalls, awaitingConfirmation}`. `maxDuration = 60`. Upstream timeout 55 s → `{error:"timeout"}` |
| `GET /api/threads` | cookie identity | the user's threads (title, last_at, turns) |
| `GET /api/threads/[threadId]` | cookie identity | turns for that thread **where user_id = cookie user** |
| `GET /api/vehicles?ids=` | public | mini card data (max 6 IDs) |
| `POST /api/contact` | public | visit form → callbacks |
| `POST /api/auth/signup`, `/login`, `/logout` | – | M2 |
| `GET /api/account/memory`, `DELETE /api/account/memory` | session | proxies to `/internal/memory/{session user}` |
| `POST /api/account/bookings/[id]/cancel` | session | `UPDATE … WHERE id AND user_id = session user AND status='confirmed' AND slot > now()` |
| `DELETE /api/account` | session | account deletion |

## Files
```
web/app/(site)/page.tsx, inventory/page.tsx, inventory/[id]/page.tsx, financing/page.tsx, visit/page.tsx,
    login/page.tsx, signup/page.tsx, account/page.tsx (+ tabs)
web/app/api/... (above)
web/components/ChatWidget.tsx, ChatMessage.tsx, ToolChips.tsx, ConfirmCard.tsx, CarArt.tsx, CarCard.tsx,
    Filters.tsx, PaymentCalculator.tsx, AmortizationChart.tsx, Header.tsx, Footer.tsx
web/lib/db.ts, auth.ts, finance.ts, format.ts, agent.ts (API client), identity.ts (guest/session)
web/middleware.ts
```

## Cut list
P1: /financing charts, /visit, account Conversations/Preferences/Privacy tabs, car cards in chat. P2: compare page, dark mode, demo-customer login.
