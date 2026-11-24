"""Benchmark runner for the DealCloser /chat API.

  python bench/run_bench.py --base-url https://<space>.hf.space --suite tests --repeat 1
  python bench/run_bench.py --base-url http://localhost:7860 --suite full --repeat 3

Writes bench/results.json and bench/results.md (table for the README).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

ROOT = Path(__file__).resolve().parents[1]
SUITES = {"tests": ROOT / "tests.json", "full": ROOT / "bench" / "cases_full.json"}
PRICE_IN, PRICE_OUT = 0.10 / 1e6, 0.50 / 1e6


def next_weekday() -> str:
    d = datetime.now(ZoneInfo("Asia/Karachi")) + timedelta(days=2)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def fill(s: str, run: str) -> str:
    return s.replace("{{run}}", run).replace("{{next_weekday}}", next_weekday())


def check_turn(exp: dict, status: int, body, latency_ms: int) -> list[str]:
    fails = []
    if status != exp.get("status", 200):
        fails.append(f"status {status}")
    if not (isinstance(body, dict) and set(body) == {"reply", "tool_calls", "tokens"}
            and isinstance(body.get("tokens"), dict) and set(body["tokens"]) == {"in", "out"}):
        return fails + ["schema"]
    names = [t.get("name") for t in body["tool_calls"]]
    reply = body["reply"] or ""
    low = reply.lower()
    for t in exp.get("tools_include", []):
        if t not in names:
            fails.append(f"missing tool {t}")
    for t in exp.get("tools_exclude", []):
        if t in names:
            fails.append(f"forbidden tool {t}")
    if "tools_exact" in exp and names != exp["tools_exact"]:
        fails.append(f"tools {names} != {exp['tools_exact']}")
    any_of = exp.get("reply_includes_any")
    if any_of and not any(x.lower() in low for x in any_of):
        fails.append(f"reply lacks any of {any_of}")
    for x in exp.get("reply_excludes", []):
        if x.lower() in low:
            fails.append(f"reply contains '{x}'")
    if exp.get("max_latency_ms") and latency_ms > exp["max_latency_ms"]:
        fails.append(f"latency {latency_ms}ms")
    return fails


async def run_case(client: httpx.AsyncClient, base: str, case: dict, run: str) -> dict:
    turns_out, ok = [], True
    for t in case["turns"]:
        if "raw_body" in t:
            payload, content = None, t["raw_body"]
        else:
            payload = {k: fill(str(v), run) for k, v in t.items() if k in ("user_id", "thread_id", "message")}
            content = None
        t0 = time.monotonic()
        try:
            if content is not None:
                r = await client.post(f"{base}/chat", content=content, headers={"content-type": "application/json"})
            else:
                r = await client.post(f"{base}/chat", json=payload)
            status = r.status_code
            try:
                body = r.json()
            except Exception:
                body = None
        except Exception as e:
            status, body = 0, {"error": str(e)}
        lat = int((time.monotonic() - t0) * 1000)
        fails = check_turn(t.get("expect", {}), status, body, lat)
        ok &= not fails
        b = body if isinstance(body, dict) else {}
        turns_out.append({"message": (payload or {}).get("message", "<raw>"), "status": status, "latency_ms": lat,
                          "reply": b.get("reply"), "tool_calls": [x.get("name") for x in b.get("tool_calls", []) or []],
                          "tokens": b.get("tokens", {}), "fails": fails})
    return {"id": case["id"], "category": case["category"], "pass": ok, "turns": turns_out}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:7860")
    ap.add_argument("--suite", default="tests", choices=list(SUITES))
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--only", default="", help="comma-separated case ids")
    a = ap.parse_args()
    cases = json.loads(SUITES[a.suite].read_text(encoding="utf-8"))["cases"]
    if a.only:
        keep = set(a.only.split(","))
        cases = [c for c in cases if c["id"] in keep]
    base = a.base_url.rstrip("/")
    sem = asyncio.Semaphore(a.concurrency)
    runs = []
    async with httpx.AsyncClient(timeout=90) as client:
        for i in range(a.repeat):
            run = f"{datetime.now():%m%d%H%M}{uuid.uuid4().hex[:4]}"

            async def guarded(c):
                async with sem:
                    return await run_case(client, base, c, run)
            res = await asyncio.gather(*(guarded(c) for c in cases))
            runs.append(res)
            print(f"run {i + 1}/{a.repeat}: {sum(r['pass'] for r in res)}/{len(res)} passed")
            for r in res:
                if not r["pass"]:
                    for t in r["turns"]:
                        if t["fails"]:
                            print(f"  {r['id']} FAIL {t['fails']} | reply: {(t['reply'] or '')[:160]!r}")

    cats = sorted({c["category"] for c in cases})
    rows, all_turns = [], []
    for cat in cats + ["ALL"]:
        ids = [c["id"] for c in cases if cat == "ALL" or c["category"] == cat]
        results = [r for run in runs for r in run if r["id"] in ids]
        turns = [t for r in results for t in r["turns"]]
        if cat == "ALL":
            all_turns = turns
        lats = sorted(t["latency_ms"] for t in turns) or [0]
        tin = [t["tokens"].get("in", 0) for t in turns if t["tokens"]]
        tout = [t["tokens"].get("out", 0) for t in turns if t["tokens"]]
        consistent = sum(all(r["pass"] for r in results if r["id"] == cid) for cid in ids)
        avg_in, avg_out = (statistics.mean(tin) if tin else 0), (statistics.mean(tout) if tout else 0)
        rows.append({"category": cat, "cases": len(ids), "pass_rate": sum(r["pass"] for r in results) / max(1, len(results)),
                     "consistency": consistent / max(1, len(ids)), "p50": lats[len(lats) // 2],
                     "p95": lats[min(len(lats) - 1, int(len(lats) * 0.95))], "avg_in": avg_in, "avg_out": avg_out,
                     "usd_turn": avg_in * PRICE_IN + avg_out * PRICE_OUT})
    free = sum(1 for t in all_turns if t["tokens"] and t["tokens"].get("in", 1) == 0)
    md = [f"Benchmark: suite `{a.suite}`, {a.repeat} run(s), {datetime.now():%Y-%m-%d %H:%M}, base `{base}`", "",
          f"| Category | Cases | Pass rate | Consistency ({a.repeat} run{'s' if a.repeat > 1 else ''}) | p50 latency | p95 latency | Avg tokens in/out | Est. $/turn |",
          "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        name = "**Overall**" if r["category"] == "ALL" else r["category"]
        md.append(f"| {name} | {r['cases']} | {r['pass_rate']:.0%} | {r['consistency']:.0%} | {r['p50'] / 1000:.1f}s | "
                  f"{r['p95'] / 1000:.1f}s | {r['avg_in']:.0f} / {r['avg_out']:.0f} | ${r['usd_turn']:.5f} |")
    md += ["", f"Free turns (0 tokens, e.g. guard refusals and confirmation prompts): {free} of {len(all_turns)}."]
    out_dir = ROOT / "bench"
    (out_dir / "results.json").write_text(json.dumps({"rows": rows, "runs": runs}, indent=1), encoding="utf-8")
    (out_dir / "results.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    asyncio.run(main())
