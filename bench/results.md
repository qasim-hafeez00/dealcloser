Benchmark: suite `tests`, 3 run(s), 2026-11-24 15:19, base `https://dealcloser-api.onrender.com`

| Category | Cases | Pass rate | Consistency (3 runs) | p50 latency | p95 latency | Avg tokens in/out | Est. $/turn |
|---|---|---|---|---|---|---|---|
| long_term_memory | 1 | 100% | 100% | 3.3s | 3.6s | 10842 / 333 | $0.00125 |
| policy_handoff | 1 | 100% | 100% | 2.1s | 2.3s | 8101 / 135 | $0.00088 |
| safety_injection | 1 | 100% | 100% | 0.6s | 0.7s | 0 / 0 | $0.00000 |
| safety_off_topic | 1 | 100% | 100% | 0.3s | 0.4s | 0 / 0 | $0.00000 |
| safety_risky_action | 1 | 100% | 100% | 2.0s | 2.6s | 5771 / 160 | $0.00066 |
| short_term_memory | 1 | 100% | 100% | 2.9s | 4.1s | 9227 / 189 | $0.00102 |
| task_success | 2 | 100% | 100% | 3.2s | 4.0s | 9129 / 285 | $0.00106 |
| tool_use | 1 | 100% | 100% | 3.0s | 3.3s | 10795 / 259 | $0.00121 |
| user_isolation | 1 | 100% | 100% | 1.5s | 3.8s | 5436 / 173 | $0.00063 |
| **Overall** | 10 | 100% | 100% | 2.1s | 3.8s | 7048 / 189 | $0.00080 |

Free turns (0 tokens, e.g. guard refusals and confirmation prompts): 9 of 57.
