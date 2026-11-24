"""LangGraph: START -> guard -> agent -> lead_tracker -> END  (guard blocks -> lead_tracker directly).

agent = create_agent(Claude Haiku 5.5, 13 tools, middleware): memory prompt, history trim,
human-in-the-loop, call limits, tool-error handling, output guard, prompt caching.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, NotRequired

from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentState,
    HumanInTheLoopMiddleware,
    ModelCallLimitMiddleware,
    ModelRequest,
    ToolCallLimitMiddleware,
    after_model,
    dynamic_prompt,
    wrap_model_call,
    wrap_tool_call,
)
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime

from . import config, db, guard, logic, memory, prompts
from .tools import RISKY_TOOLS, TOOLS, DealContext

log = logging.getLogger("dealcloser.graph")


class DealState(MessagesState):
    blocked_by: NotRequired[str | None]


# ------------------------------------------------------------------ helpers

def text_of(msg: Any) -> str:
    c = getattr(msg, "content", msg)
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return str(c or "")


def _now(ctx: DealContext) -> datetime:
    try:
        return datetime.fromisoformat(ctx.now_iso)
    except Exception:
        return datetime.now(config.DEALER_TZ)


async def build_memory_block(store, user_id: str) -> str:
    profile = await memory.get_profile(store, user_id)
    notes = await memory.get_notes(store, user_id)
    viewed_ids = await memory.get_viewed(store, user_id)
    viewed = []
    if viewed_ids:
        rows = await db.fetch("SELECT id, year, make, model FROM vehicles WHERE id = ANY(%s)", viewed_ids)
        by_id = {r["id"]: f"{r['year']} {r['make']} {r['model']}" for r in rows}
        viewed = [(v, by_id[v]) for v in viewed_ids if v in by_id]
    ups = await db.fetch(
        """SELECT b.id, b.vehicle_id, b.slot FROM bookings b
           WHERE b.user_id=%s AND b.status='confirmed' AND b.slot > now() ORDER BY b.slot LIMIT 3""", user_id)
    upcoming = [f"TD-{r['id']} {r['vehicle_id']} {logic.fmt_slot(r['slot'])}" for r in ups]
    shown = {k: v for k, v in profile.items() if k != "updated_at"}
    return memory.memory_block(shown, notes, viewed, upcoming)


# ------------------------------------------------------------------ middleware

@dynamic_prompt
async def memory_prompt(request: ModelRequest) -> SystemMessage:
    ctx: DealContext = request.runtime.context
    try:
        block = await build_memory_block(request.runtime.store, ctx.user_id)
    except Exception:
        log.warning("memory block failed", exc_info=True)
        block = "<buyer_memory>unavailable right now</buyer_memory>"
    return SystemMessage(content=[
        {"type": "text", "text": prompts.FIXED, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": prompts.dynamic_part(_now(ctx), block)},
    ])


def safe_window(messages: list, window: int = config.HISTORY_WINDOW) -> list:
    """Last `window` messages, starting at a HumanMessage so a tool call is never split from its result."""
    if len(messages) <= window:
        return messages
    start = len(messages) - window
    while start < len(messages) and not isinstance(messages[start], HumanMessage):
        start += 1
    if start >= len(messages):  # no human message in the window: walk back to the nearest one
        start = len(messages) - window
        while start > 0 and not isinstance(messages[start], HumanMessage):
            start -= 1
    return messages[start:]


@wrap_model_call
async def trim_history(request: ModelRequest, handler):
    return await handler(request.override(messages=safe_window(list(request.messages))))


@wrap_tool_call
async def tool_errors(request, handler):
    try:
        return await handler(request)
    except Exception as e:  # never crash the turn because of a tool
        if type(e).__name__ in ("GraphInterrupt", "GraphBubbleUp", "Interrupt", "ParentCommand"):
            raise
        log.exception("tool %s failed", request.tool_call.get("name"))
        return ToolMessage(
            content="ERROR: the tool failed unexpectedly. Apologise briefly and offer another option.",
            tool_call_id=request.tool_call["id"], name=request.tool_call.get("name"), status="error")


_PROMPT_WORDS = re.findall(r"[a-z']+", prompts.FIXED.lower())
_PROMPT_NGRAMS = {" ".join(_PROMPT_WORDS[i:i + 12]) for i in range(len(_PROMPT_WORDS) - 11)}


def leaks_prompt(text: str) -> bool:
    if config.CANARY.lower() in text.lower():
        return True
    words = re.findall(r"[a-z']+", text.lower())
    return any(" ".join(words[i:i + 12]) in _PROMPT_NGRAMS for i in range(len(words) - 11))


@after_model
def output_guard(state: AgentState, runtime) -> dict | None:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and not last.tool_calls and leaks_prompt(text_of(last)):
        log.warning("output guard replaced a reply")
        return {"messages": [AIMessage(content=prompts.REFUSAL_LEAK, id=last.id,
                                       usage_metadata=last.usage_metadata,
                                       response_metadata={**(last.response_metadata or {}), "output_guard": True})]}
    return None


def _caching_middleware():
    try:
        from langchain_anthropic.middleware import AnthropicPromptCachingMiddleware
        return [AnthropicPromptCachingMiddleware(ttl="5m")]
    except Exception:
        return []


def make_model() -> BaseChatModel:
    from langchain_anthropic import ChatAnthropic
    return ChatAnthropic(
        model=config.MODEL,
        max_tokens=config.MAX_TOKENS,
        default_request_timeout=30,
        max_retries=2,
        output_config={"effort": config.EFFORT},
    )


# ------------------------------------------------------------------ nodes

async def guard_node(state: DealState, runtime: Runtime[DealContext]) -> dict:
    last = state["messages"][-1]
    cat = guard.check(text_of(last)) if isinstance(last, HumanMessage) else None
    if cat:
        return {"blocked_by": cat, "messages": [AIMessage(content=guard.REPLIES[cat],
                                                          response_metadata={"guard": cat})]}
    return {"blocked_by": None}


async def lead_tracker(state: DealState, runtime: Runtime[DealContext]) -> dict:
    try:
        await memory.sync_lead(runtime.context.user_id, store=runtime.store, bump_message=True,
                               blocked=bool(state.get("blocked_by")))
    except Exception:
        log.warning("lead_tracker failed", exc_info=True)
    return {}


def route_after_guard(state: DealState) -> str:
    return "lead_tracker" if state.get("blocked_by") else "agent"


def build_graph(model: BaseChatModel | None = None, *, checkpointer=None, store=None, caching: bool = True):
    model = model or make_model()
    middleware = [
        memory_prompt,
        trim_history,
        HumanInTheLoopMiddleware(interrupt_on={t: {"allowed_decisions": ["approve", "reject"]} for t in RISKY_TOOLS}),
        ModelCallLimitMiddleware(run_limit=6, exit_behavior="end"),
        ToolCallLimitMiddleware(run_limit=8, exit_behavior="continue"),
        tool_errors,
        output_guard,
    ]
    if caching:
        middleware += _caching_middleware()
    agent = create_agent(model, TOOLS, middleware=middleware, context_schema=DealContext, name="agent")
    g = StateGraph(DealState, context_schema=DealContext)
    g.add_node("guard", guard_node)
    g.add_node("agent", agent)
    g.add_node("lead_tracker", lead_tracker)
    g.add_edge(START, "guard")
    g.add_conditional_edges("guard", route_after_guard, {"agent": "agent", "lead_tracker": "lead_tracker"})
    g.add_edge("agent", "lead_tracker")
    g.add_edge("lead_tracker", END)
    return g.compile(checkpointer=checkpointer, store=store, name="dealcloser")
