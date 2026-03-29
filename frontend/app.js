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
const btnSaveToLog       = document.getElementById("btnSaveToLog");
const captureFeedbackEl  = document.getElementById("captureFeedback");
const questionLogEl      = document.getElementById("questionLog");
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

/** Must match backend ``SlidingWindowProcessor.NO_AUDIO_CHUNK_MESSAGE``. */
const NO_AUDIO_CHUNK_TEXT = "[no audio this chunk]";

/**
 * If the gap between SSE chunks exceeds the usual overlap interval plus this many
 * milliseconds, insert a line break before the next segment (detects stalls / pauses).
 */
const PAUSE_BEYOND_OVERLAP_MS = 3000;

const DEFAULT_OVERLAP_SECONDS = 15;
/** Server overlap window (seconds); used for progress bar and pause-vs-flow transcript spacing. */
let overlapDuration = DEFAULT_OVERLAP_SECONDS;

/** Wall time of the previous transcript chunk (for pause detection). */
let lastTranscriptChunkAt = null;

function clearTranscript() {
  transcriptEl.textContent = "";
  lastTranscriptChunkAt = null;
}

/**
 * Appends a transcript segment. Normal chunks use a space when the next chunk
 * arrives on schedule; a line break is used when the gap is unusually long (pause)
 * or when showing the server “no audio” placeholder (with blank lines around it).
 *
 * @param {string} text - Segment text from SSE.
 */
function appendTranscript(text) {
  const chunk = String(text ?? "").trim();
  if (!chunk) return;
  const isNoAudioMarker = chunk === NO_AUDIO_CHUNK_TEXT;
  const now = Date.now();

  if (transcriptEl.textContent.length > 0) {
    const gap = lastTranscriptChunkAt != null ? now - lastTranscriptChunkAt : 0;
    const expectedMs = Math.max(1, overlapDuration) * 1000;
    const longPause =
      lastTranscriptChunkAt != null && gap >= expectedMs + PAUSE_BEYOND_OVERLAP_MS;

    let sep;
    if (longPause) {
      sep = "\n";
    } else if (isNoAudioMarker) {
      sep = "\n";
    } else {
      sep = " ";
    }
    transcriptEl.appendChild(document.createTextNode(sep));
  }

  if (isNoAudioMarker) {
    const span = document.createElement("span");
    span.className = "transcript-no-audio";
    span.textContent = chunk;
    transcriptEl.appendChild(span);
    transcriptEl.appendChild(document.createTextNode("\n"));
  } else {
    transcriptEl.appendChild(document.createTextNode(chunk));
  }

  lastTranscriptChunkAt = Date.now();
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

/**
 * Collapses line breaks and extra spaces from transcript clips into one flowing line of words
 * (browser still wraps in the textarea).
 *
 * @param {string} raw - Selected or pasted transcript text.
 * @returns {string}
 */
function normalizeTranscriptSnippetForQuestion(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
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
  questionTextEl.value = normalizeTranscriptSnippetForQuestion(selected);
  setCaptureFeedback("Question text updated from your selection.", "success");
}

// ── Shared question log (server-backed, all viewers) ─────────────────────────

/** @type {ReturnType<typeof setInterval> | null} */
let questionLogPollTimer = null;

/**
 * Parses hour and question number from the form; returns nulls if invalid or missing.
 *
 * @returns {{ hour: number, questionNumber: number } | null}
 */
function parseHourAndQuestionNumber() {
  const hourRaw = String(questionHourEl.value ?? "").trim();
  const qRaw = String(questionNumberEl.value ?? "").trim();
  if (!hourRaw || !qRaw) return null;
  const hour = parseInt(hourRaw, 10);
  const questionNumber = parseInt(qRaw, 10);
  if (!Number.isFinite(hour) || hour < 1) return null;
  if (!Number.isFinite(questionNumber) || questionNumber < 1) return null;
  return { hour, questionNumber };
}

/**
 * Renders the shared log: hours as sections, questions ordered by Q# within each hour.
 *
 * @param {Array<{ hour: number, question_number: number, text: string, updated_at: string }>} questions
 */
function renderQuestionLog(questions) {
  questionLogEl.innerHTML = "";
  if (!questions || questions.length === 0) {
    const p = document.createElement("p");
    p.className = "question-log-empty";
    p.textContent =
      "No questions saved yet. Set hour and Q#, add text, then click “Save to shared log”.";
    questionLogEl.appendChild(p);
    return;
  }

  const byHour = new Map();
  for (const q of questions) {
    const h = q.hour;
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h).push(q);
  }

  const hoursSorted = [...byHour.keys()].sort((a, b) => a - b);
  for (const h of hoursSorted) {
    const section = document.createElement("section");
    section.className = "question-log-hour";

    const title = document.createElement("h3");
    title.className = "question-log-hour-title";
    title.textContent = "Hour " + h;
    section.appendChild(title);

    const list = byHour.get(h).slice();
    list.sort((a, b) => a.question_number - b.question_number);
    for (const item of list) {
      const row = document.createElement("div");
      row.className = "question-log-item";

      const meta = document.createElement("div");
      meta.className = "question-log-meta";
      meta.textContent = "Q" + item.question_number;

      const body = document.createElement("div");
      body.className = "question-log-body";
      body.textContent = item.text;

      row.appendChild(meta);
      row.appendChild(body);

      if (item.updated_at) {
        const ts = document.createElement("div");
        ts.className = "question-log-updated";
        ts.textContent = "Updated " + item.updated_at;
        row.appendChild(ts);
      }

      section.appendChild(row);
    }

    questionLogEl.appendChild(section);
  }
}

/**
 * Fetches the current question list from the API and re-renders the panel.
 */
async function refreshQuestionLog() {
  const res = await fetch(apiUrl("/api/questions"));
  if (!res.ok) return;
  const data = await res.json();
  renderQuestionLog(data.questions);
}

/**
 * Starts polling the question log so all open tabs stay in sync.
 */
function startQuestionLogPolling() {
  stopQuestionLogPolling();
  questionLogPollTimer = setInterval(function () {
    refreshQuestionLog().catch(function () {
      /* ignore transient errors */
    });
  }, 2500);
}

/**
 * Stops background polling (e.g. when leaving the page).
 */
function stopQuestionLogPolling() {
  if (questionLogPollTimer !== null) {
    clearInterval(questionLogPollTimer);
    questionLogPollTimer = null;
  }
}

/**
 * Saves the current captured question to the server log. Prompts before overwriting the same hour/Q#.
 */
async function handleSaveToSharedLog() {
  const parsed = parseHourAndQuestionNumber();
  if (!parsed) {
    setCaptureFeedback(
      "Enter a valid Hour and Question # (both at least 1) before saving.",
      "error"
    );
    return;
  }
  const text = String(questionTextEl.value ?? "").trim();
  if (!text) {
    setCaptureFeedback("Add question text (or use selection from the transcript) before saving.", "error");
    return;
  }

  let existing = [];
  try {
    const res = await fetch(apiUrl("/api/questions"));
    if (res.ok) {
      const data = await res.json();
      existing = data.questions || [];
    }
  } catch {
    setCaptureFeedback("Could not check existing questions (network).", "error");
    return;
  }

  const clash = existing.some(function (e) {
    return e.hour === parsed.hour && e.question_number === parsed.questionNumber;
  });
  if (clash) {
    const ok = window.confirm(
      "A question is already saved for Hour " +
        parsed.hour +
        ", Q" +
        parsed.questionNumber +
        ". Replace it with the text in the box?"
    );
    if (!ok) return;
  }

  try {
    const res = await fetch(apiUrl("/api/questions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hour: parsed.hour,
        question_number: parsed.questionNumber,
        text: text,
      }),
    });
    if (!res.ok) {
      const detail = parseErrorDetail(await res.text());
      setCaptureFeedback("Save failed (" + res.status + "): " + detail, "error");
      return;
    }
    const out = await res.json();
    if (out.overwritten) {
      setCaptureFeedback("Saved (replaced previous text for this hour and Q#).", "success");
    } else {
      setCaptureFeedback("Saved to shared question log.", "success");
    }
    await refreshQuestionLog();
  } catch (err) {
    setCaptureFeedback("Network error: " + err.message, "error");
  }
}

// ── Progress bar ─────────────────────────────────────────────────────────────

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

// ── Progress bar ─────────────────────────────────────────────────────────────

const DEFAULT_AUDIO_WINDOW_SECONDS    = 30;
const DEFAULT_SEGMENT_INTERVAL_SECONDS = 15;
let audioWindowSeconds    = DEFAULT_AUDIO_WINDOW_SECONDS;
let segmentIntervalSeconds = DEFAULT_SEGMENT_INTERVAL_SECONDS;
let countdownTimer = null;
let secondsLeft    = 0;

async function fetchSessionConfig() {
  try {
    const res = await fetch(apiUrl("/api/config"));
    if (res.ok) {
      const cfg = await res.json();
      audioWindowSeconds    = cfg.audio_window_seconds    ?? DEFAULT_AUDIO_WINDOW_SECONDS;
      segmentIntervalSeconds = cfg.segment_interval_seconds ?? DEFAULT_SEGMENT_INTERVAL_SECONDS;
    }
  } catch (_) {
    // Fall back to defaults — progress bar still works
  }
}

function startCountdown() {
  stopCountdown();
  progressBar.classList.remove("is-indeterminate");
  secondsLeft = audioWindowSeconds;
  progressWrap.hidden = false;
  tickCountdown();

  countdownTimer = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    tickCountdown();
  }, 1000);
}

function tickCountdown() {
  const pct = (secondsLeft / audioWindowSeconds) * 100;
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
  stopCountdown();
}

function openStream() {
  closeStream();
  showWarmupBar();

  let firstSegment = true;
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

  // Always fetch config fresh so any .env changes take effect without a page reload.
  await fetchSessionConfig();

  setStartBtn("connecting");
  setStatus("Connecting to stream…");

  // Always fetch config fresh so any .env changes take effect without a page reload.
  await fetchSessionConfig();

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
      setStartBtn("idle");
      return;
    }

    clearTranscript();
    setStatus("Warming up — processing first audio window…");
    setStatus("Warming up — processing first audio window…");
    openStream();
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
    setStartBtn("idle");
    setStartBtn("idle");
  }
}

async function handleStop() {
  closeStream();
  setStartBtn("idle");
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
refreshQuestionLog().catch(function () {});
startQuestionLogPolling();
btnStart.addEventListener("click", handleStart);
btnStop.addEventListener("click", handleStop);
btnUseSelection.addEventListener("click", handleUseSelectionAsQuestion);
btnSaveToLog.addEventListener("click", function () {
  handleSaveToSharedLog();
});
window.addEventListener("beforeunload", function () {
  stopQuestionLogPolling();
});
btnStart.addEventListener("click", handleStart);
btnStop.addEventListener("click", handleStop);
