# Frontend (UI)

Static and lightweight Python UI assets for the trivia assistant. There is **no separate frontend build** (no Node bundler): the browser page is plain HTML/JS.

---

## What’s here

| File | Role |
|------|------|
| [`index.html`](index.html) | **Web UI** — Twitch URL field, Start/Stop, live transcript via Server-Sent Events |
| [`StatusGUI.py`](StatusGUI.py) | **Optional Tkinter window** — shows hour, question count, and a simple LIVE status when wired to a `SlidingWindowProcessor` (not used by `main.py` or the API out of the box) |

---

## Web UI (`index.html`)

The FastAPI app in [`../backend/`](../backend/) mounts this directory at the site root. After you start the server from `backend/`:

```bash
cd ../backend
python run.py
```

Open `http://localhost:8000` — the browser loads `index.html` from this folder (same origin as `/api/...`), so no CORS setup is required for normal use.

The page calls:

- `POST /api/start` with `{ "twitch_url": "..." }`
- `GET /api/transcription/stream` (EventSource)
- `POST /api/stop`

Full API details, env vars, and deployment notes are in [`../backend/README.md`](../backend/README.md).

---

## Customizing

Edit `index.html` (and add small `.js` or `.css` files alongside if you like). Refresh the browser after changes; use a hard refresh if the browser caches aggressively.

For API shapes and status codes, see [`../backend/schemas.py`](../backend/schemas.py) and [`../backend/api.py`](../backend/api.py).
