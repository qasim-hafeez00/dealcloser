"""One chat turn: lock -> (resume pending confirmation | new message) -> reply, tokens, tool_calls -> chat_log."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.types import Command

from . import config, db, guard, logic
from .graph import text_of
from .tools import RISKY_TOOLS, DealContext

log = logging.getLogger("dealcloser.service")

GREETING = ("Hi! I'm Ava from Apex Motors. I can help you find a car, estimate payments or a trade-in, "
            "and book a test drive. What are you looking for?")
APOLOGY = "Sorry, I'm having trouble right now. Please try again in a moment."
FALLBACK = "Sorry, I didn't catch that. Could you rephrase?"
HANDOFF = ("Let me hand this to our team: I can ask a sales manager to call you if you share a phone number or email.")


@dataclass
class TurnResult:
    reply: str
    tool_calls: list[dict] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    cache_read: int = 0
    model_calls: int = 0
    blocked_by: str | None = None
    awaiting_confirmation: bool = False
    confirmation: str | None = None
    error: str | None = None

    def body(self) -> dict:
        return {"reply": self.reply, "tool_calls": self.tool_calls,
                "tokens": {"in": self.tokens_in, "out": self.tokens_out}}


def internal_thread(user_id: str, thread_id: str) -> str:
    return f"{user_id}::{thread_id}"


def _pending_interrupts(snapshot) -> list:
    out = list(getattr(snapshot, "interrupts", ()) or ())
    if not out:
        for t in getattr(snapshot, "tasks", ()) or ():
            out.extend(getattr(t, "interrupts", ()) or ())
    return out


def _action_requests(interrupts: list) -> list[dict]:
    reqs = []
    for itr in interrupts:
        val = getattr(itr, "value", itr)
        if isinstance(val, dict):
            reqs.extend(val.get("action_requests", []))
    return reqs


def _unanswered_risky_calls(messages: list) -> list[str]:
    answered = {m.tool_call_id for m in messages if isinstance(m, ToolMessage)}
    for m in reversed(messages):
        if isinstance(m, AIMessage) and m.tool_calls:
            return [tc["id"] for tc in m.tool_calls if tc["name"] in RISKY_TOOLS and tc["id"] not in answered]
    return []


class ChatService:
    def __init__(self, graph):
        self.graph = graph
        self._locks: dict[str, asyncio.Lock] = {}
        self._spend_cache: tuple[float, float] = (0.0, 0.0)

    def _lock(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            if len(self._locks) > 5000:  # crude cleanup of idle locks
                self._locks = {k: v for k, v in self._locks.items() if v.locked()}
            lock = self._locks[key] = asyncio.Lock()
        return lock

    async def spent_usd(self) -> float:
        ts, val = self._spend_cache
        if time.monotonic() - ts < 20:
            return val
        try:
            row = await db.fetchrow(
                """SELECT COALESCE(SUM(tokens_in - cache_read),0) AS i, COALESCE(SUM(cache_read),0) AS c,
                          COALESCE(SUM(tokens_out),0) AS o FROM chat_log""")
            f = await db.fetchrow("SELECT COALESCE(SUM(tokens_in),0) AS i, COALESCE(SUM(tokens_out),0) AS o FROM followups")
            val = ((row["i"] + f["i"]) * config.PRICE_IN + row["c"] * config.PRICE_CACHE_READ
                   + (row["o"] + f["o"]) * config.PRICE_OUT)
        except Exception:
            log.warning("spend query failed", exc_info=True)
        self._spend_cache = (time.monotonic(), val)
        return val

    # ------------------------------------------------------------ main entry
    async def handle(self, user_id: str, thread_id: str, message: str, source: str = "api") -> TurnResult:
        start = time.monotonic()
        res = TurnResult(reply="")
        try:
            if not message.strip():
                res.reply, res.blocked_by = GREETING, "empty"
            elif await self.spent_usd() >= config.SPEND_CAP_USD:
                res.reply, res.blocked_by = ("Our assistant is taking a short break. Please use the contact form "
                                             "or call Apex Motors and a sales manager will help you."), "spend_cap"
            else:
                key = internal_thread(user_id, thread_id)
                async with self._lock(key):
                    await asyncio.wait_for(self._run(res, key, user_id, thread_id, message, source),
                                           timeout=config.TURN_TIMEOUT_S)
        except asyncio.TimeoutError:
            res.reply, res.error = APOLOGY, "timeout"
        except Exception as e:  # never fail the contract
            log.exception("turn failed")
            res.reply, res.error = APOLOGY, f"{type(e).__name__}: {str(e)[:300]}"
        latency = int((time.monotonic() - start) * 1000)
        await self._log(user_id, thread_id, message, res, latency, source)
        return res

    async def _run(self, res: TurnResult, key: str, user_id: str, thread_id: str, message: str, source: str):
        cfg = {"configurable": {"thread_id": key}, "recursion_limit": 40}
        ctx = DealContext(user_id=user_id, thread_id=thread_id, source=source,
                          now_iso=datetime.now(config.DEALER_TZ).isoformat())
        before_msgs, pending = await self._thread_view(cfg)
        seen_ids = {m.id for m in before_msgs if m.id}
        rejected_ids: set[str] = set()
        override_reply = None

        if pending:
            n = max(1, len(_action_requests(pending)))
            pending_ids = _unanswered_risky_calls(before_msgs)
            blocked = guard.check(message)
            answer = "blocked" if blocked else guard.parse_confirmation(message)
            if answer == "yes":
                decisions = [{"type": "approve"}] * n
                res.confirmation = "approved"
            else:
                if answer == "blocked":
                    msg = ("Not executed. The buyer's next message was blocked by the safety filter. "
                           "Do not proceed with this action.")
                    override_reply, res.blocked_by = guard.REPLIES[blocked], blocked
                elif answer == "no":
                    msg = "Not executed: the buyer declined. Briefly ask what they'd like to change."
                else:
                    msg = (f"Not executed: the buyer did not confirm. Instead they said: \"{message[:500]}\". "
                           "Handle that new request now (you may propose a new action).")
                decisions = [{"type": "reject", "message": msg}] * n
                res.confirmation = "rejected"
                rejected_ids = set(pending_ids)
            inp: Any = Command(resume={"decisions": decisions})
        else:
            inp = {"messages": [HumanMessage(content=message)]}

        out = await self.graph.ainvoke(inp, cfg, context=ctx)
        after, interrupts = await self._thread_view(cfg)
        new = [m for m in after if not (m.id and m.id in seen_ids) and not isinstance(m, HumanMessage)]

        # ---- accounting: only AI messages created in this turn; only tools that actually ran
        for m in new:
            if isinstance(m, AIMessage) and m.usage_metadata:
                res.tokens_in += int(m.usage_metadata.get("input_tokens", 0) or 0)
                res.tokens_out += int(m.usage_metadata.get("output_tokens", 0) or 0)
                res.cache_read += int((m.usage_metadata.get("input_token_details") or {}).get("cache_read", 0) or 0)
                res.model_calls += 1
        calls_by_id = {tc["id"]: tc for m in after if isinstance(m, AIMessage) for tc in (m.tool_calls or [])}
        for m in new:
            if isinstance(m, ToolMessage) and m.tool_call_id not in rejected_ids:
                tc = calls_by_id.get(m.tool_call_id)
                if tc:
                    res.tool_calls.append({"name": tc["name"], "args": tc.get("args", {})})

        if interrupts:
            res.awaiting_confirmation = True
            res.reply = await confirmation_text(_action_requests(interrupts))
            return

        if not res.blocked_by:
            res.blocked_by = (out or {}).get("blocked_by")
        if override_reply:
            res.reply = override_reply
            return
        last_ai = next((m for m in reversed(new) if isinstance(m, AIMessage)), None)
        text = text_of(last_ai).strip() if last_ai else ""
        if not text:
            text = HANDOFF if res.model_calls >= 6 else FALLBACK
        if last_ai is not None and (last_ai.response_metadata or {}).get("output_guard"):
            res.blocked_by = "output_leak"
        res.reply = text

    async def _thread_view(self, cfg) -> tuple[list, list]:
        """All messages of the thread (including those still inside a paused agent subgraph) + pending interrupts."""
        snap = await self.graph.aget_state(cfg, subgraphs=True)
        msgs = list((snap.values or {}).get("messages", []))
        for task in getattr(snap, "tasks", ()) or ():
            sub = getattr(task, "state", None)
            sub_msgs = list((getattr(sub, "values", None) or {}).get("messages", [])) if sub is not None and hasattr(sub, "values") else []
            if len(sub_msgs) > len(msgs):
                msgs = sub_msgs
        return msgs, _pending_interrupts(snap)

    async def _log(self, user_id, thread_id, message, res: TurnResult, latency: int, source: str):
        try:
            await db.execute(
                """INSERT INTO chat_log (user_id, thread_id, user_message, reply, tool_calls, tokens_in, tokens_out,
                   cache_read, model_calls, latency_ms, blocked_by, awaiting_confirmation, confirmation, error, source)
                   VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                user_id, thread_id, message[:4000], res.reply[:4000], json.dumps(res.tool_calls, default=str),
                res.tokens_in, res.tokens_out, res.cache_read, res.model_calls, latency, res.blocked_by,
                res.awaiting_confirmation, res.confirmation, res.error, source if source in ("api", "web") else "api")
            if res.blocked_by in ("empty", "spend_cap", "rate_limit"):
                return
        except Exception:
            log.warning("chat_log insert failed", exc_info=True)


async def confirmation_text(action_requests: list[dict]) -> str:
    lines = []
    for ar in action_requests:
        name, args = ar.get("name"), ar.get("args", {}) or {}
        try:
            if name == "book_test_drive":
                vid = logic.normalize_vehicle_id(args.get("vehicle_id")) or args.get("vehicle_id")
                v = await db.fetchrow("SELECT year, make, model, trim FROM vehicles WHERE id=%s", vid)
                car = f"the {v['year']} {v['make']} {v['model']} {v['trim'] or ''}".strip() + f" ({vid})" if v else str(vid)
                dt = logic.parse_slot(str(args.get("slot", "")))
                when = logic.fmt_slot(dt).replace(" ", " ", 1) if dt else str(args.get("slot"))
                who = args.get("contact_name")
                lines.append(f"test drive of {car} on {when}" + (f" for {who}" if who else ""))
            elif name == "cancel_test_drive":
                bid = logic.normalize_booking_id(args.get("booking_id"))
                b = await db.fetchrow("SELECT vehicle_id, slot FROM bookings WHERE id=%s", bid) if bid else None
                extra = f" ({b['vehicle_id']}, {logic.fmt_slot(b['slot'])})" if b else ""
                lines.append(f"cancel test drive TD-{bid or args.get('booking_id')}{extra}")
            elif name == "forget_me":
                lines.append("delete everything I remember about you (preferences, notes, recently viewed cars); "
                             "your bookings are kept")
            else:
                lines.append(f"{name} {json.dumps(args)}")
        except Exception:
            lines.append(f"{name} {json.dumps(args, default=str)}")
    if len(lines) == 1:
        return f"Please confirm: {lines[0]}. Reply \"yes\" to confirm or \"no\" to change it."
    body = "\n".join(f"{i}. {l}" for i, l in enumerate(lines, 1))
    return f"Please confirm these actions:\n{body}\nReply \"yes\" to confirm all, or \"no\" to change them."
