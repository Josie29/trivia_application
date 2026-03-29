# Frontend (UI)

Static and lightweight Python UI assets for the trivia assistant. There is **no separate frontend build** (no Node bundler): the browser page is plain HTML/JS.

---

## What’s here

| File | Role |
|------|------|
| [`index.html`](index.html) | **Web UI** — Twitch URL field, Start/Stop, live transcript via Server-Sent Events; capture transcript selections (hour / Q#), **shared question log** (separate column) via `/api/questions` |
| [`config.js`](config.js) | **API base URL** — leave `""` when the UI is served with the API (local `python run.py` or Render Docker); set a full `https://…` base only if you intentionally split UI and API hosts |
| [`StatusGUI.py`](StatusGUI.py) | **Optional Tkinter window** — shows hour, question count, and a simple LIVE status when wired to a `SlidingWindowProcessor` (not used by `main.py` or the API out of the box) |

---

## Web UI (`index.html`)

The FastAPI app in [`../backend/`](../backend/) mounts this directory at the site root. After you start the server from `backend/`:

```bash
cd ../backend
python run.py
```

Open `http://localhost:8000` — the browser loads `index.html` from this folder (same origin as `/api/...`). Keep [`config.js`](config.js) as `__TRIVIA_API_BASE__ = ""` so requests stay relative.

### Production (Render)

The root [`Dockerfile`](../Dockerfile) copies this folder into the image; FastAPI serves it at `/` on your Render URL. Use `__TRIVIA_API_BASE__ = ""` in [`config.js`](config.js). See [`../DEPLOY.md`](../DEPLOY.md).

The page calls:

- `POST /api/start` with `{ "twitch_url": "..." }`
- `GET /api/transcription/stream` (EventSource)
- `POST /api/stop`
- `GET /api/questions` and `POST /api/questions` (shared log for all viewers)

Full API details, env vars, and deployment notes are in [`../backend/README.md`](../backend/README.md).

---

## Customizing

Edit `index.html` or `config.js` (and add small `.js` or `.css` files alongside if you like). Refresh the browser after changes; use a hard refresh if the browser caches aggressively.

For API shapes and status codes, see [`../backend/schemas.py`](../backend/schemas.py) and [`../backend/api.py`](../backend/api.py).
