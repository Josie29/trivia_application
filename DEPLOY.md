# Deploy: GitHub Pages (frontend) + free backend

The UI is static files; the API is Python (FastAPI). Host them separately: **GitHub Pages** for `frontend/`, and a small **container-friendly** host for `backend/`.

---

## 1. Frontend — GitHub Pages

This repo includes a workflow that uploads [`frontend/`](frontend/) to GitHub Pages.

1. Push to the `main` branch (or edit [`.github/workflows/deploy-frontend-pages.yml`](.github/workflows/deploy-frontend-pages.yml) if your default branch has another name).
2. In the GitHub repo: **Settings → Pages → Build and deployment**.
3. Under **Source**, choose **GitHub Actions** (not “Deploy from a branch”).
4. Run the workflow once (push or **Actions → Deploy frontend to GitHub Pages → Run workflow**).

Your site URL will look like:

- User/org site: `https://<username>.github.io/<repo>/`  
- The browser **Origin** for CORS is always `https://<username>.github.io` (no path).

### Point the UI at your API

Edit [`frontend/config.js`](frontend/config.js) **before** or **after** deploy:

```javascript
window.__TRIVIA_API_BASE__ = "https://your-backend-host.example.com";
```

Use the public **https** URL with **no trailing slash**. Commit and push so Pages picks it up.

---

## 2. Backend — recommended: [Render](https://render.com) (free tier)

**Why Render:** Free web service, connects to GitHub, supports **Docker**, and can install **FFmpeg** in the image. That matches this app better than a bare Python buildpack alone.

**Caveats (any free tier):**

- Instances **spin down** when idle; first request can be slow (cold start).
- **RAM** may be tight for Whisper; if the process OOMs, upgrade the instance or use a smaller `WHISPER_MODEL_SIZE`.
- **Twitch** sometimes blocks or degrades traffic from cloud IPs; if streams fail, try another region or a home/VPS server.

### Steps (Render)

1. Create a **Web Service** from this repo.
2. Set **Root Directory** empty; use the **Dockerfile** at the repository root ([`Dockerfile`](Dockerfile)).
3. **Instance type:** Free (or paid if you need more RAM).
4. Add environment variables:
   - `OPENAI_API_KEY` — required
   - `CORS_ORIGINS` — your GitHub Pages origin, e.g. `https://yourusername.github.io`  
     (comma-separate multiple origins if needed)
5. Deploy. Note the service URL (e.g. `https://trivia-api.onrender.com`).
6. Put that URL into `frontend/config.js` as `__TRIVIA_API_BASE__`, commit, and let Pages redeploy.

Render sets `PORT`; the Docker `CMD` already uses it. The API image does not bundle `frontend/` (by design).

### Health check

Configure Render’s health check path to `/health` if the dashboard offers it.

---

## 3. Alternatives (still free or cheap)

| Host | Notes |
|------|--------|
| **Fly.io** | Generous free allowance; you ship the same Dockerfile; slightly more CLI/setup than Render. |
| **Google Cloud Run** | Free tier with limits; needs container + GCP account; cold starts. |
| **Oracle Cloud “Always Free” ARM** | Powerful VM if you accept setup complexity; good when Twitch blocks smaller PaaS IPs. |

---

## 4. Checklist

- [ ] Backend deployed with HTTPS URL
- [ ] `CORS_ORIGINS` includes `https://<you>.github.io` (exact origin the browser sends)
- [ ] `frontend/config.js` has `__TRIVIA_API_BASE__` set to that backend URL (no trailing slash)
- [ ] GitHub Pages enabled with **GitHub Actions** as source
- [ ] Workflow ran successfully

---

## 5. Local dev (unchanged)

From `backend/`:

```bash
python run.py
```

Open `http://localhost:8000` and keep `config.js` as `__TRIVIA_API_BASE__ = ""` for same-origin requests.
