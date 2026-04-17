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
const questionLogHoursPerPageEl = document.getElementById(
  "questionLogHoursPerPage"
);
const questionLogPrevEl  = document.getElementById("questionLogPrev");
const questionLogNextEl  = document.getElementById("questionLogNext");
const questionLogPageMetaEl = document.getElementById("questionLogPageMeta");
const questionLogJumpHourEl = document.getElementById("questionLogJumpHour");
const questionLogGoHourEl = document.getElementById("questionLogGoHour");

// ── Status bar ───────────────────────────────────────────────────────────────

function setStatus(msg, type) {
  statusEl.innerHTML = msg ? `<span class="status-dot"></span>${msg}` : "";
  statusEl.className = type ?? "";
}

// ── Session timer ─────────────────────────────────────────────────────────────

let sessionStartTime = null;
let sessionTimerInterval = null;

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function startSessionTimer() {
  stopSessionTimer();
  sessionStartTime = Date.now();
  sessionTimerInterval = setInterval(function () {
    const elapsed = formatDuration(Date.now() - sessionStartTime);
    statusEl.innerHTML = `<span class="status-dot"></span>Running — transcription lines appear below. <span class="session-timer">${elapsed}</span>`;
  }, 1000);
}

function stopSessionTimer() {
  if (sessionTimerInterval !== null) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
}

function getSessionDuration() {
  if (sessionStartTime === null) return null;
  return Date.now() - sessionStartTime;
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
    btnStop.disabled = true;
  }
}

// ── Transcript ───────────────────────────────────────────────────────────────

/** Must match backend ``SlidingWindowProcessor.NO_AUDIO_CHUNK_MESSAGE``. */
const NO_AUDIO_CHUNK_TEXT = "[no audio this chunk]";

/**
 * If the gap between SSE chunks exceeds the usual segment interval plus this many
 * milliseconds, insert a line break before the next segment (detects stalls / pauses).
 */
const PAUSE_BEYOND_OVERLAP_MS = 3000;

const DEFAULT_SEGMENT_INTERVAL_SECONDS = 15;
const DEFAULT_AUDIO_WINDOW_SECONDS = 30;
/** Seconds between transcription triggers (matches server ``SEGMENT_INTERVAL_SECONDS``). */
let segmentIntervalSeconds = DEFAULT_SEGMENT_INTERVAL_SECONDS;
/** Seconds of audio per Whisper window (matches ``AUDIO_WINDOW_SECONDS``). */
let audioWindowSeconds = DEFAULT_AUDIO_WINDOW_SECONDS;

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
    const expectedMs = Math.max(1, segmentIntervalSeconds) * 1000;
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

/** Maximum trivia hour supported in the UI and API (long contests). */
const QUESTION_LOG_MAX_HOUR = 56;

/**
 * Largest "Hours per page" value in the toolbar (must not use {@link QUESTION_LOG_MAX_HOUR} here:
 * capping page size at 56 makes a single page span every hour, so "pagination" disappears).
 */
const QUESTION_LOG_MAX_HOURS_PER_PAGE = 14;

/** @type {ReturnType<typeof setInterval> | null} */
let questionLogPollTimer = null;

/** @type {Array<{ hour: number, question_number: number, text: string, updated_at: string }>} */
let questionLogCachedQuestions = [];

/** @type {number} */
let questionLogPageIndex = 0;

/** @type {number} */
let questionLogHoursPerPage = 8;

/**
 * Normalizes hours-per-page so range math never sees NaN (which would show every hour).
 *
 * @param {number} n - Raw numeric value (may be NaN).
 * @returns {number}
 */
function sanitizeQuestionLogHoursPerPage(n) {
  if (!Number.isFinite(n) || n < 1) {
    return 8;
  }
  return Math.min(Math.floor(n), QUESTION_LOG_MAX_HOURS_PER_PAGE);
}

/**
 * Reads the Hours per page control; falls back to 8 when missing or invalid.
 *
 * @returns {number}
 */
function getQuestionLogHoursPerPage() {
  const el = document.getElementById("questionLogHoursPerPage");
  if (!el) {
    return sanitizeQuestionLogHoursPerPage(questionLogHoursPerPage);
  }
  const raw = parseInt(String(el.value).trim(), 10);
  return sanitizeQuestionLogHoursPerPage(raw);
}

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
  if (!Number.isFinite(hour) || hour < 1 || hour > QUESTION_LOG_MAX_HOUR) {
    return null;
  }
  if (!Number.isFinite(questionNumber) || questionNumber < 1) return null;
  return { hour, questionNumber };
}

/**
 * Returns inclusive hour range [start, end] for a zero-based page index.
 *
 * @param {number} pageIndex - Zero-based page.
 * @param {number} hoursPerPage - Hours shown per page (>= 1).
 * @returns {{ start: number, end: number }}
 */
function questionLogHourRangeForPage(pageIndex, hoursPerPage) {
  const start = pageIndex * hoursPerPage + 1;
  const end = Math.min(QUESTION_LOG_MAX_HOUR, start + hoursPerPage - 1);
  return { start, end };
}

/**
 * Total pages when slicing the fixed hour span 1..QUESTION_LOG_MAX_HOUR.
 *
 * @param {number} hoursPerPage - Hours per page (>= 1).
 * @returns {number}
 */
function questionLogTotalPages(hoursPerPage) {
  return Math.max(1, Math.ceil(QUESTION_LOG_MAX_HOUR / hoursPerPage));
}

/**
 * Zero-based page index that contains the given hour.
 *
 * @param {number} hour - Hour in 1..QUESTION_LOG_MAX_HOUR.
 * @param {number} hoursPerPage
 * @returns {number}
 */
function questionLogPageForHour(hour, hoursPerPage) {
  return Math.floor((hour - 1) / hoursPerPage);
}

/**
 * Clamps {@link questionLogPageIndex} to valid pages for the current hours-per-page.
 */
function clampQuestionLogPageIndex() {
  const hpp = getQuestionLogHoursPerPage();
  const maxIdx = questionLogTotalPages(hpp) - 1;
  if (questionLogPageIndex > maxIdx) questionLogPageIndex = maxIdx;
  if (questionLogPageIndex < 0) questionLogPageIndex = 0;
}

/**
 * Updates pagination labels and Previous/Next disabled state.
 */
function updateQuestionLogToolbar() {
  const hpp = getQuestionLogHoursPerPage();
  const total = questionLogTotalPages(hpp);
  const range = questionLogHourRangeForPage(questionLogPageIndex, hpp);
  if (questionLogPageMetaEl) {
    questionLogPageMetaEl.textContent =
      "Page " +
      (questionLogPageIndex + 1) +
      " of " +
      total +
      " · Hours " +
      range.start +
      "–" +
      range.end;
  }
  if (questionLogPrevEl) {
    questionLogPrevEl.disabled = questionLogPageIndex <= 0;
  }
  if (questionLogNextEl) {
    questionLogNextEl.disabled = questionLogPageIndex >= total - 1;
  }
}

/**
 * Appends hour sections for the given hour keys (sorted), using data from {@link byHour}.
 *
 * @param {Map<number, Array<{ hour: number, question_number: number, text: string, updated_at: string }>>} byHour
 * @param {number[]} hoursSorted - Hour keys in display order.
 */
function renderQuestionLogHourSections(byHour, hoursSorted) {
  for (const h of hoursSorted) {
    const section = document.createElement("section");
    section.className = "question-log-hour";
    section.id = "question-log-hour-" + h;
    section.setAttribute("data-hour", String(h));

    const title = document.createElement("h3");
    title.className = "question-log-hour-title";
    title.textContent = "Hour " + h;
    section.appendChild(title);

    const list = byHour.get(h).slice();
    list.sort(function (a, b) {
      return a.question_number - b.question_number;
    });
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
 * Renders the cached log for the current page (fixed hour window 1..56).
 */
function renderQuestionLogView() {
  const hpp = getQuestionLogHoursPerPage();
  questionLogHoursPerPage = hpp;
  clampQuestionLogPageIndex();
  updateQuestionLogToolbar();

  questionLogEl.innerHTML = "";
  const questions = questionLogCachedQuestions;
  if (!questions || questions.length === 0) {
    const p = document.createElement("p");
    p.className = "question-log-empty";
    p.textContent =
      "No questions saved yet. Set hour and Q#, add text, then click “Save to shared log”.";
    questionLogEl.appendChild(p);
    return;
  }

  const range = questionLogHourRangeForPage(questionLogPageIndex, hpp);
  const byHour = new Map();
  for (const q of questions) {
    const h = Number(q.hour);
    if (!Number.isFinite(h) || h < range.start || h > range.end) continue;
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h).push(q);
  }

  const hoursSorted = [...byHour.keys()].sort(function (a, b) {
    return a - b;
  });

  if (hoursSorted.length === 0) {
    const p = document.createElement("p");
    p.className = "question-log-empty question-log-empty-page";
    p.textContent =
      "No questions saved for hours " +
      range.start +
      "–" +
      range.end +
      " yet.";
    questionLogEl.appendChild(p);
    return;
  }

  renderQuestionLogHourSections(byHour, hoursSorted);
  if (questionLogEl) {
    questionLogEl.scrollTop = 0;
  }
}

/**
 * After {@link questionLogHoursPerPage} changes, keeps the first hour of the
 * previous window visible when possible.
 */
function onQuestionLogHoursPerPageChange() {
  const oldHpp = sanitizeQuestionLogHoursPerPage(questionLogHoursPerPage);
  const newHpp = getQuestionLogHoursPerPage();
  const prevStart = questionLogHourRangeForPage(
    questionLogPageIndex,
    oldHpp
  ).start;
  questionLogHoursPerPage = newHpp;
  questionLogPageIndex = questionLogPageForHour(prevStart, newHpp);
  clampQuestionLogPageIndex();
  renderQuestionLogView();
}

/**
 * Navigates one page forward or backward within the fixed hour span.
 *
 * @param {number} delta - -1 or +1.
 */
function shiftQuestionLogPage(delta) {
  questionLogPageIndex += delta;
  clampQuestionLogPageIndex();
  renderQuestionLogView();
}

/**
 * Scrolls a question-log hour block into view inside the log panel (not the window).
 *
 * @param {number} hour - Hour whose section to show.
 */
function scrollQuestionLogHourIntoView(hour) {
  const block = document.getElementById("question-log-hour-" + hour);
  const log = document.getElementById("questionLog");
  if (!block || !log) return;
  const logRect = log.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const targetScrollTop =
    log.scrollTop + (blockRect.top - logRect.top) - 6;
  log.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: "smooth",
  });
}

/**
 * Jumps to the page containing the given hour and scrolls that hour section into view if present.
 *
 * @param {number} hour - Target hour (1..QUESTION_LOG_MAX_HOUR).
 * @returns {boolean} False if hour is out of range.
 */
function jumpQuestionLogToHour(hour) {
  if (
    !Number.isFinite(hour) ||
    hour < 1 ||
    hour > QUESTION_LOG_MAX_HOUR
  ) {
    return false;
  }
  questionLogPageIndex = questionLogPageForHour(hour, getQuestionLogHoursPerPage());
  renderQuestionLogView();
  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () {
      scrollQuestionLogHourIntoView(hour);
    });
  });
  return true;
}

/**
 * Reads "Go to hour" input and jumps.
 */
function handleQuestionLogGoHour() {
  const jumpInput = document.getElementById("questionLogJumpHour");
  if (!jumpInput) return;
  const raw = String(jumpInput.value ?? "").trim();
  const hour = parseInt(raw, 10);
  if (!jumpQuestionLogToHour(hour)) {
    jumpInput.focus();
    return;
  }
  jumpInput.value = "";
}

/**
 * Fetches the current question list from the API and re-renders the panel.
 */
async function refreshQuestionLog() {
  const res = await fetch(apiUrl("/api/questions"));
  if (!res.ok) return;
  const data = await res.json();
  questionLogCachedQuestions = data.questions || [];
  questionLogHoursPerPage = getQuestionLogHoursPerPage();
  clampQuestionLogPageIndex();
  renderQuestionLogView();
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
      "Enter a valid Hour (1–56) and Question # (at least 1) before saving.",
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

let countdownTimer = null;
let secondsLeft = 0;

async function fetchSessionConfig() {
  try {
    const res = await fetch(apiUrl("/api/config"));
    if (res.ok) {
      const cfg = await res.json();
      audioWindowSeconds =
        cfg.audio_window_seconds ?? DEFAULT_AUDIO_WINDOW_SECONDS;
      segmentIntervalSeconds =
        cfg.segment_interval_seconds ?? DEFAULT_SEGMENT_INTERVAL_SECONDS;
    }
  } catch (_) {
    // Fall back to defaults — progress bar still works
  }
}

function startCountdown() {
  stopCountdown();
  progressBar.classList.remove("is-indeterminate");
  secondsLeft = segmentIntervalSeconds;
  progressWrap.hidden = false;
  tickCountdown();

  countdownTimer = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    tickCountdown();
  }, 1000);
}

function tickCountdown() {
  const denom = Math.max(1, segmentIntervalSeconds);
  const pct = (secondsLeft / denom) * 100;
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
  startCountdown();

  let firstSegment = true;
  activeStream = new EventSource(apiUrl("/api/transcription/stream"));

  activeStream.onmessage = function (ev) {
    try {
      const data = JSON.parse(ev.data);
      if (data && typeof data.text === "string") {
        if (firstSegment) {
          firstSegment = false;
          statusEl.className = "success";
          startSessionTimer();
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
      return;
    }

    clearTranscript();
    stopSessionTimer();
    sessionStartTime = null;
    setStatus("");
    openStream();
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
    setStartBtn("idle");
  }
}

async function handleStop() {
  const duration = getSessionDuration();
  stopSessionTimer();
  closeStream();
  setStartBtn("idle");
  const durationStr = duration !== null ? ` Session ran for ${formatDuration(duration)}.` : "";
  setStatus(`Stopped.${durationStr}`);

  try {
    const res = await fetch(apiUrl("/api/stop"), { method: "POST" });

    if (!res.ok) {
      const detail = parseErrorDetail(await res.text());
      setStatus(`Stop failed (${res.status}): ${detail}`, "error");
    }
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
  }
}

// ── Initialise ───────────────────────────────────────────────────────────────

fetchSessionConfig();

questionLogHoursPerPage = getQuestionLogHoursPerPage();

refreshQuestionLog().catch(function () {});
startQuestionLogPolling();

if (questionLogHoursPerPageEl) {
  questionLogHoursPerPageEl.addEventListener(
    "change",
    onQuestionLogHoursPerPageChange
  );
}
if (questionLogPrevEl) {
  questionLogPrevEl.addEventListener("click", function () {
    shiftQuestionLogPage(-1);
  });
}
if (questionLogNextEl) {
  questionLogNextEl.addEventListener("click", function () {
    shiftQuestionLogPage(1);
  });
}
if (questionLogGoHourEl) {
  questionLogGoHourEl.addEventListener("click", handleQuestionLogGoHour);
}
if (questionLogJumpHourEl) {
  questionLogJumpHourEl.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      handleQuestionLogGoHour();
    }
  });
}

btnStart.addEventListener("click", handleStart);
btnStop.addEventListener("click", handleStop);
btnUseSelection.addEventListener("click", handleUseSelectionAsQuestion);
btnSaveToLog.addEventListener("click", function () {
  handleSaveToSharedLog();
});
window.addEventListener("beforeunload", function () {
  stopQuestionLogPolling();
});
