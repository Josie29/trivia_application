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

const statusEl     = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const urlInput     = document.getElementById("twitchUrl");

// ── Status bar ───────────────────────────────────────────────────────────────

function setStatus(msg, type) {
  statusEl.innerHTML = msg ? `<span class="status-dot"></span>${msg}` : "";
  statusEl.className = type ?? "";
}

// ── Transcript ───────────────────────────────────────────────────────────────

function clearTranscript() {
  transcriptEl.textContent = "";
}

function appendTranscript(text) {
  transcriptEl.appendChild(document.createTextNode(text + "\n\n"));
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// ── EventSource (SSE stream) ─────────────────────────────────────────────────

let activeStream = null;

function closeStream() {
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }
}

function openStream() {
  closeStream();
  activeStream = new EventSource(apiUrl("/api/transcription/stream"));

  activeStream.onmessage = function (ev) {
    try {
      const data = JSON.parse(ev.data);
      if (data && typeof data.text === "string") appendTranscript(data.text);
    } catch (_) {
      setStatus("Bad event data from server.", "error");
    }
  };

  activeStream.onerror = function () {
    setStatus("Stream disconnected (stopped or network error).", "error");
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

  try {
    const res = await fetch(apiUrl("/api/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twitch_url: twitchUrl }),
    });

    if (!res.ok) {
      const detail = parseErrorDetail(await res.text());
      setStatus(`Start failed (${res.status}): ${detail}`, "error");
      return;
    }

    clearTranscript();
    setStatus("Running — transcription lines appear below.", "success");
    openStream();
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
  }
}

async function handleStop() {
  closeStream();

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

document.getElementById("btnStart").addEventListener("click", handleStart);
document.getElementById("btnStop").addEventListener("click", handleStop);
