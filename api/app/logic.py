"""Pure, deterministic business logic (no DB, no LLM). Unit tested in tests/test_logic.py."""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta

from . import config

# ---------- formatting ----------

def fmt_money(n: float | int) -> str:
    return f"${round(n):,}"


def fmt_slot(dt: datetime) -> str:
    """Dealer-local 'Wed 25 Nov 11:00'."""
    d = dt.astimezone(config.DEALER_TZ)
    return d.strftime("%a %d %b %H:%M")


def fmt_day(d: date) -> str:
    return d.strftime("%a %d %b")


# ---------- IDs ----------

_VEH_RE = re.compile(r"^\s*(?:apx)?\s*[-_ ]?\s*(\d{3})\s*$", re.I)
_TD_RE = re.compile(r"^\s*(?:td)?\s*[-_ #]?\s*(\d{3,6})\s*$", re.I)
_CB_RE = re.compile(r"^\s*(?:cb)?\s*[-_ #]?\s*(\d{3,6})\s*$", re.I)


def normalize_vehicle_id(raw: str | int | None) -> str | None:
    """'apx104', 'APX 104', '104', 'APX-104' -> 'APX-104'; otherwise None."""
    if raw is None:
        return None
    m = _VEH_RE.match(str(raw))
    return f"APX-{m.group(1)}" if m else None


def normalize_booking_id(raw: str | int | None) -> int | None:
    if raw is None:
        return None
    m = _TD_RE.match(str(raw))
    return int(m.group(1)) if m else None


# ---------- normalisation of search terms ----------

BODY_TYPES = ("sedan", "suv", "hatchback", "pickup", "minivan", "coupe")
FUELS = ("gasoline", "hybrid", "electric", "diesel")
_BODY_SYN = {
    "suv": "suv", "suvs": "suv", "crossover": "suv", "crossovers": "suv", "4x4": "suv",
    "truck": "pickup", "trucks": "pickup", "pickup": "pickup", "pickups": "pickup", "pick-up": "pickup", "ute": "pickup",
    "van": "minivan", "minivan": "minivan", "minivans": "minivan", "mpv": "minivan",
    "sedan": "sedan", "sedans": "sedan", "saloon": "sedan",
    "hatchback": "hatchback", "hatchbacks": "hatchback", "hatch": "hatchback",
    "coupe": "coupe", "coupes": "coupe", "sports car": "coupe", "sport": "coupe", "sports": "coupe",
}
_FUEL_SYN = {
    "ev": "electric", "electric": "electric", "bev": "electric",
    "hybrid": "hybrid", "hev": "hybrid", "phev": "hybrid", "plug-in hybrid": "hybrid",
    "gas": "gasoline", "gasoline": "gasoline", "petrol": "gasoline",
    "diesel": "diesel",
}
_MAKE_SYN = {"chevy": "Chevrolet", "vw": "Volkswagen", "merc": "Mercedes-Benz", "mercedes": "Mercedes-Benz",
             "benz": "Mercedes-Benz", "mercedes benz": "Mercedes-Benz"}


def norm_body(v: str | None) -> str | None | bool:
    """Returns canonical body type, None if not given, False if unknown."""
    if not v:
        return None
    return _BODY_SYN.get(v.strip().lower(), False)


def norm_fuel(v: str | None) -> str | None | bool:
    if not v or v.strip().lower() in ("any", "no preference"):
        return None
    return _FUEL_SYN.get(v.strip().lower(), False)


def norm_make(v: str | None) -> str | None:
    if not v:
        return None
    return _MAKE_SYN.get(v.strip().lower(), v.strip())


def norm_transmission(v: str | None) -> str | None | bool:
    if not v:
        return None
    v = v.strip().lower()
    if v in ("auto", "automatic", "at"):
        return "automatic"
    if v in ("manual", "stick", "stick shift", "mt"):
        return "manual"
    return False


def clean_phone(raw: str | None) -> str | None | bool:
    """Returns a normalised phone, None if empty, False if invalid."""
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    digits = re.sub(r"[\s+\-().]", "", s)
    if not digits.isdigit() or not 7 <= len(digits) <= 15:
        return False
    return s


EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$", re.I)

# ---------- financing ----------

TERMS = (24, 36, 48, 60, 72, 84)


def snap_term(term: int) -> int:
    return min(TERMS, key=lambda t: (abs(t - term), t))


def monthly_payment(price: float, down: float, term: int, apr: float) -> float:
    principal = price - down
    if principal <= 0:
        return 0.0
    if apr == 0:
        return principal / term
    r = apr / 1200
    return principal * r / (1 - (1 + r) ** -term)


def financing_summary(price: int, down: int, term: int, apr: float) -> dict:
    pay = monthly_payment(price, down, term, apr)
    principal = price - down
    total_interest = pay * term - principal
    return {"monthly": round(pay), "interest": round(total_interest), "total_paid": round(pay * term + down),
            "principal": principal}


# ---------- trade-in ----------

PREMIUM_MAKES = {"bmw", "mercedes-benz", "mercedes", "audi", "lexus", "tesla", "porsche", "volvo", "land rover", "jaguar", "genesis", "acura", "infiniti"}
TRUCK_HINTS = ("f-150", "f150", "silverado", "ram", "tacoma", "tundra", "ranger", "colorado", "frontier", "hilux", "maverick", "sierra")
CONDITION_MULT = {"excellent": 1.0, "good": 0.92, "fair": 0.80, "poor": 0.62}
ECONOMY_MAKES = {"toyota", "honda", "hyundai", "kia", "mazda", "chevrolet", "chevy", "ford", "volkswagen", "vw", "nissan", "subaru", "suzuki"}


def trade_in_estimate(make: str, model: str, year: int, mileage: int, condition: str, current_year: int) -> tuple[int, int]:
    mk = make.strip().lower()
    if mk in PREMIUM_MAKES:
        base = 45000
    elif mk in ECONOMY_MAKES:
        base = 24000
    else:
        base = 26000
    if any(h in model.strip().lower() for h in TRUCK_HINTS):
        base += 8000
    age = max(0, current_year - year)
    value = base * 0.85 if age == 0 else base * 0.80 * (0.85 ** (age - 1))
    expected = 12000 * max(age, 1)
    diff = mileage - expected
    if diff > 0:
        value -= 0.06 * diff
    else:
        value += min(0.03 * (-diff), 0.10 * value)
    value *= CONDITION_MULT.get(condition, 0.92)
    value = max(value, 800)
    lo = max(800, int(round(value * 0.92 / 100.0)) * 100)
    hi = max(lo + 100, int(round(value * 1.08 / 100.0)) * 100)
    return lo, hi


# ---------- test-drive slots ----------

def is_open_day(d: date) -> bool:
    return d.weekday() < 6  # Mon-Sat


def day_slots(d: date) -> list[datetime]:
    if not is_open_day(d):
        return []
    return [datetime(d.year, d.month, d.day, h, 0, tzinfo=config.DEALER_TZ)
            for h in range(config.OPEN_HOUR, config.LAST_SLOT_HOUR + 1)]


def window(now: datetime) -> tuple[datetime, date]:
    """Earliest bookable instant and last bookable date."""
    now = now.astimezone(config.DEALER_TZ)
    return now + timedelta(hours=1), (now + timedelta(days=config.BOOKING_WINDOW_DAYS)).date()


def bookable_slots(d: date, now: datetime) -> list[datetime]:
    earliest, last_day = window(now)
    if d > last_day:
        return []
    return [s for s in day_slots(d) if s >= earliest]


_SLOT_RE = re.compile(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*$")


def parse_slot(raw: str) -> datetime | None:
    m = _SLOT_RE.match(raw or "")
    if not m:
        return None
    y, mo, d, h, mi = map(int, m.groups())
    try:
        return datetime(y, mo, d, h, mi, tzinfo=config.DEALER_TZ)
    except ValueError:
        return None


def slot_problem(slot: datetime, now: datetime) -> str | None:
    """None if the slot is a valid bookable opening slot, else a human-readable reason."""
    earliest, last_day = window(now)
    local = slot.astimezone(config.DEALER_TZ)
    if local.minute != 0:
        return "test drives start on the hour"
    if not is_open_day(local.date()):
        return "we're closed on Sundays"
    if not config.OPEN_HOUR <= local.hour <= config.LAST_SLOT_HOUR:
        return "test drives run 10:00-17:00 (last slot 17:00)"
    if local < earliest:
        return "that time has passed or is less than 1 hour away"
    if local.date() > last_day:
        return f"bookings open only {config.BOOKING_WINDOW_DAYS} days ahead"
    return None


# ---------- lead score ----------

def lead_score(profile: dict, has_upcoming_booking: bool) -> int:
    s = 0
    if profile.get("budget_max"):
        s += 25
    if profile.get("timeline") and profile.get("timeline") != "just_browsing":
        s += 20
    if profile.get("financing"):
        s += 15
    if profile.get("body_type") or profile.get("min_seats"):
        s += 15
    if profile.get("name") and (profile.get("phone") or profile.get("email")):
        s += 15
    if has_upcoming_booking:
        s += 10
    return min(s, 100)


def lead_stage(current: str | None, score: int, message_count: int, has_upcoming_booking: bool) -> str:
    if current in ("won", "lost"):
        return current
    if has_upcoming_booking:
        return "visit_booked"
    if score >= 60:
        return "qualified"
    if message_count >= 1:
        return "engaged"
    return "new"


def score_breakdown(profile: dict, has_upcoming_booking: bool) -> list[tuple[str, int, bool]]:
    return [
        ("Budget known", 25, bool(profile.get("budget_max"))),
        ("Timeline given", 20, bool(profile.get("timeline") and profile.get("timeline") != "just_browsing")),
        ("Financing preference", 15, bool(profile.get("financing"))),
        ("Needs known (body/seats)", 15, bool(profile.get("body_type") or profile.get("min_seats"))),
        ("Contact details", 15, bool(profile.get("name") and (profile.get("phone") or profile.get("email")))),
        ("Upcoming test drive", 10, has_upcoming_booking),
    ]


def ceil_div(a: int, b: int) -> int:
    return -(-a // b)


__all__ = [n for n in dir() if not n.startswith("_")] + ["math"]
