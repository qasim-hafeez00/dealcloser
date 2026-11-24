# M1: Database

## 1. Neon or Supabase? Decision: **Neon**

| Factor | Neon | Supabase | Matters because |
|---|---|---|---|
| Connecting from HF Spaces (Python, psycopg) | Direct connection over IPv4 | Free-tier **direct connection is IPv6-only**; you must use the Supavisor pooler, whose transaction mode breaks prepared statements | LangGraph's `AsyncPostgresSaver/Store` need a stable psycopg connection. Neon avoids a known failure mode |
| Connecting from Vercel serverless | `pg` + `attachDatabasePool` on the pooled (`-pooler`) URL: no connection exhaustion | supabase-js or the pooler | Vercel functions open many short connections |
| Idle behaviour | Compute suspends after 5 min, wakes in about 0.5–1 s on the next query | Project pauses after **7 days** idle (needs a manual restore) | Neon wakes itself; a paused Supabase project means a dead API during evaluation |
| Branching | `main` (prod) + `dev` branch: same schema, separate data | Not on free tier | We test on `dev` and keep prod data clean for evaluation and the demo |
| Built-in auth | None (we build a small auth layer, M2) | Supabase Auth | Our auth is about 150 lines (JWT cookie); Supabase Auth would tie the website to supabase-js |
| Free limits | 0.5 GB storage, plenty of compute hours | 500 MB, 2 projects | Both are far more than we need (we'll use < 20 MB) |
| What the brief names | "Supabase or Neon Postgres" | same | Both allowed |

**Why it matters for the pitch / README:** "Serverless Postgres that scales to zero, wakes itself, and gives us a separate prod/dev branch: the memory layer survives restarts and redeploys."

### Neon setup (DONE, 23 Nov)
- Project `divine-wave-37946456`, Postgres **18.7**, region **AWS us-east-1**, database `neondb`. Linked via `neon init` (`neon.ts` + git-ignored `.neon`).
- Prod branch is named **`production`** (default branch), not `main`. Wherever the specs say "`main` branch", read `production`.
- `neon deploy` / `neon env pull` writes `.env.local` with **`DATABASE_URL` (pooled, `-pooler`)** and **`DATABASE_URL_UNPOOLED` (direct)**. We keep those exact names everywhere.
- Dev branch: `neon checkout dev --create` (note that `neon.ts` gives new branches a 7-day TTL, which is fine for us).
- Verified: both URLs connect and do a temp-table write/read (pg 8, TLS verify-full), about 3 s for a cold start.

| Who | Env var | Driver | Why |
|---|---|---|---|
| API (HF Space) | `DATABASE_URL_UNPOOLED` | psycopg 3 `AsyncConnectionPool` | long-running server; LangGraph saver/store need session features, and the pooler is PgBouncer transaction mode |
| Website (Vercel) | `DATABASE_URL` (pooled) | **`pg` (node-postgres) + `attachDatabasePool` from `@vercel/functions`** (Fluid compute) | Neon's current guidance for Vercel (neon-postgres skill); replaces `@neondatabase/serverless` |
| Migrations / seed | `DATABASE_URL_UNPOOLED` | psycopg | DDL needs a direct connection |
| Local dev | `dev` branch URLs | same as above | don't pollute prod |

### Python connection settings (API)
- `psycopg_pool.AsyncConnectionPool(conninfo, min_size=1, max_size=5, kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row}, check=AsyncConnectionPool.check_connection, max_idle=240)`
  - `autocommit` + `dict_row` are required by LangGraph's Postgres saver.
  - `check_connection` throws away connections that died while Neon was suspended.
- `sslmode=require` in the URL.
- One pool, shared by the saver, the store and our own queries.

## 2. Who owns what

| Table | Written by | Read by |
|---|---|---|
| LangGraph `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations` | API (saver) | API |
| LangGraph `store`, `store_migrations` | API (store) | API (web reads through `/internal/memory`) |
| `users`, `login_attempts` | Web | Web |
| `vehicles` | Seed, web admin | API tools, web |
| `leads` | API tools + lead_tracker; web admin (stage, admin_notes) | both |
| `bookings` | API tools; web (customer cancel, admin status) | both |
| `callbacks` | API tool; web (visit form, admin status) | both |
| `chat_log` | API | web (transcripts, analytics) |
| `followups` | API (`/internal/followups/draft`); web (edit/approve) | web |
| `dealer_policies` | Seed, web admin settings | API tool, web |

## 3. Schema (`api/sql/schema.sql`, idempotent: runs on every API startup)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,                       -- 'u_' || uuid
  email         citext UNIQUE NOT NULL,                 -- needs CREATE EXTENSION citext
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  password_hash text NOT NULL,                          -- bcrypt, cost 10
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id bigserial PRIMARY KEY, email citext NOT NULL, ip text, success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_time ON login_attempts (email, created_at DESC);

CREATE TABLE IF NOT EXISTS vehicles (
  id           text PRIMARY KEY CHECK (id ~ '^APX-[0-9]{3}$'),
  make         text NOT NULL, model text NOT NULL, trim text,
  year         int  NOT NULL CHECK (year BETWEEN 2000 AND 2027),
  price        int  NOT NULL CHECK (price > 0),
  mileage      int  NOT NULL CHECK (mileage >= 0),
  fuel         text NOT NULL CHECK (fuel IN ('gasoline','hybrid','electric','diesel')),
  transmission text NOT NULL CHECK (transmission IN ('automatic','manual')),
  body_type    text NOT NULL CHECK (body_type IN ('sedan','suv','hatchback','pickup','minivan','coupe')),
  seats        int  NOT NULL CHECK (seats BETWEEN 2 AND 9),
  color        text NOT NULL,
  mpg          text,                                    -- '30/38' or '120 MPGe' or '272 mi range'
  features     text[] NOT NULL DEFAULT '{}',
  description  text NOT NULL,
  featured     boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicles_search ON vehicles (status, body_type, price);

CREATE TABLE IF NOT EXISTS leads (
  user_id         text PRIMARY KEY,
  name            text, phone text, email text,
  stage           text NOT NULL DEFAULT 'new'
                  CHECK (stage IN ('new','engaged','qualified','visit_booked','won','lost')),
  score           int  NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  budget_max      int, body_type text, fuel text, min_seats int,
  timeline        text CHECK (timeline IN ('asap','this_month','1_3_months','3_plus_months','just_browsing')),
  financing       text CHECK (financing IN ('cash','finance','lease','undecided')),
  trade_in        text,
  lost_reason     text,
  admin_notes     text,
  message_count   int  NOT NULL DEFAULT 0,
  blocked_count   int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);
CREATE INDEX IF NOT EXISTS leads_stage ON leads (stage, score DESC);
CREATE INDEX IF NOT EXISTS leads_last_msg ON leads (last_message_at DESC);

CREATE SEQUENCE IF NOT EXISTS bookings_id_seq START 1001;
CREATE TABLE IF NOT EXISTS bookings (
  id           int PRIMARY KEY DEFAULT nextval('bookings_id_seq'),
  user_id      text NOT NULL,
  vehicle_id   text NOT NULL REFERENCES vehicles(id),
  slot         timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'confirmed'
               CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  contact_name text NOT NULL, phone text,
  cancel_reason text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_vehicle_slot
  ON bookings (vehicle_id, slot) WHERE status = 'confirmed';    -- no double booking
CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_slot
  ON bookings (user_id, slot) WHERE status = 'confirmed';       -- a person can't be in two cars at once
CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id, slot);

CREATE SEQUENCE IF NOT EXISTS callbacks_id_seq START 501;
CREATE TABLE IF NOT EXISTS callbacks (
  id             int PRIMARY KEY DEFAULT nextval('callbacks_id_seq'),
  user_id        text NOT NULL,
  reason         text NOT NULL,
  preferred_time text,
  contact        text,                                 -- phone or email
  source         text NOT NULL DEFAULT 'agent' CHECK (source IN ('agent','visit_form')),
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_log (
  id            bigserial PRIMARY KEY,
  user_id       text NOT NULL,
  thread_id     text NOT NULL,
  user_message  text NOT NULL,
  reply         text NOT NULL,
  tool_calls    jsonb NOT NULL DEFAULT '[]',
  tokens_in     int NOT NULL DEFAULT 0,
  tokens_out    int NOT NULL DEFAULT 0,
  cache_read    int NOT NULL DEFAULT 0,
  model_calls   int NOT NULL DEFAULT 0,
  latency_ms    int NOT NULL DEFAULT 0,
  blocked_by    text,                                  -- injection|off_topic|fraud|other_user|rate_limit|spend_cap|empty
  awaiting_confirmation boolean NOT NULL DEFAULT false,
  confirmation  text,                                  -- approved|rejected (on the turn that answered)
  error         text,
  source        text NOT NULL DEFAULT 'api' CHECK (source IN ('api','web')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_log_user_thread ON chat_log (user_id, thread_id, created_at);
CREATE INDEX IF NOT EXISTS chat_log_time ON chat_log (created_at DESC);

CREATE TABLE IF NOT EXISTS followups (
  id         serial PRIMARY KEY,
  user_id    text NOT NULL REFERENCES leads(user_id) ON DELETE CASCADE,
  channel    text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')),
  draft      text NOT NULL,
  status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','dismissed')),
  tokens_in  int NOT NULL DEFAULT 0, tokens_out int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS dealer_policies (
  topic  text PRIMARY KEY CHECK (topic IN ('hours','location','warranty','returns','documents',
                                           'financing_partners','trade_in_process','test_drive_rules')),
  answer text NOT NULL
);
```

How `source` gets set: the web proxy sends header `X-DealCloser-Source: web` with the service token; otherwise it's `api`. This lets the dashboard separate grader traffic from website traffic.

## 4. Seed data (`api/sql/seed.sql`, idempotent with `ON CONFLICT DO NOTHING`)

### Vehicles (24)
| ID | Year Make Model Trim | Body | Price | Miles | Fuel | Trans | Seats | Color | Status |
|---|---|---|---|---|---|---|---|---|---|
| APX-101 | 2022 Toyota Corolla LE | sedan | 19,900 | 28,400 | gasoline | auto | 5 | White | available |
| APX-102 | 2021 Honda Civic EX | sedan | 21,500 | 33,100 | gasoline | auto | 5 | Blue | available |
| APX-103 | 2023 Hyundai Elantra SEL | sedan | 22,800 | 12,600 | gasoline | auto | 5 | Gray | available |
| APX-104 | 2021 Honda CR-V EX Hybrid | suv | 27,900 | 31,200 | hybrid | auto | 5 | Silver | available ★ |
| APX-105 | 2022 Toyota RAV4 XLE | suv | 29,500 | 24,800 | gasoline | auto | 5 | Red | available ★ |
| APX-106 | 2020 Toyota Highlander XLE | suv | 33,900 | 41,000 | gasoline | auto | 7 | Black | available |
| APX-107 | 2022 Kia Telluride EX | suv | 41,500 | 22,300 | gasoline | auto | 8 | Green | available ★ |
| APX-108 | 2019 Honda Pilot EX-L | suv | 28,900 | 52,700 | gasoline | auto | 8 | White | **reserved** |
| APX-109 | 2021 Mazda CX-5 Touring | suv | 24,900 | 29,900 | gasoline | auto | 5 | Red | available |
| APX-110 | 2023 Tesla Model 3 RWD | sedan | 34,900 | 9,800 | electric | auto | 5 | White | available ★ |
| APX-111 | 2022 Tesla Model Y Long Range | suv | 42,900 | 18,400 | electric | auto | 5 | Blue | available |
| APX-112 | 2021 Chevrolet Bolt EV LT | hatchback | 18,900 | 21,000 | electric | auto | 5 | Orange | available |
| APX-113 | 2022 Toyota Prius LE | hatchback | 24,500 | 19,700 | hybrid | auto | 5 | Silver | available |
| APX-114 | 2020 Volkswagen Golf TSI | hatchback | 16,900 | 44,800 | gasoline | **manual** | 5 | Gray | available |
| APX-115 | 2018 Honda Fit LX | hatchback | 12,900 | 61,200 | gasoline | auto | 5 | Yellow | **sold** |
| APX-116 | 2017 Toyota Yaris L | hatchback | 9,900 | 78,500 | gasoline | auto | 5 | Red | available |
| APX-117 | 2021 Ford F-150 XLT | pickup | 38,900 | 35,600 | gasoline | auto | 5 | Blue | available ★ |
| APX-118 | 2020 Toyota Tacoma TRD Sport | pickup | 31,900 | 39,800 | gasoline | auto | 5 | Gray | available |
| APX-119 | 2022 Ford Maverick XLT Hybrid | pickup | 28,500 | 15,900 | hybrid | auto | 5 | White | available |
| APX-120 | 2023 Chrysler Pacifica Touring L | minivan | 36,900 | 14,200 | gasoline | auto | 7 | Silver | available |
| APX-121 | 2021 Honda Odyssey EX | minivan | 31,500 | 36,900 | gasoline | auto | 8 | Blue | available |
| APX-122 | 2022 BMW 330i | sedan | 36,500 | 21,700 | gasoline | auto | 5 | Black | available |
| APX-123 | 2021 Mercedes-Benz GLC 300 | suv | 39,900 | 27,300 | gasoline | auto | 5 | White | available |
| APX-124 | 2022 Ford Mustang GT | coupe | 37,900 | 11,900 | gasoline | **manual** | 4 | Red | available ★ |

★ = `featured`. Known answers for tests: SUVs under $30k that are available = **APX-109, APX-104, APX-105** (APX-108 is reserved). 7+ seats available = APX-106, 107, 120, 121. EVs = 110, 111, 112. Hybrids = 104, 113, 119. Cheapest = APX-116. Manual = 114, 124.
Each car gets 4–6 `features`, an `mpg` string, and a 1–2 sentence `description` (written in the seed file; descriptions contain no instructions).

### Dealer policies
| Topic | Answer (summary) |
|---|---|
| hours | Mon–Sat 10:00–18:00, closed Sunday. Test drives on the hour, last at 17:00 |
| location | Apex Motors, 42 Demo Avenue, Gulberg, Lahore (fictional) |
| warranty | 90-day/3,000-mile powertrain warranty on every used car; extended plans available |
| returns | 7-day/300-mile money-back guarantee if the car is unmodified |
| documents | Valid driving licence for test drives; licence + proof of address + proof of income for financing |
| financing_partners | Partner banks; APRs from 5.9% depending on credit; pre-qualification doesn't affect your credit score |
| trade_in_process | Online estimate → 20-minute inspection at the dealership → written offer valid 7 days |
| test_drive_rules | 30 minutes with a sales rep, licence required, 18+, one car per slot |

### Demo history (P1, makes the dashboard look alive)
- 6 demo leads (`demo_alice`, `demo_bilal`, `demo_chen`, `demo_dana`, `demo_emre`, `demo_fatima`) spread across all stages, `created_at` over the last 14 days.
- 4 bookings (2 upcoming, 1 completed, 1 no-show), 2 callbacks, about 40 `chat_log` rows with realistic tokens and latency, 1 sent follow-up.
- Every demo row has a `demo_` user_id prefix. The dashboard has a "Hide demo data" toggle (P2).

### Admin user
Created at seed time from env `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bcrypt hash computed by the seed script, not stored in git). Default email `admin@apexmotors.demo`.

## 5. Migration and reset
- `schema.sql` runs on API startup (idempotent), then `saver.setup()` and `store.setup()`.
- `python -m app.scripts.seed` seeds data (idempotent).
- `python -m app.scripts.reset --branch dev` truncates our tables (never runs if the URL is `main`, checked by comparing to the `MAIN_DB_HOST` env).
- **Before evaluation:** wipe the benchmark test users from prod (`DELETE … WHERE user_id NOT LIKE 'demo_%' AND user_id NOT LIKE 'u_%'`) so the graders start clean. Run once at about 23:15 tonight.

## 6. Size estimate
24 vehicles, ~1k chat_log rows, ~5k checkpoint rows: well under 50 MB.

## 7. Cut list
P2: demo-data toggle, reset script for prod.
