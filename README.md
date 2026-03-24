# Trivia Transcription Assistant

Capture live Twitch trivia audio, transcribe with Faster-Whisper, extract questions with OpenAI, and save structured rows to Excel—optionally driven from the terminal or from a minimal browser UI.

---

## Features

- Live Twitch ingest (Streamlink + FFmpeg), no manual audio routing
- Real-time transcription (Faster-Whisper) with sliding windows and VAD-friendly settings
- Question extraction (OpenAI) with hour/number/picture-question hints
- Transcription- and question-level deduplication
- Excel workbook output (`data/trivia_questions.xlsx` when run with `backend/` as cwd)
- **CLI** (`backend/main.py`) or **browser** UI (static files under `frontend/`, served by FastAPI locally or with the API in one Docker image on Render)

---

## Deploy (Render — UI + API together)

**[Render](https://render.com)** Web Service using the repo-root [`Dockerfile`](Dockerfile) ships **backend and `frontend/`** in one container (same URL, FFmpeg included). Keep `frontend/config.js` as `__TRIVIA_API_BASE__ = ""`. Step-by-step: [**DEPLOY.md**](DEPLOY.md).

---

## How it works

```text
LIVE TWITCH (audio) → Streamlink → FFmpeg → PCM queue
    → Sliding-window chunks → Whisper → dedupe (transcript)
    → OpenAI extraction → dedupe (question) → Excel sheets by hour
```

**Rough timeline:** a question may show up in Excel on the order of tens of seconds after it is spoken (depends on window overlap, model speed, and API latency).

---

## Getting started

1. **Clone** this repo and `cd` into `trivia_application/`.
2. **Install and configure the Python backend** — follow [**backend/README.md**](backend/README.md) (venv, `pip install -r requirements.txt`, `.env`, FFmpeg).
3. **Pick how you run it:**
   - **Terminal:** from `backend/`, run `python main.py` (needs `TWITCH_CHANNEL_URL` in `.env`).
   - **Browser:** from `backend/`, run `python run.py`, then open `http://localhost:8000`. Details in **backend** and **frontend** READMEs.

You need **Python 3.8+**, **FFmpeg**, and an **OpenAI API key**. See [backend/README.md](backend/README.md) for versions, env vars, and troubleshooting.

---

## Configuration (overview)

Environment variables are read from a `.env` file—place it in **`backend/`** if you start the app from there (recommended). The CLI requires a Twitch URL in env; the web server can take the URL from the form instead. Full variable list and validation rules: [**backend/README.md**](backend/README.md#3-environment-file).

---

## Repository layout

```text
trivia_application/
  README.md                 ← You are here (product overview & navigation)
  DEPLOY.md                 ← Render (Docker, full web app)
  backend/README.md         ← Install, run, API, env, troubleshooting
  frontend/README.md        ← Web files, config.js, Render notes
  backend/                  ← Python: CLI, FastAPI, core pipeline, tests
  frontend/                 ← index.html (+ optional StatusGUI.py)
```

---

## More detail by area

| Topic | Document |
|--------|-----------|
| Install, `.env`, CLI vs `run.py`, HTTP API, workers, layout | [backend/README.md](backend/README.md) |
| `index.html`, `config.js`, EventSource, Tkinter helper | [frontend/README.md](frontend/README.md) |
| Production: Render (Docker) | [DEPLOY.md](DEPLOY.md) |

---

## Contributing / license

Contributing guidelines and license are not defined in this repo yet; add them here when you adopt a policy.
