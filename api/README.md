---
title: DealCloser API
emoji: 🚗
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: true
---

# DealCloser API (Apex Motors)

AI sales agent for a car dealership: LangGraph (guard -> agent -> lead_tracker) on Claude Haiku 5.5, with
Postgres short-term and long-term memory on Neon.

- `POST /chat` `{"user_id": "...", "thread_id": "...", "message": "..."}` -> `{"reply": "...", "tool_calls": [...], "tokens": {"in": 0, "out": 0}}`
- `GET /health` -> `ok`
- Interactive docs: `/docs`

Full project, website and docs: see the GitHub repository.
