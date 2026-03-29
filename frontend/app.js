// ── API helpers ─────────────────────────────────────────────────────────────

const API_BASE =
  typeof window.__TRIVIA_API_BASE__ === "string"
    ? window.__TRIVIA_API_BASE__.replace(/\/$/, "")
    : "";

function apiUrl(path) {
  const p = path.startsWith("/") ? path : "/" + path;
  return API_BASE ? API_BASE + p : p;
}

/**
 * Parse the most useful error detail out of a raw response body.
 * FastAPI validation errors arrive as { detail: [{msg, ...}] }.
 */
function parseErrorDetail(bodyText) {
  try {
    const j = JSON.parse(bodyText);
    if (!j.detail) return JSON.stringify(j);
    return Array.isArray(j.detail)
      ? j.detail.map((d) => d.msg || d).join(" ")
      : String(j.detail);
  } catch (_) {
    return bodyText;
  }
}

// ── DOM references ───────────────────────────────────────────────────────────

const statusEl      = document.getElementById("status");
const transcriptEl  = document.getElementById("transcript");
const urlInput      = document.getElementById("twitchUrl");
const progressWrap  = document.getElementById("progress-wrap");
const progressBar   = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-countdown");
const btnStart      = document.getElementById("btnStart");
const btnStartLabel = document.getElementById("btnStartLabel");
const btnStop       = document.getElementById("btnStop");

// ── Status bar ───────────────────────────────────────────────────────────────

function setStatus(msg, type) {
  statusEl.innerHTML = msg ? `<span class="status-dot"></span>${msg}` : "";
  statusEl.className = type ?? "";
}

// ── Button states ─────────────────────────────────────────────────────────────

function setStartBtn(state) {
  // state: "idle" | "connecting" | "running"
  if (state === "connecting") {
    btnStart.disabled = true;
    btnStart.classList.add("is-loading");
    btnStartLabel.textContent = "Connecting…";
    btnStop.disabled = true;
  } else if (state === "running") {
    btnStart.disabled = true;
    btnStart.classList.remove("is-loading");
    btnStartLabel.textContent = "Start Session";
    btnStop.disabled = false;
  } else {
    btnStart.disabled = false;
    btnStart.classList.remove("is-loading");
    btnStartLabel.textContent = "Start Session";
    btnStop.disabled = false;
  }
}

// ── Transcript ───────────────────────────────────────────────────────────────

function clearTranscript() {
  transcriptEl.textContent = "";
}

function appendTranscript(text) {
  transcriptEl.appendChild(document.createTextNode(text + "\n\n"));
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// ── Progress bar ─────────────────────────────────────────────────────────────

const DEFAULT_OVERLAP_SECONDS = 15;
let overlapDuration = DEFAULT_OVERLAP_SECONDS;
let countdownTimer  = null;
let secondsLeft     = 0;

async function fetchSessionConfig() {
  try {
    const res = await fetch(apiUrl("/api/config"));
    if (res.ok) {
      const cfg = await res.json();
      overlapDuration = cfg.overlap_duration ?? DEFAULT_OVERLAP_SECONDS;
    }
  } catch (_) {
    // Fall back to default — progress bar still works
  }
}

function startCountdown() {
  stopCountdown();
  progressBar.classList.remove("is-indeterminate");
  secondsLeft = overlapDuration;
  progressWrap.hidden = false;
  tickCountdown();

  countdownTimer = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    tickCountdown();
  }, 1000);
}

function tickCountdown() {
  const pct = (secondsLeft / overlapDuration) * 100;
  progressBar.style.width = pct + "%";
  progressLabel.textContent = secondsLeft + "s";
}

function showWarmupBar() {
  stopCountdown();
  progressBar.style.width = "35%";
  progressBar.classList.add("is-indeterminate");
  progressLabel.textContent = "warming up…";
  progressWrap.hidden = false;
}

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  progressBar.classList.remove("is-indeterminate");
  progressWrap.hidden = true;
}

// ── EventSource (SSE stream) ─────────────────────────────────────────────────

let activeStream = null;

function closeStream() {
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }
  stopCountdown();
}

function openStream() {
  closeStream();
  showWarmupBar();

  let firstSegment = true;
  activeStream = new EventSource(apiUrl("/api/transcription/stream"));

  activeStream.onmessage = function (ev) {
    try {
      const data = JSON.parse(ev.data);
      if (data && typeof data.text === "string") {
        if (firstSegment) {
          firstSegment = false;
          setStatus("Running — transcription lines appear below.", "success");
          setStartBtn("running");
        }
        appendTranscript(data.text);
        startCountdown();
      }
    } catch (_) {
      setStatus("Bad event data from server.", "error");
    }
  };

  activeStream.onerror = function () {
    setStatus("Stream disconnected (stopped or network error).", "error");
    setStartBtn("idle");
    closeStream();
  };
}

// ── Button handlers ──────────────────────────────────────────────────────────

async function handleStart() {
  setStatus("");
  const twitchUrl = urlInput.value.trim();
  if (!twitchUrl) {
    setStatus("Enter a Twitch URL.", "error");
    return;
  }

  setStartBtn("connecting");
  setStatus("Connecting to stream…");

  try {
    const res = await fetch(apiUrl("/api/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twitch_url: twitchUrl }),
    });

    if (!res.ok) {
      const detail = parseErrorDetail(await res.text());
      setStatus(`Start failed (${res.status}): ${detail}`, "error");
      setStartBtn("idle");
      return;
    }

    clearTranscript();
    setStatus("Warming up — processing first audio window…");
    openStream();
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
    setStartBtn("idle");
  }
}

async function handleStop() {
  closeStream();
  setStartBtn("idle");

  try {
    const res = await fetch(apiUrl("/api/stop"), { method: "POST" });

    if (!res.ok) {
      const detail = parseErrorDetail(await res.text());
      setStatus(`Stop failed (${res.status}): ${detail}`, "error");
      return;
    }

    setStatus("Stopped.");
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
  }
}

// ── Initialise ───────────────────────────────────────────────────────────────

fetchSessionConfig();
btnStart.addEventListener("click", handleStart);
btnStop.addEventListener("click", handleStop);
