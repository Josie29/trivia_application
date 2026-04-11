# Deploy: Render (full web app)

The Docker image runs **FastAPI** and serves the **static UI** from the same URL (same origin). Production path: one **[Render](https://render.com) Web Service** using the repo-root [`Dockerfile`](Dockerfile).

---

## 1. Render — Web Service

**Why Render:** Free tier Web Service, GitHub connect, **Docker**, and **FFmpeg** in the image for Streamlink/audio.

**Caveats (any free tier):**

- Instances **spin down** when idle; first request can be slow (cold start).
- **RAM** may be tight for Whisper; if the process OOMs, upgrade the instance or use a smaller `WHISPER_MODEL_SIZE`.
- **Twitch** sometimes blocks or degrades traffic from cloud IPs; if streams fail, try another region or a home/VPS server.

### Steps

1. Create a **Web Service** from this repo.
2. **Root Directory:** leave empty (repository root).
3. **Dockerfile path:** default `Dockerfile` at the repo root.
4. **Instance type:** Free (or paid if you need more RAM).
5. **Environment variables** — see [table below](#render-environment-variables).
6. Deploy. Open your service URL (e.g. `https://your-service.onrender.com`) — you should get the web UI; API routes stay under `/api/...` and `/health`.

Keep [`frontend/config.js`](frontend/config.js) as `window.__TRIVIA_API_BASE__ = ""` when the UI is served from this same Web Service so `fetch` and `EventSource` stay on **https** with the same host (avoids mixed content and CORS mismatches).

### Render environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `OPENAI_API_KEY` | **Yes** | Your OpenAI API key. Without it the API will not start. |
| `RENDER_EXTERNAL_URL` | No (auto) | Render sets this to your service’s public **https** URL (e.g. `https://your-service.onrender.com`). The app adds it to CORS automatically—you do **not** need to create it manually. |
| `CORS_ORIGINS` | Usually no | Comma-separated extra origins only if users open the UI on a **different** host than where the API runs (unusual for this setup). No spaces. Must match the browser `Origin` exactly (`https://…`, no trailing slash). If you add a **custom domain** in front of Render, add that origin here too when it differs from `RENDER_EXTERNAL_URL`. |
| `WHISPER_MODEL_SIZE` | No | Default `base`. Use `tiny` or `small` on tight RAM (free tier). |
| `WHISPER_DEVICE` | No | Default `cpu`. |
| `AUDIO_WINDOW_SECONDS` / `SEGMENT_INTERVAL_SECONDS` | No | Whisper window length and seconds between transcription runs (see `config.py`). |
| `LOG_LEVEL` | No | Default `INFO`. |
| `TWITCH_CHANNEL_URL` | No | Only for CLI (`main.py`); the web UI sends the URL per request. |
| `DATABASE_URL` | **Recommended** | **PostgreSQL** connection string. Render injects this automatically when you create a **PostgreSQL** instance and **link** it to your Web Service (Dashboard → your DB → **Connections** / link to service). The shared **question log** is stored here so it **survives deploys and restarts**. If unset, the log stays **in-memory only** (lost on restart). |
| `QUESTION_LOG_DATABASE_URL` | No | Override for the question log only (same format as `DATABASE_URL`). Use if you want a different DB than the default `DATABASE_URL`. |

`PORT` is set by Render; the Docker `CMD` already uses it.

### Shared question log (PostgreSQL on Render)

1. In the Render dashboard, create a **PostgreSQL** instance (free tier available with limits).
2. Link that database to your **Web Service** (or copy the **Internal Database URL** / **External Database URL** into the Web Service env as `DATABASE_URL`).
3. Redeploy the Web Service. On startup the app runs SQLAlchemy `create_all` for the `question_log` table—no manual migration file is required for the initial schema.

Locally you can use **SQLite** instead, e.g. `QUESTION_LOG_DATABASE_URL=sqlite:///./data/question_log.sqlite` in `backend/.env` (the `data/` directory is created if needed).

### “SSL” or CORS errors in the browser

1. **Default (UI + API on Render):** Use `__TRIVIA_API_BASE__ = ""` in [`frontend/config.js`](frontend/config.js). Do not point `config.js` at `http://…` while the page is `https://…` (mixed content is blocked).
2. **Custom domain:** If visitors use `https://app.example.com` but `RENDER_EXTERNAL_URL` is still `https://*.onrender.com`, add `https://app.example.com` to `CORS_ORIGINS` so it matches the tab’s origin.
3. After changing env vars on Render, **redeploy** or restart so the app picks them up.

### Health check

Set Render’s health check path to `/health` if the dashboard offers it.

---

## 2. Alternatives (still free or cheap)

| Host | Notes |
|------|-------|
| **Fly.io** | Same Dockerfile; slightly more CLI/setup than Render. |
| **Google Cloud Run** | Container + GCP account; cold starts. |
| **Oracle Cloud “Always Free” ARM** | Good when Twitch blocks smaller PaaS IPs. |

---

## 3. Checklist

- [ ] Web Service built from root `Dockerfile` (includes `frontend/`)
- [ ] `OPENAI_API_KEY` set on Render
- [ ] `frontend/config.js` uses `__TRIVIA_API_BASE__ = ""`
- [ ] Custom domain: add that `https://…` origin to `CORS_ORIGINS` if needed
- [ ] Optional: `/health` configured as health check
- [ ] Optional: PostgreSQL linked so `DATABASE_URL` is set (persistent shared question log)

---

## 4. Local dev

From `backend/`:

```bash
python run.py
```

Open `http://localhost:8000` and keep `config.js` as `__TRIVIA_API_BASE__ = ""` for same-origin requests.
