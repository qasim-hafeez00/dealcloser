"""The agent's 13 tools.

Rules: user_id is NEVER an argument (it comes from runtime.context); bad input returns an
'ERROR: ...' string telling the model how to fix it; output is compact text capped at 1,500 chars;
every query is parameterised.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Annotated, Literal

import psycopg
from langchain.tools import ToolRuntime, tool

from . import config, db, logic, memory
from .guard import is_injection

log = logging.getLogger("dealcloser.tools")
MAX_OUT = 1500


@dataclass
class DealContext:
    """Set by the server per request. Never by the model."""
    user_id: str
    thread_id: str
    source: str = "api"
    now_iso: str = ""


Rt = ToolRuntime[DealContext]


def _uid(rt: Rt) -> str:
    return rt.context.user_id


def _now(rt: Rt) -> datetime:
    try:
        return datetime.fromisoformat(rt.context.now_iso).astimezone(config.DEALER_TZ)
    except Exception:
        return datetime.now(config.DEALER_TZ)


def _cap(s: str) -> str:
    return s if len(s) <= MAX_OUT else s[: MAX_OUT - 20] + "\n...(truncated)"


def _title(v: dict) -> str:
    return " ".join(str(x) for x in (v["year"], v["make"], v["model"], v.get("trim") or "") if x).strip()


def _line(v: dict) -> str:
    trans = "auto" if v["transmission"] == "automatic" else "manual"
    return (f"{v['id']} | {_title(v)} | {v['body_type']} | {logic.fmt_money(v['price'])} | {v['mileage']:,} mi | "
            f"{v['fuel']} | {trans} | {v['seats']} seats | {v['color']}")


async def _vehicle(vid: str) -> dict | None:
    return await db.fetchrow("SELECT * FROM vehicles WHERE id=%s", vid)


async def _similar(v: dict, n: int = 2) -> list[dict]:
    return await db.fetch(
        """SELECT * FROM vehicles WHERE status='available' AND id<>%s
           ORDER BY (body_type=%s) DESC, abs(price-%s) LIMIT %s""",
        v["id"], v["body_type"], v["price"], n)


# ---------------------------------------------------------------- T1
@tool
async def search_inventory(
    runtime: Rt,
    body_type: Annotated[str | None, "sedan, suv, hatchback, pickup, minivan or coupe"] = None,
    max_price: Annotated[int | None, "Maximum price in USD"] = None,
    min_price: Annotated[int | None, "Minimum price in USD"] = None,
    min_seats: Annotated[int | None, "Minimum number of seats"] = None,
    fuel: Annotated[str | None, "gasoline, hybrid, electric or diesel"] = None,
    make: Annotated[str | None, "Brand, e.g. Toyota"] = None,
    model: Annotated[str | None, "Model name, e.g. RAV4"] = None,
    min_year: int | None = None,
    max_mileage: int | None = None,
    transmission: Annotated[str | None, "automatic or manual"] = None,
    sort: Literal["price_asc", "price_desc", "newest", "lowest_mileage"] = "price_asc",
    limit: Annotated[int, "1-8, default 5"] = 5,
) -> str:
    """Search Apex Motors' AVAILABLE cars. Use for any request to find, list or recommend cars, by budget,
    body type, seats, fuel, make, model, year or mileage. Never recommend a car without calling this or
    get_vehicle_details first. Leave a filter empty if the buyer didn't specify it."""
    body = logic.norm_body(body_type)
    if body is False:
        return f"ERROR: unknown body_type '{body_type}'. Use one of: {', '.join(logic.BODY_TYPES)}."
    fl = logic.norm_fuel(fuel)
    if fl is False:
        return f"ERROR: unknown fuel '{fuel}'. Use one of: {', '.join(logic.FUELS)}."
    tr = logic.norm_transmission(transmission)
    if tr is False:
        return "ERROR: transmission must be automatic or manual."
    for name, val in (("max_price", max_price), ("min_price", min_price)):
        if val is not None and not 0 < val <= 1_000_000:
            return f"ERROR: {name} must be a positive dollar amount."
    limit = max(1, min(int(limit or 5), 8))
    mk = logic.norm_make(make)
    order = {"price_asc": "price ASC", "price_desc": "price DESC", "newest": "year DESC, price ASC",
             "lowest_mileage": "mileage ASC"}[sort]

    async def run(maxp, miny, bt):
        where, args = ["status='available'"], []
        if bt:
            where.append("body_type=%s"); args.append(bt)
        if fl:
            where.append("fuel=%s"); args.append(fl)
        if tr:
            where.append("transmission=%s"); args.append(tr)
        if mk:
            where.append("(make ILIKE %s OR make ILIKE %s)"); args += [mk, f"%{mk}%"]
        if model:
            where.append("model ILIKE %s"); args.append(f"%{model.strip()}%")
        if maxp:
            where.append("price<=%s"); args.append(int(maxp))
        if min_price:
            where.append("price>=%s"); args.append(int(min_price))
        if min_seats:
            where.append("seats>=%s"); args.append(int(min_seats))
        if miny:
            where.append("year>=%s"); args.append(int(miny))
        if max_mileage:
            where.append("mileage<=%s"); args.append(int(max_mileage))
        sql = f"SELECT * FROM vehicles WHERE {' AND '.join(where)} ORDER BY {order}"
        return await db.fetch(sql, *args)

    rows = await run(max_price, min_year, body)
    if rows:
        out = [f"Found {len(rows)} car{'s' if len(rows) != 1 else ''} (showing {min(len(rows), limit)}):"]
        out += [_line(v) for v in rows[:limit]]
        return _cap("\n".join(out))

    # Loosen: price +15% -> +30% -> drop min_year -> drop body_type. Never drop seats/fuel (hard needs).
    steps = []
    if max_price:
        steps += [(int(max_price * 1.15), min_year, body, "over your budget"),
                  (int(max_price * 1.30), min_year, body, "over your budget")]
    lp = int(max_price * 1.30) if max_price else None
    if min_year:
        steps.append((lp, None, body, "older than requested"))
    if body:
        steps.append((lp, None, None, "a different body type"))
    for maxp, miny, bt, why in steps:
        rows = await run(maxp, miny, bt)
        if rows:
            out = [f"No exact matches. Closest options ({why}):"] + [_line(v) for v in rows[:3]]
            return _cap("\n".join(out))
    return "No cars match. Try a higher budget or fewer filters."


# ---------------------------------------------------------------- T2
@tool
async def get_vehicle_details(vehicle_id: Annotated[str, "Car ID, e.g. APX-104"], runtime: Rt) -> str:
    """Get full details for ONE car by its ID (e.g. APX-104): specs, features, mileage, MPG, availability
    status. Use when the buyer asks about a specific car or whether it is available."""
    vid = logic.normalize_vehicle_id(vehicle_id)
    v = await _vehicle(vid) if vid else None
    if not v:
        return f"ERROR: No car with ID {vehicle_id}. Use search_inventory to find cars."
    try:
        await memory.add_viewed(runtime.store, _uid(runtime), v["id"])
    except Exception:  # memory is best-effort here
        log.warning("add_viewed failed", exc_info=True)
    fin = logic.financing_summary(v["price"], round(v["price"] * 0.10), 60, config.DEFAULT_APR)
    status = {"available": "AVAILABLE", "reserved": "RESERVED by another buyer (not available for test drives)",
              "sold": "SOLD (no longer available)"}[v["status"]]
    lines = [
        f"{v['id']}: {_title(v)} ({v['body_type']}, {v['color']})",
        f"Price: {logic.fmt_money(v['price'])} (est. {logic.fmt_money(fin['monthly'])}/mo with 10% down, 60 mo, {config.DEFAULT_APR}% APR)",
        f"Mileage: {v['mileage']:,} mi | Fuel: {v['fuel']} ({v['mpg'] or 'n/a'}) | {v['transmission']} | {v['seats']} seats",
        f"Features: {', '.join(v['features'])}",
        f"About: {v['description']}",
        f"Status: {status}",
    ]
    if v["status"] == "available":
        lines.append("Test drives: Mon-Sat 10:00-17:00 on the hour.")
    return _cap("\n".join(lines))


# ---------------------------------------------------------------- T3
@tool
async def compare_vehicles(vehicle_ids: Annotated[list[str], "2 or 3 car IDs"], runtime: Rt) -> str:
    """Compare 2-3 cars side by side by their IDs. Use when the buyer asks which is better or wants a comparison."""
    if not 2 <= len(vehicle_ids) <= 3:
        return "ERROR: give 2 or 3 vehicle IDs to compare."
    cars = []
    for raw in vehicle_ids:
        vid = logic.normalize_vehicle_id(raw)
        v = await _vehicle(vid) if vid else None
        if not v:
            return f"ERROR: No car with ID {raw}. Use search_inventory to find IDs."
        cars.append(v)
    out = []
    for v in cars:
        out.append(f"{v['id']} {_title(v)}: {logic.fmt_money(v['price'])} | {v['mileage']:,} mi | {v['fuel']} "
                   f"({v['mpg'] or 'n/a'}) | {v['seats']} seats | {v['transmission']} | {v['status']} | "
                   f"key: {', '.join(v['features'][:3])}")
    cheapest = min(cars, key=lambda c: c["price"])["id"]
    low_mi = min(cars, key=lambda c: c["mileage"])["id"]
    seats = max(cars, key=lambda c: c["seats"])
    newest = max(cars, key=lambda c: c["year"])["id"]
    out.append(f"Cheapest: {cheapest}; lowest mileage: {low_mi}; newest: {newest}; most seats: {seats['id']} ({seats['seats']}).")
    return _cap("\n".join(out))


# ---------------------------------------------------------------- T4
@tool
async def estimate_financing(
    runtime: Rt,
    vehicle_id: Annotated[str | None, "Car ID; its price is looked up"] = None,
    price: Annotated[int | None, "Price in USD if no vehicle_id"] = None,
    down_payment: Annotated[int | None, "Down payment in USD (default 10% of price)"] = None,
    term_months: Annotated[int, "24, 36, 48, 60, 72 or 84"] = 60,
    apr: Annotated[float, "Annual percentage rate, default 7.9"] = config.DEFAULT_APR,
) -> str:
    """Estimate a monthly car payment. Use for questions about monthly payments, loans, down payment,
    APR or loan term. Give either vehicle_id or price."""
    label = ""
    if vehicle_id:
        vid = logic.normalize_vehicle_id(vehicle_id)
        v = await _vehicle(vid) if vid else None
        if not v:
            return f"ERROR: No car with ID {vehicle_id}. Use search_inventory to find cars."
        price = v["price"]
        label = f"{v['id']} {_title(v)} ({logic.fmt_money(price)})"
    if not price:
        return "ERROR: give a vehicle_id or a price."
    if price <= 0:
        return "ERROR: price must be positive."
    label = label or logic.fmt_money(price)
    down = round(price * 0.10) if down_payment is None else int(down_payment)
    if down < 0 or down >= price:
        return f"ERROR: down_payment must be at least 0 and less than the price ({logic.fmt_money(price)})."
    if not 0 <= apr <= 30:
        return "ERROR: apr must be between 0 and 30."
    term = logic.snap_term(int(term_months or 60))
    note = f" (term {term_months} isn't offered; used {term})" if term != term_months else ""
    f = logic.financing_summary(price, down, term, apr)
    return (f"{label}: {logic.fmt_money(down)} down, {term} months at {apr:g}% APR -> about "
            f"{logic.fmt_money(f['monthly'])}/month{note}. Total interest ~ {logic.fmt_money(f['interest'])}. "
            "Estimate only; excludes tax/fees; APR depends on credit.")


# ---------------------------------------------------------------- T5
@tool
async def estimate_trade_in(
    make: str, model: str,
    year: Annotated[int, "Model year"],
    mileage: Annotated[int, "Odometer miles"],
    runtime: Rt,
    condition: Literal["excellent", "good", "fair", "poor"] = "good",
) -> str:
    """Estimate the trade-in value of the buyer's CURRENT car. Use when they mention trading in or selling their car."""
    cy = _now(runtime).year
    if not 1990 <= year <= cy + 1:
        return f"ERROR: year must be between 1990 and {cy + 1}."
    if mileage < 0 or mileage > 1_000_000:
        return "ERROR: mileage must be between 0 and 1,000,000."
    lo, hi = logic.trade_in_estimate(make, model, year, mileage, condition, cy)
    desc = f"{year} {make.strip().title()} {model.strip()}, {mileage:,} mi, {condition}"
    try:
        p = await memory.merge_profile(runtime.store, _uid(runtime), {"trade_in": desc[:120]})
        await memory.sync_lead(_uid(runtime), p)
    except Exception:
        log.warning("trade-in profile save failed", exc_info=True)
    return (f"Estimated trade-in for a {desc}: {logic.fmt_money(lo)}-{logic.fmt_money(hi)}. "
            "Final offer after a 20-minute inspection at the dealership.")


# ---------------------------------------------------------------- T6
async def _free_slots(vid: str, d: date, now: datetime) -> list[datetime]:
    slots = logic.bookable_slots(d, now)
    if not slots:
        return []
    taken = await db.fetch(
        "SELECT slot FROM bookings WHERE vehicle_id=%s AND status='confirmed' AND slot >= %s AND slot <= %s",
        vid, slots[0], slots[-1])
    taken_set = {r["slot"] for r in taken}
    return [s for s in slots if s not in taken_set]


async def _next_days(vid: str, now: datetime, n_days: int = 3, per_day: int = 4, start: date | None = None) -> str:
    d = start or now.date()
    _, last = logic.window(now)
    parts = []
    while d <= last and len(parts) < n_days:
        free = await _free_slots(vid, d, now)
        if free:
            parts.append(f"{logic.fmt_day(d)}: " + ", ".join(s.strftime("%H:%M") for s in free[:per_day]))
        d += timedelta(days=1)
    return " | ".join(parts) if parts else "no free slots in the next 14 days"


@tool
async def check_test_drive_slots(
    vehicle_id: Annotated[str, "Car ID, e.g. APX-104"],
    runtime: Rt,
    date: Annotated[str | None, "YYYY-MM-DD in dealer time; omit for the next available days"] = None,
) -> str:
    """List free test-drive slots for a car. Use before booking, or when the buyer asks when they can come in."""
    vid = logic.normalize_vehicle_id(vehicle_id)
    v = await _vehicle(vid) if vid else None
    if not v:
        return f"ERROR: No car with ID {vehicle_id}. Use search_inventory to find cars."
    if v["status"] != "available":
        sim = await _similar(v)
        return (f"ERROR: {v['id']} is {v['status']} and can't be test driven. Similar available cars: "
                + "; ".join(_line(s) for s in sim))
    now = _now(runtime)
    if date:
        try:
            d = datetime.strptime(date.strip(), "%Y-%m-%d").date()
        except ValueError:
            return "ERROR: date must be YYYY-MM-DD."
        _, last = logic.window(now)
        reason = None
        if d < now.date():
            reason = "that date is in the past"
        elif not logic.is_open_day(d):
            reason = "we're closed on Sundays"
        elif d > last:
            reason = f"bookings open only {config.BOOKING_WINDOW_DAYS} days ahead"
        if not reason:
            free = await _free_slots(vid, d, now)
            if free:
                return (f"Free slots for {v['id']} ({_title(v)}) on {logic.fmt_day(d)} (dealer time): "
                        + ", ".join(s.strftime("%H:%M") for s in free))
            reason = "no free slots left that day"
        return f"No slots on {date}: {reason}. Next available for {v['id']}: {await _next_days(vid, now)}"
    return f"Free slots for {v['id']} ({_title(v)}, dealer time): {await _next_days(vid, now)}"


# ---------------------------------------------------------------- T7
@tool
async def book_test_drive(
    vehicle_id: Annotated[str, "Car ID, e.g. APX-104"],
    slot: Annotated[str, "'YYYY-MM-DD HH:MM' in dealer time, on the hour"],
    runtime: Rt,
    contact_name: Annotated[str | None, "Buyer's name"] = None,
    phone: Annotated[str | None, "Buyer's phone (optional)"] = None,
) -> str:
    """Book a test drive. Needs vehicle_id, slot and the buyer's name. Check free slots first. The system
    automatically asks the buyer to confirm before it runs, so just call it."""
    uid, now = _uid(runtime), _now(runtime)
    vid = logic.normalize_vehicle_id(vehicle_id)
    v = await _vehicle(vid) if vid else None
    if not v:
        return f"ERROR: No car with ID {vehicle_id}. Use search_inventory to find cars."
    if v["status"] != "available":
        sim = await _similar(v)
        return f"ERROR: {v['id']} is {v['status']}. Similar available cars: " + "; ".join(_line(s) for s in sim)
    dt = logic.parse_slot(slot)
    if not dt:
        return "ERROR: slot must be 'YYYY-MM-DD HH:MM' in dealer time, e.g. '2026-11-25 11:00'."
    problem = logic.slot_problem(dt, now)
    if problem:
        return f"ERROR: can't book {slot}: {problem}. Next free slots: {await _next_days(vid, now)}"
    profile = await memory.get_profile(runtime.store, uid)
    name = (contact_name or "").strip() or profile.get("name")
    if not name:
        return "ERROR: ask the buyer's name first."
    if len(name) > 80:
        return "ERROR: name is too long."
    ph = logic.clean_phone(phone) if phone else profile.get("phone")
    phone_note = ""
    if ph is False:
        ph, phone_note = profile.get("phone"), " (the phone number given looked invalid, so it wasn't saved)"
    upcoming = await db.fetchval(
        "SELECT count(*) FROM bookings WHERE user_id=%s AND status='confirmed' AND slot > now()", uid)
    if upcoming >= config.MAX_UPCOMING_BOOKINGS:
        return f"ERROR: the buyer already has {upcoming} upcoming test drives (max {config.MAX_UPCOMING_BOOKINGS}). Offer to cancel one first."
    clash = await db.fetchrow(
        "SELECT id, vehicle_id FROM bookings WHERE user_id=%s AND slot=%s AND status='confirmed'", uid, dt)
    if clash:
        return f"ERROR: the buyer already has test drive TD-{clash['id']} ({clash['vehicle_id']}) at that time. Pick another slot."
    try:
        row = await db.fetchrow(
            """INSERT INTO bookings (user_id, vehicle_id, slot, contact_name, phone)
               VALUES (%s,%s,%s,%s,%s) RETURNING id""", uid, vid, dt, name, ph or None)
    except psycopg.errors.UniqueViolation:
        free = await _free_slots(vid, dt.date(), now)
        others = ", ".join(s.strftime("%H:%M") for s in free) or "none that day"
        return f"ERROR: That slot was just taken. Free slots that day: {others}."
    p = await memory.merge_profile(runtime.store, uid, {"name": name, "phone": ph or None})
    await memory.sync_lead(uid, p)
    return (f"Booked: TD-{row['id']}: {_title(v)} ({vid}), {logic.fmt_slot(dt)}, for {name}.{phone_note} "
            f"Bring your driving licence. Address: {config.DEALER_ADDRESS}.")


# ---------------------------------------------------------------- T8
@tool
async def cancel_test_drive(
    booking_id: Annotated[str, "Booking ID, e.g. TD-1004"],
    runtime: Rt,
    reason: Annotated[str | None, "Optional reason"] = None,
) -> str:
    """Cancel one of the buyer's OWN upcoming test drives by booking ID (e.g. TD-1004). Use my_test_drives
    first if the ID is unknown. The system asks the buyer to confirm automatically."""
    uid = _uid(runtime)
    bid = logic.normalize_booking_id(booking_id)
    row = None
    if bid:
        row = await db.fetchrow(
            """UPDATE bookings SET status='cancelled', cancel_reason=%s, updated_at=now()
               WHERE id=%s AND user_id=%s AND status='confirmed' AND slot > now()
               RETURNING id, vehicle_id, slot""", (reason or "")[:200] or None, bid, uid)
    if not row:
        return f"ERROR: No upcoming test drive {booking_id} on your account."
    await memory.sync_lead(uid, store=runtime.store)
    return f"Cancelled TD-{row['id']} ({row['vehicle_id']}, {logic.fmt_slot(row['slot'])})."


# ---------------------------------------------------------------- T9
@tool
async def my_test_drives(runtime: Rt) -> str:
    """List the buyer's OWN test drives (upcoming first, plus the last 3 past ones). Use when they ask about
    their bookings or appointments."""
    uid = _uid(runtime)
    rows = await db.fetch(
        """SELECT b.id, b.vehicle_id, b.slot, b.status, v.year, v.make, v.model, v.trim
           FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.user_id=%s ORDER BY b.slot""", uid)
    if not rows:
        return "You have no test drives booked."
    nowu = datetime.now(config.DEALER_TZ)
    up = [r for r in rows if r["slot"] > nowu and r["status"] == "confirmed"]
    past = [r for r in rows if r not in up][-3:]
    fmt = lambda r: f"TD-{r['id']} | {r['vehicle_id']} {_title(r)} | {logic.fmt_slot(r['slot'])} | {r['status']}"
    out = ["Upcoming: " + ("; ".join(fmt(r) for r in up) if up else "none")]
    if past:
        out.append("Past/cancelled: " + "; ".join(fmt(r) for r in past))
    return _cap("\n".join(out))


# ---------------------------------------------------------------- T10
@tool
async def save_buyer_profile(
    runtime: Rt,
    name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    budget_max: Annotated[int | None, "Maximum budget in USD"] = None,
    body_type: Annotated[str | None, "sedan, suv, hatchback, pickup, minivan or coupe"] = None,
    fuel: Annotated[str | None, "gasoline, hybrid, electric, diesel or any"] = None,
    min_seats: int | None = None,
    timeline: Literal["asap", "this_month", "1_3_months", "3_plus_months", "just_browsing"] | None = None,
    financing: Literal["cash", "finance", "lease", "undecided"] | None = None,
    trade_in: Annotated[str | None, "Their current car, e.g. '2015 Corolla, 90k mi'"] = None,
    note: Annotated[str | None, "Short lasting fact, e.g. 'has 3 kids'"] = None,
) -> str:
    """Save lasting facts about the buyer for future conversations: name, phone, email, budget, preferred
    body type/fuel, seats needed, timeline, cash/finance/lease, trade-in, or a short note (family size, use
    case). Call it as soon as the buyer shares any of these. Only save what the buyer actually said."""
    uid = _uid(runtime)
    upd, saved, errors = {}, [], []
    if name:
        if 1 <= len(name.strip()) <= 80:
            upd["name"] = name.strip(); saved.append(f"name {name.strip()}")
        else:
            errors.append("name must be 1-80 characters")
    if phone:
        p = logic.clean_phone(phone)
        if p:
            upd["phone"] = p; saved.append("phone")
        else:
            errors.append("phone must have 7-15 digits")
    if email:
        if logic.EMAIL_RE.match(email.strip()):
            upd["email"] = email.strip(); saved.append("email")
        else:
            errors.append("email looks invalid")
    if budget_max is not None:
        if 1000 <= budget_max <= 500_000:
            upd["budget_max"] = int(budget_max); saved.append(f"budget {logic.fmt_money(budget_max)}")
        else:
            errors.append("budget_max must be between 1,000 and 500,000")
    if body_type:
        b = logic.norm_body(body_type)
        if b:
            upd["body_type"] = b; saved.append(b)
        else:
            errors.append(f"body_type must be one of {', '.join(logic.BODY_TYPES)}")
    if fuel:
        if fuel.strip().lower() == "any":
            upd["fuel"] = "any"; saved.append("any fuel")
        else:
            f = logic.norm_fuel(fuel)
            if f:
                upd["fuel"] = f; saved.append(f)
            else:
                errors.append("fuel must be gasoline, hybrid, electric, diesel or any")
    if min_seats is not None:
        if 2 <= min_seats <= 9:
            upd["min_seats"] = int(min_seats); saved.append(f"{min_seats}+ seats")
        else:
            errors.append("min_seats must be 2-9")
    if timeline:
        upd["timeline"] = timeline; saved.append(f"timeline {timeline.replace('_', ' ')}")
    if financing:
        upd["financing"] = financing; saved.append(financing)
    if trade_in:
        upd["trade_in"] = trade_in.strip()[:120]; saved.append("trade-in")
    if upd:
        p = await memory.merge_profile(runtime.store, uid, upd)
        await memory.sync_lead(uid, p)
    if note:
        n = note.strip()[:200]
        if is_injection(n) or "<" in n:
            log.warning("blocked memory note for %s", uid)
            errors.append("note not saved (it looked like an instruction, not a fact about the buyer)")
        elif n:
            if await memory.add_note(runtime.store, uid, n):
                saved.append("note")
    msg = ("Saved: " + ", ".join(saved) + ".") if saved else "Nothing saved."
    if errors:
        msg += " Not saved: " + "; ".join(errors) + "."
    return msg


# ---------------------------------------------------------------- T11
@tool
async def dealer_info(
    topic: Literal["hours", "location", "warranty", "returns", "documents", "financing_partners",
                   "trade_in_process", "test_drive_rules"],
    runtime: Rt,
) -> str:
    """Answer questions about Apex Motors: opening hours, location/address, warranty, returns, required
    documents, financing partners, trade-in process, test drive rules."""
    row = await db.fetchrow("SELECT answer FROM dealer_policies WHERE topic=%s", topic)
    return row["answer"] if row else "ERROR: unknown topic."


# ---------------------------------------------------------------- T12
@tool
async def request_callback(
    reason: Annotated[str, "Why the buyer wants a human, e.g. 'wants a discount on APX-124'"],
    runtime: Rt,
    preferred_time: Annotated[str | None, "e.g. 'tomorrow afternoon'"] = None,
    contact: Annotated[str | None, "Phone or email"] = None,
) -> str:
    """Ask a human sales manager to contact the buyer. Use for price negotiation or discount requests,
    special requests, complaints, or when the buyer asks for a person. Needs a phone or email."""
    uid = _uid(runtime)
    profile = await memory.get_profile(runtime.store, uid)
    c = (contact or "").strip()
    if c:
        if logic.EMAIL_RE.match(c):
            await memory.merge_profile(runtime.store, uid, {"email": c})
        elif logic.clean_phone(c):
            await memory.merge_profile(runtime.store, uid, {"phone": c})
        else:
            return "ERROR: contact must be a phone number (7-15 digits) or an email address."
    else:
        c = profile.get("phone") or profile.get("email") or ""
    if not c:
        return "ERROR: ask the buyer for a phone number or email first."
    open_rows = await db.fetch("SELECT id FROM callbacks WHERE user_id=%s AND status='open' ORDER BY id", uid)
    if len(open_rows) >= 3:
        return f"A callback is already requested (CB-{open_rows[-1]['id']}); a sales manager will be in touch."
    row = await db.fetchrow(
        "INSERT INTO callbacks (user_id, reason, preferred_time, contact) VALUES (%s,%s,%s,%s) RETURNING id",
        uid, reason.strip()[:300], (preferred_time or "")[:100] or None, c)
    await memory.sync_lead(uid, store=runtime.store)
    pt = f" (preferred: {preferred_time})" if preferred_time else ""
    return f"Callback requested CB-{row['id']}: a sales manager will contact you at {c}{pt}."


# ---------------------------------------------------------------- T13
@tool
async def forget_me(runtime: Rt) -> str:
    """Delete everything remembered about the buyer (profile, notes, recently viewed). Only when they
    explicitly ask to be forgotten or to delete their data. The system asks them to confirm automatically."""
    n = await memory.forget(runtime.store, _uid(runtime))
    return f"Done. Deleted {n} saved memory item(s): preferences, notes and recently viewed cars. Test-drive bookings are unchanged."


TOOLS = [search_inventory, get_vehicle_details, compare_vehicles, estimate_financing, estimate_trade_in,
         check_test_drive_slots, book_test_drive, cancel_test_drive, my_test_drives, save_buyer_profile,
         dealer_info, request_callback, forget_me]
RISKY_TOOLS = ("book_test_drive", "cancel_test_drive", "forget_me")
