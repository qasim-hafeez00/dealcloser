# M11: Deployment and ops

> If the agent is offline during evaluation, the automated tests score 0. Uptime beats features.

## 1. Agent API: Hugging Face Space (Docker)
- Space: `<hf-user>/dealcloser-api`, SDK **Docker**, hardware **CPU basic (free)**, visibility **public** (the API must be open; the code being visible is fine because secrets live in Space secrets).
- Space repo root contains `README.md` with this header:
  ```yaml
  ---
  title: DealCloser API
  sdk: docker
  app_port: 7860
  pinned: true
  ---
  ```
- `Dockerfile`:
  ```dockerfile
  FROM python:3.11-slim
  ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
  RUN useradd -m -u 1000 app
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install -r requirements.txt
  COPY --chown=app . .
  USER app
  EXPOSE 7860
  CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--proxy-headers"]
  ```
- **Secrets:** `ANTHROPIC_API_KEY`, `DATABASE_URL_UNPOOLED` (Neon `production`, direct), `SERVICE_TOKEN`, `SPEND_CAP_USD=1.60`, `DEALER_TZ=Asia/Karachi`, `GIT_SHA`.
- Base URL: `https://<hf-user>-dealcloser-api.hf.space`. Check: `curl …/health` → `ok`.
- **Deploying:** a GitHub Action `deploy-api.yml` on push to `main` that touches `api/**` pushes the `api/` subtree to the Space git remote using `HF_TOKEN` (a GitHub secret). Fallback: manual `git subtree push --prefix api hf main`.
- Build time is about 2–4 min. **Never deploy after 23:30.**

### Fallback: Render
Same Dockerfile, a free web service, env vars identical, `PORT` mapped to 7860. Free Render sleeps after 15 min idle, so the keep-alive cron must run every 10 min if we use it.

## 2. Website: Vercel
- Import the GitHub repo, root directory `web/`, framework Next.js, region `iad1` (Washington, same area as Neon us-east-1).
- Env: `DATABASE_URL` (Neon `production`, **pooled**), `AUTH_SECRET`, `SERVICE_TOKEN`, `AGENT_API_URL`, `NEXT_PUBLIC_SITE_NAME=Apex Motors`, `NEXT_PUBLIC_REPO_URL`.
- `/api/chat` has `export const maxDuration = 60` (Hobby allows up to 60 s; the default is shorter, so a slow agent turn would otherwise be cut off).
- Every push to `main` deploys automatically. Preview deploys for branches.

## 3. Database: Neon
See M1. Prod = `main` branch. **Benchmark user cleanup at about 23:15** (M1 §5).

## 4. Keep-alive and monitoring
`.github/workflows/keepalive.yml`:
```yaml
on: { schedule: [{ cron: "*/20 * * * *" }], workflow_dispatch: {} }
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS --max-time 30 "$API/health" || (sleep 30 && curl -fsS --max-time 60 "$API/health")
          curl -fsS --max-time 30 "$WEB/" > /dev/null
        env: { API: "${{ secrets.AGENT_API_URL }}", WEB: "${{ secrets.WEB_URL }}" }
```
GitHub scheduled runs can be delayed but are good enough. Extra: a free UptimeRobot monitor on `/health` every 5 min (emails on downtime), set up by the team.

## 5. Environment variable matrix

| Var | API (HF) | Web (Vercel) | Local api/.env | Local web/.env.local | GitHub secrets |
|---|---|---|---|---|---|
| ANTHROPIC_API_KEY | ✔ | | ✔ | | |
| DATABASE_URL (pooled) | | ✔ production | | ✔ dev | |
| DATABASE_URL_UNPOOLED (direct) | ✔ production | | ✔ dev | | |
| SERVICE_TOKEN | ✔ | ✔ | ✔ | ✔ | |
| AUTH_SECRET | | ✔ | | ✔ | |
| AGENT_API_URL | | ✔ | | ✔ (localhost:7860) | ✔ |
| SPEND_CAP_USD, DEALER_TZ | ✔ | | ✔ | | |
| ADMIN_EMAIL / ADMIN_PASSWORD | | | ✔ (seed only) | | |
| HF_TOKEN, WEB_URL | | | | | ✔ |

`.env.example` (root) lists every variable with placeholder values and a comment on each.

## 6. Freeze and evaluation-day plan
- 23:30 Mon: code freeze. Tag `v1.0-submission`.
- Tue (evaluation): someone checks `/health` and the admin Usage page in the morning, midday and evening. **Don't push to main.** If the API is down: restart the Space (Settings → Restart). If the DB is the problem: check the Neon console.
- Keep everything live until Wed 25 Nov evening.
- Rollback: HF Space → Files → revert to the tagged commit; Vercel → Deployments → promote the previous one.

## 7. Security hygiene
- `.gitignore`: `.env`, `.env.*` (except `.env.example`), `__pycache__`, `.venv`, `node_modules`, `.next`, `bench/results*.json` (optional).
- Pre-commit check (manual): `git grep -nE "sk-ant-|npg_|postgres(ql)?://[^ ]*@"` must find nothing.
- If a key leaks: rotate immediately (the group leader asks the organisers), update the HF secret.
