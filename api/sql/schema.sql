-- DealCloser schema. Idempotent: runs on every API startup.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         citext UNIQUE NOT NULL,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  password_hash text NOT NULL,
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
  mpg          text,
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
  id            int PRIMARY KEY DEFAULT nextval('bookings_id_seq'),
  user_id       text NOT NULL,
  vehicle_id    text NOT NULL REFERENCES vehicles(id),
  slot          timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  contact_name  text NOT NULL, phone text,
  cancel_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_vehicle_slot ON bookings (vehicle_id, slot) WHERE status = 'confirmed';
CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_slot    ON bookings (user_id, slot)    WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id, slot);

CREATE SEQUENCE IF NOT EXISTS callbacks_id_seq START 501;
CREATE TABLE IF NOT EXISTS callbacks (
  id             int PRIMARY KEY DEFAULT nextval('callbacks_id_seq'),
  user_id        text NOT NULL,
  reason         text NOT NULL,
  preferred_time text,
  contact        text,
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
  blocked_by    text,
  awaiting_confirmation boolean NOT NULL DEFAULT false,
  confirmation  text,
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
