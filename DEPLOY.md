# Deploy: Render (backend + frontend, one service)

The Docker image runs **FastAPI** and serves the **static UI** from the same URL (same origin). Easiest production path: one **[Render](https://render.com) Web Service** using the repo-root [`Dockerfile`](Dockerfile).

---

## 1. Render — Web Service (recommended)

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
| `CORS_ORIGINS` | Usually no | Comma-separated extra origins if the **browser page** is on a **different** host than the API (e.g. GitHub Pages: `https://yourusername.github.io`). No spaces. Must match the browser `Origin` exactly (`https://…`, no trailing slash). If you use a **custom domain** for this service, add that origin here too (Render’s auto URL alone may not match what users type). |
| `WHISPER_MODEL_SIZE` | No | Default `base`. Use `tiny` or `small` on tight RAM (free tier). |
| `WHISPER_DEVICE` | No | Default `cpu`. |
| `WINDOW_DURATION` / `OVERLAP_DURATION` | No | Override processing window sizes (seconds). |
| `LOG_LEVEL` | No | Default `INFO`. |
| `TWITCH_CHANNEL_URL` | No | Only for CLI (`main.py`); the web UI sends the URL per request. |

`PORT` is set by Render; the Docker `CMD` already uses it.

### “SSL” or CORS errors in the browser

This project is a **single repo** with `backend/` and `frontend/`; Render runs one container that serves both. Connection issues are usually **origin or HTTPS**, not two separate repos.

1. **Same Render URL:** Use `__TRIVIA_API_BASE__ = ""` in [`frontend/config.js`](frontend/config.js). Do not point `config.js` at `http://…` while the page is `https://…` (mixed content is blocked).
2. **GitHub Pages + Render API:** Set `__TRIVIA_API_BASE__` to your full Render API URL (**https**, no trailing slash). Set `CORS_ORIGINS` on Render to your Pages **origin** only, e.g. `https://yourusername.github.io` (no path; the browser does not put `/repo-name` in `Origin`).
3. **Custom domain:** Add `https://your.custom.domain` to `CORS_ORIGINS` so it matches how users open the UI.
4. After changing env vars on Render, **redeploy** or restart so the app picks them up.

### Health check

Set Render’s health check path to `/health` if the dashboard offers it.

---

## 2. Optional: GitHub Pages for frontend only

If you prefer a **split** (static site on Pages, API on Render), use [`.github/workflows/deploy-frontend-pages.yml`](.github/workflows/deploy-frontend-pages.yml), enable **Settings → Pages → Source: GitHub Actions**, set `__TRIVIA_API_BASE__` in `config.js` to your Render URL, and set `CORS_ORIGINS` on the API to your Pages origin (e.g. `https://<user>.github.io`).

If the Pages deploy fails with **404 / Not Found** from `deploy-pages`, Pages **Source** must be **GitHub Actions**, not “Deploy from a branch”.

---

## 3. Alternatives (still free or cheap)

| Host | Notes |
|------|-------|
| **Fly.io** | Same Dockerfile; slightly more CLI/setup than Render. |
| **Google Cloud Run** | Container + GCP account; cold starts. |
| **Oracle Cloud “Always Free” ARM** | Good when Twitch blocks smaller PaaS IPs. |

---

## 4. Checklist (single Render service)

- [ ] One repo / one Web Service: root `Dockerfile` (includes `frontend/`)
- [ ] `OPENAI_API_KEY` set on Render
- [ ] `frontend/config.js` uses `__TRIVIA_API_BASE__ = ""` for same-origin deploy
- [ ] If UI is **not** on the same host as the API, set `CORS_ORIGINS` (and https `__TRIVIA_API_BASE__`)
- [ ] Optional: `/health` configured as health check

---

## 5. Local dev (unchanged)

From `backend/`:

```bash
python run.py
```

Open `http://localhost:8000` and keep `config.js` as `__TRIVIA_API_BASE__ = ""` for same-origin requests.
