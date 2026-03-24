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
5. **Environment variables:**
   - `OPENAI_API_KEY` — required
   - `CORS_ORIGINS` — optional when the UI is served by the same service (same origin). Add extra origins only if you also host the UI elsewhere (e.g. GitHub Pages), comma-separated.
6. Deploy. Open your service URL (e.g. `https://your-service.onrender.com`) — you should get the web UI; API routes stay under `/api/...` and `/health`.

Keep [`frontend/config.js`](frontend/config.js) as `window.__TRIVIA_API_BASE__ = ""` so the browser uses the Render hostname for `fetch` and `EventSource`.

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

- [ ] Web Service built from root `Dockerfile`
- [ ] `OPENAI_API_KEY` set on Render
- [ ] `frontend/config.js` uses `__TRIVIA_API_BASE__ = ""` for same-origin deploy
- [ ] Optional: `/health` configured as health check

---

## 5. Local dev (unchanged)

From `backend/`:

```bash
python run.py
```

Open `http://localhost:8000` and keep `config.js` as `__TRIVIA_API_BASE__ = ""` for same-origin requests.
