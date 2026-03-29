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

const questionHourEl     = document.getElementById("questionHour");
const questionNumberEl   = document.getElementById("questionNumber");
const questionTextEl     = document.getElementById("questionText");
const btnUseSelection    = document.getElementById("btnUseSelection");
const btnCopyQuestion    = document.getElementById("btnCopyQuestion");
const captureFeedbackEl  = document.getElementById("captureFeedback");

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

/**
 * Returns trimmed text currently selected inside the live transcript, or empty string if none / selection is outside the box.
 *
 * @returns {string}
 */
function getSelectedTextInTranscript() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = sel.getRangeAt(0);
  if (!transcriptEl.contains(range.commonAncestorContainer)) return "";
  const text = sel.toString();
  return typeof text === "string" ? text.trim() : "";
}

/**
 * Shows short feedback under the captured-question controls (or hides it when msg is empty).
 *
 * @param {string} msg - Message to show, or "" to clear.
 * @param {"error"|"success"|""} [type] - Visual style; ignored when msg is empty.
 */
function setCaptureFeedback(msg, type) {
  if (!msg) {
    captureFeedbackEl.textContent = "";
    captureFeedbackEl.className = "capture-feedback";
    captureFeedbackEl.hidden = true;
    return;
  }
  captureFeedbackEl.hidden = false;
  captureFeedbackEl.textContent = msg;
  captureFeedbackEl.className =
    "capture-feedback " + (type === "success" ? "is-success" : "is-error");
}

/**
 * Copies highlighted transcript text into the question textarea. Shows feedback if nothing is selected.
 */
function handleUseSelectionAsQuestion() {
  const selected = getSelectedTextInTranscript();
  if (!selected) {
    setCaptureFeedback(
      "Select text in the Live Transcript box first, then click again.",
      "error"
    );
    return;
  }
  questionTextEl.value = selected;
  setCaptureFeedback("Question text updated from your selection.", "success");
}

/**
 * Builds a single string with optional hour / question number header and the question body for clipboard or sharing.
 *
 * @returns {string}
 */
function buildFormattedQuestionBlock() {
  const hour = String(questionHourEl.value ?? "").trim();
  const num = String(questionNumberEl.value ?? "").trim();
  const body = String(questionTextEl.value ?? "").trim();
  const headerParts = [];
  if (hour) headerParts.push("Hour: " + hour);
  if (num) headerParts.push("Q: " + num);
  const header = headerParts.length ? headerParts.join(" | ") : "";
  if (header && body) return header + "\n\n" + body;
  if (header) return header;
  return body;
}

/**
 * Copies the formatted question (hour, Q#, and text) to the clipboard. Uses plain text only.
 */
async function handleCopyFormattedQuestion() {
  const block = buildFormattedQuestionBlock();
  if (!block) {
    setCaptureFeedback("Nothing to copy — add question text or hour / number.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(block);
    setCaptureFeedback("Copied to clipboard.", "success");
  } catch {
    setCaptureFeedback(
      "Could not copy (clipboard permission or browser support).",
      "error"
    );
  }
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
btnUseSelection.addEventListener("click", handleUseSelectionAsQuestion);
btnCopyQuestion.addEventListener("click", handleCopyFormattedQuestion);
