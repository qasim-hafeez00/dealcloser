# M2: Auth and identity

## 1. Three kinds of caller

| Caller | How they're identified | Where `user_id` comes from |
|---|---|---|
| **Grader / any API client** | Nobody. `/chat` must be open (hackathon rule) | Request body `user_id` (trusted as-is; this is the grading contract) |
| **Website visitor (guest)** | `dc_guest` cookie with a random `g_<uuid>` | Set server-side by the Next.js proxy; the browser never sends `user_id` |
| **Website customer (signed in)** | `dc_session` JWT cookie | `u_<uuid>` from the verified JWT, injected by the proxy |
| **Admin** | `dc_session` JWT with `role: "admin"` | Same; admin pages never call `/chat` as the admin |
| **Website server → API internal endpoints** | `Authorization: Bearer ${SERVICE_TOKEN}` | Path or body (the website is trusted) |

Key rule: **on the website, the browser can never choose its `user_id`.** The `/api/chat` proxy ignores any `user_id` in the browser's request body.

## 2. Customer auth (P0 signup/login/logout; P1 the rest)

### Pages
| Route | Fields | Validation | On success |
|---|---|---|---|
| `/signup` | name, email, password, confirm password, ☐ "I agree the AI assistant stores my car preferences" (required) | name 1–80; email RFC-ish regex, max 254; password ≥ 8 chars with a letter and a digit; passwords match | Create user, set session, **claim the guest's data (P1)**, redirect to `?next=` or `/account` |
| `/login` | email, password, "Remember me" (30 days vs 1 day) | non-empty | Set session, redirect to `next` (only relative paths allowed: an open-redirect guard) |
| `/logout` (POST) | – | – | Clear cookie, redirect `/` |
| `/forgot` (P2) | email | – | Shows "Contact the dealership to reset" (no email service) |

Errors (no clue about which part was wrong): "Email or password is incorrect." After 5 failed attempts in 15 minutes for an email: "Too many attempts, try again in 15 minutes." (from `login_attempts`). Signup with an existing email: "An account with this email already exists. Sign in instead?"

### Session
- JWT, HS256, signed with `AUTH_SECRET` (32+ random bytes), using the `jose` library (works in Next.js edge middleware).
- Claims: `sub` (user id), `name`, `email`, `role`, `iat`, `exp`.
- Cookie `dc_session`: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400` (or 30 days with "remember me").
- No server-side session table. Logout clears the cookie. A deleted account is caught because `/api/*` handlers check the user still exists on sensitive actions.

### Passwords
`bcryptjs` cost 10. Never logged. Admin password comes from env at seed time.

## 3. Guest identity (P0)
- First visit: middleware sets `dc_guest=g_<uuid>` (HttpOnly, 1 year) if neither cookie is present.
- Guests can chat, get recommendations and **book test drives** (contact name required by the tool), just like API users.
- Account pages say "Sign in to see your test drives and conversations on any device."

### Claiming guest data on signup or login (P1)
When someone with `dc_guest` signs up or logs in, the website calls `POST /internal/claim {from: g_x, to: u_y}`. The API, in one transaction:
1. `UPDATE bookings / callbacks / chat_log SET user_id = to WHERE user_id = from`
2. Merges the `leads` rows (keeping the non-null value of each field, the higher score, summed counts), deletes the guest row.
3. Copies store items from `("buyer", from)` to `("buyer", to)` (merging the profile; the newer value wins), deletes the old ones.
4. Checkpoints stay under the old key, so the old *chat threads* aren't continued after claiming (their transcripts are still visible because chat_log moved). This is a documented limitation.

Then clear the `dc_guest` cookie.

## 4. Route protection (`web/middleware.ts`)

| Path | Rule |
|---|---|
| `/`, `/inventory/**`, `/financing`, `/visit`, `/login`, `/signup` | Public |
| `/account/**` | Valid session required; otherwise redirect `/login?next=…` |
| `/admin/login` | Public; redirect to `/admin` if already admin |
| `/admin/**` | Session with `role=admin`; otherwise redirect `/admin/login` (a customer session gets a 403 page) |
| `/api/chat`, `/api/threads/**`, `/api/vehicles/**` | Public (identity from cookie) |
| `/api/account/**` | Session required (401 JSON) |
| `/api/admin/**` | Admin required (403 JSON). **Checked again inside each handler** (defense in depth: middleware isn't the only check) |

## 5. CSRF and abuse
- Cookies are `SameSite=Lax`, and every state-changing route handler checks the `Origin` header matches the site host; otherwise 403.
- Chat proxy limit: 20 messages/min per `user_id` (in-memory map per instance; best effort) plus the API's own limit.
- The visit/contact form has a honeypot field (hidden input; if filled, drop silently).

## 6. API side (FastAPI)

| Endpoint | Auth |
|---|---|
| `POST /chat`, `GET /health`, `GET /` | **Open** (required by the brief) |
| `GET /health/deep` | Bearer `SERVICE_TOKEN` |
| `GET/DELETE /internal/memory/{user_id}` | Bearer `SERVICE_TOKEN` |
| `POST /internal/claim`, `POST /internal/followups/draft` | Bearer `SERVICE_TOKEN` |

`SERVICE_TOKEN` is compared with `hmac.compare_digest`. A missing or wrong token gets 401 `{"detail":"unauthorized"}`.

**README note:** "`/chat` is unauthenticated because the hackathon grader requires it. In production, the website proxy would sign requests and the API would reject unsigned `user_id`s." That's an honest threat-model line, and graders like it.

## 7. Account management (P1)
- `/account/privacy`:
  - **Forget my preferences**: `DELETE /internal/memory/{id}` (same effect as the `forget_me` tool, without needing the chat confirmation step because the button has its own confirm dialog).
  - **Delete my account**: confirm dialog where you type `DELETE`. Deletes the user, store items, chat_log and followups; anonymises the lead (name/phone/email set to null, stage `lost`, reason `account_deleted`); cancels future bookings.
- Change password (P2).

## 8. Secrets

| Secret | Lives in |
|---|---|
| `ANTHROPIC_API_KEY` | HF Space secrets, local `api/.env` |
| `DATABASE_URL_UNPOOLED` (direct) | HF Space secrets, local `api/.env` |
| `DATABASE_URL` (pooled) | Vercel env, local `web/.env.local` |
| `AUTH_SECRET` | Vercel env |
| `SERVICE_TOKEN` | Both HF and Vercel |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Local only (used by the seed script) |
| `AGENT_API_URL` | Vercel env |

## 9. Cut list
P1: claim guest data, account privacy page. P2: forgot password, change password, demo-account quick login button on `/login` for judges ("Try as demo customer").
