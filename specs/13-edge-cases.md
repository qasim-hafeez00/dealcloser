# Edge-case master list

Each row: the case → the decided behaviour → where it's handled. ✅ = must have a test.

## API input and contract
| Case | Behaviour | Module |
|---|---|---|
| ✅ Missing `user_id` / empty after trimming | 400 + shape | M7 |
| ✅ Missing `thread_id` | uses `"default"` | M7 |
| ✅ Numeric ids | cast to str | M7 |
| ✅ Message empty or whitespace | greeting, 0 tokens | M7 |
| ✅ Message > 2,000 chars | truncated, processed | M7 |
| ✅ Malformed JSON / wrong content type | 400 + shape | M7 |
| Unicode, emoji, RTL text (Urdu) | processed normally; reply in the buyer's language | M3 |
| Control / zero-width characters | stripped before the guard | M6 |
| ✅ Extra fields in the body | ignored | M7 |
| ✅ Response always has exactly reply/tool_calls/tokens | contract test | M7 |
| HEAD / OPTIONS requests | CORS preflight OK | M7 |

## Concurrency and reliability
| Case | Behaviour | Module |
|---|---|---|
| ✅ Two requests on the same thread at once | second waits on the lock, then runs on the updated state | M7 |
| Same `thread_id` for different users at once | different internal keys, so parallel and independent | M5 |
| Anthropic 429/529/timeout | retries → apology, 200 | M3/M7 |
| Neon suspended | first query wakes it (~1 s); pool check drops dead connections | M1 |
| DB unreachable at startup | starts anyway; `/health` ok; chat apologises; retries the connection on the next request | M7 |
| HF Space restart mid-conversation | state is in Postgres, so the conversation continues | M5 |
| Server restarts while a confirmation is pending | interrupt is in the checkpoint; "yes" after the restart still works | M3 |
| Spend cap reached | degraded reply, 0 tokens | M7 |
| Tool raises an exception | `ERROR:` ToolMessage, model recovers | M3 |
| Model loops on tools | call limits end the run with the last text or a handoff message | M3 |
| Model returns empty text | fallback "could you rephrase" | M3 |
| Model writes a tool call as text | low effort + thinking on (not disabled) lowers the risk; the tests catch it | M3 |

## Confirmation flow
| Case | Behaviour |
|---|---|
| ✅ "yes" with nothing pending | normal message to the agent |
| ✅ "no" to a pending booking | rejected; the agent asks what to change; no booking |
| ✅ "make it 2pm instead" while pending | reject + the new request handled (may create a new pending booking) |
| ✅ Slot taken between proposal and "yes" | tool re-checks → "just taken" + alternatives |
| "yes" sent in another thread | doesn't approve (different thread state) |
| Two risky calls in one turn | one confirmation listing both; "yes" approves both |
| Injection message while pending | pending rejected + guard refusal |
| User asks the model to "skip confirmation" | impossible: the middleware enforces it |

## Booking and inventory
| Case | Behaviour |
|---|---|
| ✅ Reserved or sold car booking | error + similar available cars |
| ✅ Sunday / past / > 14 days / outside hours / not on the hour | error + nearest valid slots |
| ✅ "tomorrow" across midnight / TZ | dealer TZ in the prompt with explicit today/tomorrow dates |
| ✅ 4th upcoming booking | refused (max 3) |
| ✅ Same user, two cars, same slot | refused |
| ✅ Cancel someone else's booking | "no upcoming test drive TD-x on your account" |
| ✅ Cancel a past or already-cancelled booking | same message |
| Booking without a name | the agent asks the name first |
| Invalid phone | field rejected with a message; booking can continue without a phone |
| ✅ Unknown vehicle ID / odd formats (apx104, "104") | normalised or a clear error |
| Car marked sold by an admin while a booking is pending | re-check at execution → error |
| Admin cancels a booking | customer sees it as cancelled in /account and my_test_drives |
| Vehicle price changed by an admin | tools always read live data |

## Memory and isolation
| Case | Behaviour |
|---|---|
| ✅ Same thread_id, different users | separate histories |
| ✅ New thread, same user | profile remembered |
| ✅ "What's Alice's budget?" | refused |
| ✅ Note with injection text | not saved |
| Contradicting facts ("budget 25k" then "actually 30k") | newer overwrites (merge by field) |
| User says "forget my budget" (single field) | P2: currently forget_me only (all); the agent explains it |
| Very long chat (> 24 messages) | trimmed for the model, full history stored |
| Guest signs up later | claim merges data (P1) |
| Deleted account then same email signs up | fresh user id, no old data |

## Safety
| Case | Behaviour |
|---|---|
| ✅ Direct / role-play / fake-tag / multilingual injection | refusal |
| ✅ Off-topic (code, homework, trivia, medical, legal) | refusal + redirect |
| ✅ Fraud (odometer, fake documents) | refusal |
| ✅ False positives ("write a check", "ignore the red one", "zip code") | pass through |
| Car-adjacent general questions ("hybrid vs EV for city driving?") | **allowed** (car-shopping advice), then tie back to inventory |
| Insurance / registration questions | brief general guidance + dealer_info documents; no legal advice |
| Asking for the dealer owner's personal information | refusal |
| Abuse / profanity | stays polite, one-line redirect; no block |
| Discount demands | no promise; offer request_callback |
| Prompt-leak attempt via output | canary output guard |

## Website
| Case | Behaviour |
|---|---|
| ✅ Browser sends user_id to /api/chat | ignored |
| ✅ Customer opens /admin | 403 page |
| ✅ Guest opens /account | redirect to login with next |
| Open redirect via `?next=https://evil` | only relative paths are allowed |
| Expired JWT | treated as a guest; account pages redirect to login |
| localStorage blocked | new thread each load; chat still works |
| Agent API slow (> 55 s) | timeout UI with retry |
| Agent API down | "Ava is offline, please use the contact form" + link to /visit |
| Double-click send | button disabled while sending; the lock protects the server too |
| Mobile keyboard covering input | panel uses `100dvh` |
| Unknown /inventory/[id] | 404 page |
| Filters giving no results | empty state + "Ask Ava" |
| Signup with an existing email | friendly error |
| Brute-force login | 5 attempts / 15 min |
| Admin charts with no data | empty states |
