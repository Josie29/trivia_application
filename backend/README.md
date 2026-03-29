# Backend (Python)

Python services for live Twitch capture, Faster-Whisper transcription, GPT question extraction, and Excel output. Also hosts the **FastAPI** app and serves the static web UI from [`../frontend/`](../frontend/).

**Working directory:** run all commands below from `backend/` (so `config`, `core`, and `utils` imports resolve).

---

## Prerequisites

- **Python** 3.8+ ([python.org](https://www.python.org/downloads/))
- **FFmpeg** on your PATH (`ffmpeg -version`)
  - macOS: `brew install ffmpeg`
  - Windows: `choco install ffmpeg` or [ffmpeg.org](https://ffmpeg.org/download.html)
  - Linux: `sudo apt install ffmpeg`
- **OpenAI API key** for question extraction ([platform.openai.com](https://platform.openai.com/))

Rough resource needs: ~2GB+ RAM (4GB+ better), multi-core CPU helps Whisper; ~1GB disk for deps and cached models; stable internet for Twitch and APIs.

---

## Setup

### 1. Virtual environment (recommended)

**Windows**

```bash
python -m venv .venv
.venv\Scripts\activate
```

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Dependencies

```bash
pip install -r requirements.txt
```

Notable packages: `streamlink`, `faster-whisper`, `openai`, `openpyxl`, `fastapi`, `uvicorn`.

### 3. Environment file

Create `.env` in **`backend/`** (recommended, since `load_dotenv()` uses the current working directory when you run from here):

```bash
# Required for CLI and API
OPENAI_API_KEY=sk-...

# Required for CLI only (main.py); optional for API if you use the browser URL field
TWITCH_CHANNEL_URL=https://www.twitch.tv/your_channel

# Optional (defaults shown)
WHISPER_MODEL_SIZE=base
WHISPER_DEVICE=cpu
WINDOW_DURATION=30
OVERLAP_DURATION=15
LOG_LEVEL=INFO

# Optional: extra browser origins if UI and API are on different hosts (comma-separated, no spaces)
# CORS_ORIGINS=https://your-custom-domain.com
```

- **`main.py`** calls `Config.validate()` — needs `OPENAI_API_KEY` and `TWITCH_CHANNEL_URL`.
- **`run.py`** calls `Config.validate_for_api()` — needs `OPENAI_API_KEY` only; Twitch URL comes from the client.
- **`CORS_ORIGINS`** — optional; merged with localhost defaults and, on Render, **`RENDER_EXTERNAL_URL`** (set automatically by Render). Add entries only if the UI is served from another host (e.g. a custom domain that does not match `RENDER_EXTERNAL_URL`). Use the exact `Origin`: `https`, host only, no trailing slash.

### 4. First run

The first transcription loads a Whisper model (e.g. ~140MB for `base`); it is cached for later runs.

---

## How to run

### CLI assistant

```bash
python main.py
```

Interactive commands (`h N`, `status`, `stop`) are documented in the running app. Output includes `data/trivia_questions.xlsx` under the process working directory (paths in `config.py` are relative to cwd — keep cwd as `backend/`).

### Web server (API + static UI)

```bash
python run.py
```

Then open `http://localhost:8000` (serves [`../frontend/index.html`](../frontend/index.html)).

Equivalent without reload:

```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

#### HTTP API (summary)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `POST` | `/api/start` | Body: `{"twitch_url": "https://www.twitch.tv/..."}` |
| `POST` | `/api/stop` | Stop session |
| `GET` | `/api/transcription/stream` | SSE: JSON lines `{"text": "..."}` |

**Deployment:** One in-memory session and background threads — use **one Uvicorn worker** (e.g. `--workers 1`) until you add shared state. Twitch access may fail from some cloud datacenters; home/VPS often works better.

**Production:** deploy the full app on **Render** with the repo-root [`../Dockerfile`](../Dockerfile) (bundles `../frontend/`). See [`../DEPLOY.md`](../DEPLOY.md).

Pydantic models live in [`schemas.py`](schemas.py). Route wiring in [`api.py`](api.py).

---

## Layout (this folder)

```text
backend/
  main.py           # CLI entry
  run.py            # Dev server: validate_for_api + uvicorn
  api.py            # FastAPI app
  schemas.py        # Request/response + SSE payload models
  config.py
  requirements.txt
  core/             # Capture, Whisper, sliding window, extraction, Excel
  utils/
  tests/
```

---

## Troubleshooting

- **Import errors** — Run from `backend/`, not the repo root.
- **FFmpeg / streamlink** — Confirm `ffmpeg` and `streamlink` work on the shell you use to start the app.
- **Twitch errors** — Stream must be live; URL must be a normal channel URL. Some networks block or throttle Twitch.
- **OpenAI errors** — Check `OPENAI_API_KEY` and billing/limits.

### Corporate proxy / Zscaler (SSL errors from Streamlink)

If you see TLS errors such as `CERTIFICATE_VERIFY_FAILED` or `unable to get local issuer certificate` when connecting to Twitch, your HTTPS traffic may be re-signed by a corporate proxy (e.g. Zscaler). Browsers often work because they trust the corporate root via the OS; Python does not unless you supply a combined CA bundle (see `.env.example` and `SSL_CERT_FILE`).

For **local debugging only**, you can disable TLS verification for Streamlink by adding the following to **`backend/.env`** (never enable this in production or committed shared configs):

```env
# Local debugging only — disables TLS verification for Streamlink (do not use in production)
TWITCH_STREAMLINK_INSECURE_SSL=1
```

For product-level architecture and Excel behavior, see the [root README](../README.md).
