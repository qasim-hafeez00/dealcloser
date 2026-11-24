"""Long-term memory: LangGraph Postgres store, namespace ("buyer", user_id).

Keys: "profile" (merged dict), "note:<uuid>" (max 10), "viewed" (last 5 vehicle ids).
Plus helpers that mirror the profile into the `leads` CRM row and recompute score/stage.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from langgraph.store.base import BaseStore

from . import db, logic

PROFILE_FIELDS = ("name", "phone", "email", "budget_max", "body_type", "fuel", "min_seats",
                  "timeline", "financing", "trade_in")
MAX_NOTES = 10


def ns(user_id: str) -> tuple[str, str]:
    return ("buyer", user_id)


async def get_profile(store: BaseStore, user_id: str) -> dict:
    item = await store.aget(ns(user_id), "profile")
    return dict(item.value) if item else {}


async def merge_profile(store: BaseStore, user_id: str, updates: dict) -> dict:
    profile = await get_profile(store, user_id)
    for k, v in updates.items():
        if v is not None and k in PROFILE_FIELDS:
            profile[k] = v
    profile["updated_at"] = datetime.now(timezone.utc).isoformat()
    await store.aput(ns(user_id), "profile", profile)
    return profile


async def get_notes(store: BaseStore, user_id: str) -> list[dict]:
    items = await store.asearch(ns(user_id), limit=50)
    notes = [{"key": i.key, **i.value} for i in items if i.key.startswith("note:")]
    notes.sort(key=lambda n: n.get("created_at", ""))
    return notes


async def add_note(store: BaseStore, user_id: str, text: str) -> bool:
    """Returns False if it was a duplicate."""
    notes = await get_notes(store, user_id)
    if any(n.get("text", "").strip().lower() == text.strip().lower() for n in notes):
        return False
    while len(notes) >= MAX_NOTES:
        oldest = notes.pop(0)
        await store.adelete(ns(user_id), oldest["key"])
    await store.aput(ns(user_id), f"note:{uuid.uuid4().hex[:12]}",
                     {"text": text.strip(), "created_at": datetime.now(timezone.utc).isoformat()})
    return True


async def get_viewed(store: BaseStore, user_id: str) -> list[str]:
    item = await store.aget(ns(user_id), "viewed")
    return list(item.value.get("ids", [])) if item else []


async def add_viewed(store: BaseStore, user_id: str, vehicle_id: str) -> None:
    ids = [v for v in await get_viewed(store, user_id) if v != vehicle_id]
    ids.insert(0, vehicle_id)
    await store.aput(ns(user_id), "viewed", {"ids": ids[:5]})


async def forget(store: BaseStore, user_id: str) -> int:
    items = await store.asearch(ns(user_id), limit=100)
    for i in items:
        await store.adelete(ns(user_id), i.key)
    await db.execute(
        """UPDATE leads SET name=NULL, phone=NULL, email=NULL, budget_max=NULL, body_type=NULL, fuel=NULL,
           min_seats=NULL, timeline=NULL, financing=NULL, trade_in=NULL, updated_at=now() WHERE user_id=%s""",
        user_id,
    )
    return len(items)


# ---------- CRM mirror ----------

async def ensure_lead(user_id: str) -> None:
    await db.execute("INSERT INTO leads (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING", user_id)


async def has_upcoming_booking(user_id: str) -> bool:
    return bool(await db.fetchval(
        "SELECT EXISTS(SELECT 1 FROM bookings WHERE user_id=%s AND status='confirmed' AND slot > now())", user_id))


async def sync_lead(user_id: str, profile: dict | None = None, *, store: BaseStore | None = None,
                    bump_message: bool = False, blocked: bool = False) -> None:
    """Mirror profile -> leads row and recompute score/stage. Deterministic, no LLM."""
    await ensure_lead(user_id)
    if profile is None and store is not None:
        profile = await get_profile(store, user_id)
    profile = profile or {}
    upcoming = await has_upcoming_booking(user_id)
    row = await db.fetchrow("SELECT stage, message_count FROM leads WHERE user_id=%s", user_id)
    msg_count = (row["message_count"] if row else 0) + (1 if bump_message else 0)
    score = logic.lead_score(profile, upcoming)
    stage = logic.lead_stage(row["stage"] if row else None, score, msg_count, upcoming)
    fuel = profile.get("fuel")
    await db.execute(
        """UPDATE leads SET
             name=COALESCE(%s,name), phone=COALESCE(%s,phone), email=COALESCE(%s,email),
             budget_max=COALESCE(%s,budget_max), body_type=COALESCE(%s,body_type), fuel=COALESCE(%s,fuel),
             min_seats=COALESCE(%s,min_seats), timeline=COALESCE(%s,timeline), financing=COALESCE(%s,financing),
             trade_in=COALESCE(%s,trade_in),
             score=%s, stage=%s,
             message_count=message_count + %s,
             blocked_count=blocked_count + %s,
             last_message_at=CASE WHEN %s THEN now() ELSE last_message_at END,
             updated_at=now()
           WHERE user_id=%s""",
        profile.get("name"), profile.get("phone"), profile.get("email"), profile.get("budget_max"),
        profile.get("body_type"), fuel if fuel not in (None, "any") else None, profile.get("min_seats"),
        profile.get("timeline"), profile.get("financing"), profile.get("trade_in"),
        score, stage, 1 if bump_message else 0, 1 if blocked else 0, bump_message, user_id,
    )


def memory_block(profile: dict, notes: list[dict], viewed: list[tuple[str, str]], upcoming: list[str]) -> str:
    if not (profile or notes or viewed or upcoming):
        return "<buyer_memory>new buyer: nothing known yet</buyer_memory>"
    parts = []
    labels = [("name", "name"), ("phone", "phone"), ("email", "email"), ("budget_max", "budget_max"),
              ("body_type", "body"), ("min_seats", "min_seats"), ("fuel", "fuel"), ("timeline", "timeline"),
              ("financing", "financing"), ("trade_in", "trade_in")]
    fields = []
    for key, label in labels:
        v = profile.get(key)
        if v in (None, ""):
            continue
        if key == "budget_max":
            v = logic.fmt_money(v)
        fields.append(f"{label}: {v}")
    if fields:
        parts.append(" | ".join(fields))
    if notes:
        parts.append("notes: " + "; ".join(f"- {n['text']}" for n in notes))
    if viewed:
        parts.append("recently viewed: " + ", ".join(f"{vid} ({title})" for vid, title in viewed))
    if upcoming:
        parts.append("upcoming test drives: " + "; ".join(upcoming))
    return "<buyer_memory>\n" + "\n".join(parts) + "\n</buyer_memory>"
