# M4: Tools

## Design rules (apply to every tool)
1. **`user_id` is never an argument.** It comes from `runtime.context.user_id`.
2. Each description says **when** to use the tool and when not to. That's the main lever for tool accuracy.
3. Arguments are typed with Pydantic, use `Literal` enums where possible, and are optional where sensible. Bad input returns a helpful `ERROR: …` string telling the model how to fix it; it never raises.
4. Output is **compact text** (one line per car), capped at 1,500 characters. That saves tokens and is easier for the model to quote.
5. Every DB query is parameterised. No string SQL.
6. Shared helpers: `normalize_vehicle_id`, `parse_slot`, `fmt_money`, `fmt_slot`, `ensure_lead(user_id)`.
7. Read-only tools have no side effects except recording "recently viewed" vehicles (in code, cheap).

**Tool count: 13** (definitions ≈ 2k tokens, cached).

---

### T1 `search_inventory` (P0)
**Description:** "Search Apex Motors' available cars. Use for any request to find, list or recommend cars, including by budget, body type, seats, fuel, make or year. Never recommend a car without calling this or get_vehicle_details first."

| Arg | Type | Notes |
|---|---|---|
| make | str? | case-insensitive match; synonyms: chevy→Chevrolet, vw→Volkswagen, merc/mercedes→Mercedes-Benz |
| model | str? | ILIKE `%x%` |
| body_type | Literal[sedan,suv,hatchback,pickup,minivan,coupe]? | normalise: crossover→suv, truck→pickup, van→minivan, sports car→coupe |
| fuel | Literal[gasoline,hybrid,electric,diesel]? | ev/electric→electric, petrol/gas→gasoline |
| max_price / min_price | int? | 1k–500k; reject negatives |
| min_year | int? | |
| max_mileage | int? | |
| min_seats | int? | |
| transmission | Literal[automatic,manual]? | |
| sort | Literal[price_asc, price_desc, newest, lowest_mileage] = price_asc | |
| limit | int = 5 | clamp 1–8 |

**Logic:** `WHERE status='available'` plus filters → count + top N.
**No results:** loosen in this order (max_price +15% → max_price +30% → drop min_year → drop body_type; never drop min_seats or fuel because those are hard needs). Example: 7+ seats under $25k → none at +15% (APX-108 is reserved) → APX-121 ($31,500, 8 seats) at +30% and return `No exact matches. Closest options (over your <constraint>):` plus up to 3 cars. If still none: `No cars match. Try a higher budget or fewer filters.`
**Output:**
```
Found 3 cars (showing 3):
APX-109 | 2021 Mazda CX-5 Touring | suv | $24,900 | 29,900 mi | gasoline | auto | 5 seats | Red
APX-104 | 2021 Honda CR-V EX Hybrid | suv | $27,900 | 31,200 mi | hybrid | auto | 5 seats | Silver
...
```
**Tests:** SUVs ≤ 30k → {109, 104, 105} (108 reserved, excluded); 7+ seats → {106,107,120,121}; electric → {112,110,111} by price; `body_type="truck"` → pickups; max_price=5000 → loosened message; sort newest; limit clamp.

### T2 `get_vehicle_details` (P0)
**Description:** "Get full details for one car by its ID (e.g. APX-104): specs, features, mileage, MPG, status. Use when the buyer asks about a specific car."
**Args:** `vehicle_id: str`.
**Logic:** normalise the ID (`apx104`, `APX 104`, `104` → `APX-104`). Includes reserved/sold cars with their status shown (so "is APX-115 available?" gets the answer "sold"). Records it in recently-viewed (store, last 5, deduped).
**Not found:** `ERROR: No car with ID APX-199. Use search_inventory to find cars.`
**Output:** a multi-line block: title, price, est. monthly (10% down, 60 mo, 7.9%), mileage, fuel/MPG, transmission, seats, color, features, description, status, "Test drives: Mon–Sat 10:00–17:00".
**Tests:** normalisation variants; sold car → status sold, no booking suggestion; unknown ID error.

### T3 `compare_vehicles` (P1)
**Description:** "Compare 2–3 cars side by side by their IDs. Use when the buyer asks which is better or wants a comparison."
**Args:** `vehicle_ids: list[str]` (2–3).
**Output:** one line per field (price, year, mileage, fuel/MPG, seats, transmission, key features), plus "Cheapest: X; lowest mileage: Y; most seats: Z".
**Errors:** fewer than 2 or more than 3 → error; unknown ID → which one.

### T4 `estimate_financing` (P0)
**Description:** "Estimate a monthly car payment. Use for questions about monthly payments, loans, down payment, APR or term. Give either vehicle_id or price."

| Arg | Type | Default / rules |
|---|---|---|
| vehicle_id | str? | the price is looked up |
| price | int? | used if no vehicle_id; one of the two is required |
| down_payment | int = 10% of price | 0 ≤ down < price |
| term_months | Literal[24,36,48,60,72,84] = 60 | other values → nearest allowed, noted in the output |
| apr | float = 7.9 | 0–30 |

**Math:** `P = price − down; r = apr/1200; pay = P*r/(1−(1+r)^−n)`, or `P/n` when apr = 0. Total paid = `pay*n + down`, interest = `pay*n − P`. Round to whole dollars.
**Output:** `APX-104 ($27,900): $5,000 down, 60 months at 7.9% APR → about $463/month. Total interest ≈ $4,894. Estimate only; excludes tax/fees; APR depends on credit.`
**Tests:** known values (27,900 / 5,000 / 60 / 7.9 → 463); apr 0; down ≥ price → error; term 50 → 48 noted; neither price nor ID → error. **The website calculator uses the same formula**, and a shared fixture tests both give the same number.

### T5 `estimate_trade_in` (P0)
**Description:** "Estimate the trade-in value of the buyer's current car. Use when they mention trading in or selling their car."

| Arg | Type |
|---|---|
| make, model | str |
| year | int (1995–current) |
| mileage | int ≥ 0 |
| condition | Literal[excellent, good, fair, poor] = good |

**Model (deterministic):** base new price by segment: lookup by make → tier (economy $24k: Toyota/Honda/Hyundai/Kia/Mazda/Chevrolet/Ford/VW/Nissan; premium $45k: BMW/Mercedes-Benz/Audi/Lexus/Tesla; truck body hint → +$8k; unknown make → $26k). Value = base × 0.85^age (age ≥ 1, first year 0.80), mileage adjustment −$0.06 per mile over `12k × age` (+$0.03 per mile under, capped at +10%), condition × {1.0, 0.92, 0.80, 0.62}, floor $800. Range = ±8%, rounded to $100.
**Output:** `Estimated trade-in for a 2015 Toyota Corolla, 90,000 mi, good: $6,900–$8,100. Final offer after a 20-minute inspection at the dealership.` Also saves `trade_in` to the profile (in code).
**Tests:** monotonic (older or more miles → lower), premium > economy at the same age, floor applied, future year → error.

### T6 `check_test_drive_slots` (P0)
**Description:** "List free test-drive slots for a car. Use before booking, or when the buyer asks when they can come in. date is YYYY-MM-DD in dealer time; omit it to get the next available days."
**Args:** `vehicle_id: str`, `date: str?`.
**Logic:** opening hours Mon–Sat, hourly starts 10:00–17:00, dealer TZ. Window = now + 1 h → +14 days. Remove slots with a confirmed booking for this car. The car must be `available`; reserved or sold → `ERROR: APX-108 is reserved and can't be test driven. Similar available cars: …` (top 2 by same body).
- With a date: that day's free slots. A Sunday, past date, or a date > 14 days ahead → explain, and give the next 3 days that have slots.
- No date: the next 3 open days, up to 4 slots each.
**Output:** `Free slots for APX-104 (dealer time): Wed 25 Nov: 10:00, 11:00, 14:00, 16:00 | Thu 26 Nov: …`
**Tests:** Sunday, past, already booked, reserved car, 17:00 is last, today's earlier hours excluded.

### T7 `book_test_drive` (P0, **needs confirmation**)
**Description:** "Book a test drive. Needs vehicle_id, slot ('YYYY-MM-DD HH:MM', dealer time, on the hour) and the buyer's name. Check slots first. The system asks the buyer to confirm automatically."

| Arg | Type | Rules |
|---|---|---|
| vehicle_id | str | normalised, car must be available |
| slot | str | parse `YYYY-MM-DD HH:MM` or `YYYY-MM-DDTHH:MM`; must be a valid opening slot in the window |
| contact_name | str | 1–80 chars; if missing, use the profile name; if still none → `ERROR: ask the buyer's name first.` |
| phone | str? | 7–15 digits after removing spaces, +, - and brackets |

**Logic (one transaction):** re-validate everything (the slot may have been taken during the confirmation) → user has < 3 upcoming confirmed bookings → INSERT. A unique violation means `ERROR: That slot was just taken. Free slots that day: …`. Then: leads.stage = `visit_booked` (unless won/lost), save the name/phone to the profile, recompute score.
**Output:** `Booked ✔ TD-1004: 2021 Honda CR-V EX Hybrid (APX-104), Wed 25 Nov 11:00, for Alice. Bring your driving licence. Address: 42 Demo Avenue.`
**Tests:** happy path; same slot again (another user) → taken; same user other car same slot → error "you already have a test drive then"; 4th booking → limit; 18:00 → invalid; past → invalid; reserved car; missing name.

### T8 `cancel_test_drive` (P0, **needs confirmation**)
**Description:** "Cancel one of the buyer's own upcoming test drives by booking ID (e.g. TD-1004). Use my_test_drives first if the ID is unknown."
**Args:** `booking_id: str`, `reason: str?`.
**Logic:** `UPDATE bookings SET status='cancelled' WHERE id=$1 AND user_id=$ctx AND status='confirmed' AND slot > now()`. Zero rows → `ERROR: No upcoming test drive TD-xxxx on your account.` The same message whether the booking doesn't exist or belongs to someone else (doesn't leak that it exists). If no upcoming bookings remain, the stage falls back to qualified/engaged by score.
**Tests:** own booking OK; another user's booking → same not-found message; already cancelled; past booking.

### T9 `my_test_drives` (P0)
**Description:** "List the buyer's own test drives (upcoming first, plus the last 3 past ones). Use when they ask about their bookings or appointments."
**Output:** `Upcoming: TD-1004 | APX-104 2021 Honda CR-V EX Hybrid | Wed 25 Nov 11:00 | confirmed` / `Past: …` / `You have no test drives booked.`
**Tests:** isolation (bob never sees alice's), ordering, empty.

### T10 `save_buyer_profile` (P0, the long-term memory write path)
**Description:** "Save lasting facts about the buyer for future conversations: name, phone, budget, preferred body type/fuel, seats needed, timeline, cash/finance/lease, trade-in, or a short note (family size, use case). Call it as soon as the buyer shares any of these. Only save what the buyer said."

| Arg | Type | Rules |
|---|---|---|
| name | str? | 1–80 |
| phone | str? | 7–15 digits |
| email | str? | regex |
| budget_max | int? | 1,000–500,000 |
| body_type | Literal[...]? | as in T1 |
| fuel | Literal[...] or "any"? | |
| min_seats | int? | 2–9 |
| timeline | Literal[asap,this_month,1_3_months,3_plus_months,just_browsing]? | |
| financing | Literal[cash,finance,lease,undecided]? | |
| trade_in | str? | ≤ 120 chars |
| note | str? | ≤ 200 chars, run through the guard's injection regex (blocked notes are dropped and logged); deduped; max 10 notes (oldest dropped) |

**Logic:** merge into store `("buyer", uid)` key `profile` (only non-null fields overwrite; `updated_at` is set); note → key `note:<uuid>`; mirror to the `leads` row; recompute score/stage.
**Output:** `Saved: budget $25,000, 7+ seats, timeline this month.`
**Tests:** partial update keeps old fields; invalid budget → error naming the field (other valid fields still saved); injection-like note dropped; 11th note evicts the oldest.

### T11 `dealer_info` (P0)
**Description:** "Answer questions about Apex Motors: opening hours, location, warranty, returns, required documents, financing partners, trade-in process, test drive rules."
**Args:** `topic: Literal[hours, location, warranty, returns, documents, financing_partners, trade_in_process, test_drive_rules]`.
**Output:** the policy text from `dealer_policies`.

### T12 `request_callback` (P0)
**Description:** "Ask a human sales manager to contact the buyer. Use for price negotiation or discounts, special requests, complaints, or when the buyer asks for a person."
**Args:** `reason: str` (≤ 300), `preferred_time: str?`, `contact: str?` (phone or email).
**Logic:** contact = argument, or the profile phone/email. If none: `ERROR: ask for a phone number or email first.` Insert into callbacks; at most 3 open callbacks per user (otherwise "already requested", returning the existing ID).
**Output:** `Callback requested CB-503: a sales manager will contact you at +92 300 1234567 (preferred: tomorrow afternoon).`
**Not confirm-gated:** the buyer explicitly asks for it and it's harmless.

### T13 `forget_me` (P1, **needs confirmation**)
**Description:** "Delete everything remembered about the buyer (profile, notes, recently viewed). Only when they explicitly ask to be forgotten or to delete their data."
**Logic:** delete all store items in `("buyer", uid)`; set the leads row's personal fields to null (name, phone, email, notes, preferences); keep bookings (business record; told to the user).
**Output:** `Done. I've deleted your saved preferences and notes. Your test-drive bookings are unchanged.`

---

## Lead score (shared function, unit tested)
`budget_max +25, timeline (not just_browsing) +20, financing +15, body_type or min_seats +15, name and (phone or email) +15, upcoming confirmed booking +10` → max 100.
Stage, unless the current stage is won/lost (only an admin changes those): upcoming booking → `visit_booked`; score ≥ 60 → `qualified`; message_count ≥ 1 → `engaged`; else `new`.

## Tool eval matrix (feeds M10)
| Prompt | Expected tool(s) | Must NOT call |
|---|---|---|
| "Show me SUVs under 30k" | search_inventory(body_type=suv, max_price=30000) | book_test_drive |
| "Tell me about APX-110" | get_vehicle_details | search_inventory |
| "CR-V vs RAV4?" | compare_vehicles or 2× get_vehicle_details | – |
| "Monthly on APX-104, $5k down, 60 months" | estimate_financing | – |
| "What's my 2015 Corolla with 90k miles worth?" | estimate_trade_in | – |
| "When can I test drive APX-104?" | check_test_drive_slots | book_test_drive |
| "Book APX-104 tomorrow 11am, I'm Alice" | (check_test_drive_slots) → book_test_drive (paused) | – |
| "What bookings do I have?" | my_test_drives | – |
| "Cancel TD-1004" | (my_test_drives) → cancel_test_drive (paused) | – |
| "My budget is 25k, I need 7 seats" | save_buyer_profile | – |
| "What are your hours?" | dealer_info(hours) | – |
| "Can you do 20% off?" | request_callback (after asking for contact) | – |
| "Forget everything about me" | forget_me (paused) | – |
| "Hi" | none | any |
