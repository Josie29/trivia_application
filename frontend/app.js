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
const questionLogEl = document.getElementById("questionLog");
const questionLogHourSelectEl = document.getElementById(
  "questionLogHourSelect"
);
const questionLogPointTotalEl = document.getElementById(
  "questionLogPointTotal"
);

/** True when the server reports an active shared transcription session (may differ from SSE). */
let serverSessionActive = false;

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

function syncStopButtonFromServerState() {
  btnStop.disabled = !(activeStream || serverSessionActive);
}

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
    btnStartLabel.textContent = "Start session";
    btnStop.disabled = false;
  } else {
    btnStart.disabled = false;
    btnStart.classList.remove("is-loading");
    btnStartLabel.textContent = serverSessionActive ? "Join live" : "Start session";
    syncStopButtonFromServerState();
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

/** @type {ReturnType<typeof setInterval> | null} */
let questionLogPollTimer = null;

/** @type {Array<{ hour: number, question_number: number, text: string, updated_at: string, our_answer?: string, actual_answer?: string, point_value?: number, got_correct?: boolean }>} */
let questionLogCachedQuestions = [];

/**
 * Currently selected contest hour shown in the shared log (1..{@link QUESTION_LOG_MAX_HOUR}).
 *
 * @type {number}
 */
let questionLogSelectedHour = 1;

/**
 * Hour index of the last completed paint; used with {@link questionLogSelectedHour} to preserve scroll across poll refreshes.
 *
 * @type {number | null}
 */
let questionLogLastRenderedHour = null;

/**
 * When true, the user has typed in scoring fields; polling must not call
 * {@link renderQuestionLogView} or in-progress text is wiped (inputs are recreated from API data).
 *
 * @type {boolean}
 */
let questionLogScoringDirty = false;

/**
 * Returns true if any Add/Edit scoring panel is currently expanded (not [hidden]).
 * Used with {@link questionLogScoringDirty} so polling does not reset the UI while the editor is open.
 *
 * @returns {boolean}
 */
function isQuestionLogScoringEditorOpen() {
  const log = document.getElementById("questionLog");
  if (!log) {
    return false;
  }
  const panels = log.querySelectorAll(".question-log-score-edit");
  for (let i = 0; i < panels.length; i += 1) {
    if (!panels[i].hidden) {
      return true;
    }
  }
  return false;
}

/**
 * Updates the running sum of ``point_value`` across all saved questions in the shared log.
 */
function updateQuestionLogPointTotal() {
  if (!questionLogPointTotalEl) {
    return;
  }
  let sum = 0;
  const qs = questionLogCachedQuestions || [];
  for (let i = 0; i < qs.length; i += 1) {
    const pv = Number(qs[i].point_value);
    if (Number.isFinite(pv) && pv > 0) {
      sum += Math.floor(pv);
    }
  }
  questionLogPointTotalEl.textContent = String(sum);
}

/**
 * Clamps hour to the supported contest range.
 *
 * @param {number} n - Raw hour value.
 * @returns {number}
 */
function sanitizeQuestionLogSelectedHour(n) {
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.min(Math.floor(n), QUESTION_LOG_MAX_HOUR);
}

/**
 * Reads the Show hour control, or falls back to {@link questionLogSelectedHour}.
 *
 * @returns {number}
 */
function getQuestionLogSelectedHour() {
  if (!questionLogHourSelectEl) {
    return sanitizeQuestionLogSelectedHour(questionLogSelectedHour);
  }
  const raw = parseInt(String(questionLogHourSelectEl.value).trim(), 10);
  return sanitizeQuestionLogSelectedHour(raw);
}

/**
 * Fills the hour dropdown with Hour 1 … Hour 56 when empty.
 */
function ensureQuestionLogHourSelectOptions() {
  const sel = questionLogHourSelectEl || document.getElementById(
    "questionLogHourSelect"
  );
  if (!sel || sel.options.length >= QUESTION_LOG_MAX_HOUR) {
    return;
  }
  sel.innerHTML = "";
  for (let h = 1; h <= QUESTION_LOG_MAX_HOUR; h += 1) {
    const opt = document.createElement("option");
    opt.value = String(h);
    opt.textContent = "Hour " + h;
    sel.appendChild(opt);
  }
}

/**
 * Syncs the select element with {@link questionLogSelectedHour}.
 */
function syncQuestionLogHourSelectValue() {
  if (!questionLogHourSelectEl) return;
  questionLogHourSelectEl.value = String(
    sanitizeQuestionLogSelectedHour(questionLogSelectedHour)
  );
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
 * Preview of server rule: both answers non-empty and equal case-insensitively after trim.
 *
 * @param {string} ourText
 * @param {string} actualText
 * @returns {boolean | null} True/false when comparable; null when either side empty.
 */
function computeGotCorrectPreview(ourText, actualText) {
  const o = String(ourText ?? "").trim().toLowerCase();
  const a = String(actualText ?? "").trim().toLowerCase();
  if (!o || !a) {
    return null;
  }
  return o === a;
}

/**
 * Updates the scoring status chip for one row.
 *
 * @param {HTMLElement} badgeEl
 * @param {string} ourText
 * @param {string} actualText
 */
function updateQuestionLogScoreBadge(badgeEl, ourText, actualText) {
  const r = computeGotCorrectPreview(ourText, actualText);
  badgeEl.className = "question-log-result";
  if (r === null) {
    badgeEl.classList.add("is-pending");
    badgeEl.textContent = "Awaiting both answers";
  } else if (r) {
    badgeEl.classList.add("is-correct");
    badgeEl.textContent = "Correct";
  } else {
    badgeEl.classList.add("is-incorrect");
    badgeEl.textContent = "Incorrect";
  }
}

/**
 * Persists scoring fields for one log row (full POST with question text).
 *
 * @param {{ hour: number, question_number: number, text: string }} item - Row snapshot including wording.
 * @param {string} ourAnswer
 * @param {string} actualAnswer
 * @param {number} pointValue
 * @param {HTMLButtonElement} btn - Save button (disabled while sending).
 */
async function saveQuestionLogScoring(item, ourAnswer, actualAnswer, pointValue, btn) {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch(apiUrl("/api/questions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hour: item.hour,
        question_number: item.question_number,
        text: item.text,
        our_answer: ourAnswer,
        actual_answer: actualAnswer,
        point_value: pointValue,
      }),
    });
    if (!res.ok) {
      const detail = parseErrorDetail(await res.text());
      window.alert("Could not save scoring: " + detail);
      return;
    }
    questionLogScoringDirty = false;
    await refreshQuestionLog({ forceRender: true });
  } catch (err) {
    window.alert("Network error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

/**
 * Returns true when the row has any scoring data worth showing in the summary strip.
 *
 * @param {{ our_answer?: string, actual_answer?: string, point_value?: number }} item
 * @returns {boolean}
 */
function hasQuestionLogScoringSaved(item) {
  const our = String(item.our_answer ?? "").trim();
  const act = String(item.actual_answer ?? "").trim();
  const pts = Number(item.point_value ?? 0);
  return our.length > 0 || act.length > 0 || (Number.isFinite(pts) && pts > 0);
}

/**
 * Fills the read-only summary strip for saved scoring (compact layout).
 *
 * @param {HTMLElement} container
 * @param {{ our_answer?: string, actual_answer?: string, point_value?: number, got_correct?: boolean }} item
 */
function fillQuestionLogScoringSummary(container, item) {
  container.innerHTML = "";
  const our = String(item.our_answer ?? "").trim();
  const act = String(item.actual_answer ?? "").trim();
  const ptsRaw = Number(item.point_value ?? 0);
  const pts = Number.isFinite(ptsRaw) ? Math.max(0, Math.floor(ptsRaw)) : 0;

  function addLine(label, value) {
    const line = document.createElement("div");
    line.className = "question-log-sum-line";
    const lb = document.createElement("span");
    lb.className = "question-log-sum-label";
    lb.textContent = label;
    const val = document.createElement("span");
    val.className = "question-log-sum-value";
    val.textContent = value || "—";
    line.appendChild(lb);
    line.appendChild(val);
    container.appendChild(line);
  }

  addLine("Our answer", our);
  addLine("Actual answer", act);

  const meta = document.createElement("div");
  meta.className = "question-log-sum-meta";
  const ptsSpan = document.createElement("span");
  ptsSpan.className = "question-log-sum-pts";
  ptsSpan.textContent = pts === 1 ? "1 point" : pts + " points";

  const badge = document.createElement("span");
  badge.className = "question-log-result question-log-sum-result";
  if (item.got_correct === true) {
    badge.classList.add("is-correct");
    badge.textContent = "Correct";
  } else if (our && act) {
    badge.classList.add("is-incorrect");
    badge.textContent = "Incorrect";
  } else {
    badge.classList.add("is-pending");
    badge.textContent = "Incomplete";
  }
  meta.appendChild(ptsSpan);
  meta.appendChild(badge);
  container.appendChild(meta);
}

/**
 * Builds the DOM for one saved question: compact scoring summary + toggle to edit form.
 *
 * @param {{ hour: number, question_number: number, text: string, updated_at?: string, our_answer?: string, actual_answer?: string, point_value?: number, got_correct?: boolean }} item
 * @returns {HTMLDivElement}
 */
function buildQuestionLogItemElement(item) {
  const row = document.createElement("div");
  row.className = "question-log-item";

  const hour = item.hour;
  const qn = item.question_number;
  const baseId = "qlog-" + hour + "-" + qn;

  const meta = document.createElement("div");
  meta.className = "question-log-meta";
  meta.textContent = "Q" + qn;

  const body = document.createElement("div");
  body.className = "question-log-body";
  body.textContent = item.text;

  const scoreWrap = document.createElement("div");
  scoreWrap.className = "question-log-score";
  scoreWrap.setAttribute("role", "group");
  scoreWrap.setAttribute("aria-label", "Scoring for Q" + qn);

  const bar = document.createElement("div");
  bar.className = "question-log-score-bar";

  const summary = document.createElement("div");
  summary.className = "question-log-score-summary";

  if (hasQuestionLogScoringSaved(item)) {
    fillQuestionLogScoringSummary(summary, item);
  } else {
    const hint = document.createElement("p");
    hint.className = "question-log-score-hint";
    hint.textContent = "No scoring recorded yet.";
    summary.appendChild(hint);
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "question-log-toggle-scoring";
  toggleBtn.setAttribute("aria-expanded", "false");
  const editPanelId = baseId + "-edit";
  toggleBtn.setAttribute("aria-controls", editPanelId);
  toggleBtn.textContent = hasQuestionLogScoringSaved(item)
    ? "Edit scoring"
    : "Add scoring";

  const editPanel = document.createElement("div");
  editPanel.id = editPanelId;
  editPanel.className = "question-log-score-edit";
  editPanel.hidden = true;
  editPanel.setAttribute("role", "region");
  editPanel.setAttribute(
    "aria-label",
    "Edit scoring for question " + qn
  );

  const grid = document.createElement("div");
  grid.className = "question-log-score-grid";

  const ourWrap = document.createElement("div");
  ourWrap.className = "question-log-field";
  const ourLabel = document.createElement("label");
  ourLabel.className = "question-log-field-label";
  ourLabel.htmlFor = baseId + "-our";
  ourLabel.textContent = "Our answer";
  const ourInput = document.createElement("textarea");
  ourInput.className = "question-log-text-input";
  ourInput.id = baseId + "-our";
  ourInput.rows = 2;
  ourInput.value = String(item.our_answer ?? "");

  const actWrap = document.createElement("div");
  actWrap.className = "question-log-field";
  const actLabel = document.createElement("label");
  actLabel.className = "question-log-field-label";
  actLabel.htmlFor = baseId + "-actual";
  actLabel.textContent = "Actual answer";
  const actualInput = document.createElement("textarea");
  actualInput.className = "question-log-text-input";
  actualInput.id = baseId + "-actual";
  actualInput.rows = 2;
  actualInput.value = String(item.actual_answer ?? "");

  const ptsWrap = document.createElement("div");
  ptsWrap.className = "question-log-field question-log-field-points";
  const ptsLabel = document.createElement("label");
  ptsLabel.className = "question-log-field-label";
  ptsLabel.htmlFor = baseId + "-pts";
  ptsLabel.textContent = "Points";
  const ptsInput = document.createElement("input");
  ptsInput.type = "number";
  ptsInput.className = "question-log-points-input";
  ptsInput.id = baseId + "-pts";
  ptsInput.min = "0";
  ptsInput.step = "1";
  ptsInput.inputMode = "numeric";
  ptsInput.value = String(
    item.point_value !== undefined && item.point_value !== null
      ? item.point_value
      : 0
  );

  ourWrap.appendChild(ourLabel);
  ourWrap.appendChild(ourInput);
  actWrap.appendChild(actLabel);
  actWrap.appendChild(actualInput);
  ptsWrap.appendChild(ptsLabel);
  ptsWrap.appendChild(ptsInput);

  grid.appendChild(ourWrap);
  grid.appendChild(actWrap);
  grid.appendChild(ptsWrap);

  const footer = document.createElement("div");
  footer.className = "question-log-score-footer";

  const badge = document.createElement("span");
  badge.className = "question-log-result";
  updateQuestionLogScoreBadge(badge, ourInput.value, actualInput.value);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "question-log-save-scoring";
  saveBtn.textContent = "Save scoring";

  function syncBadge() {
    updateQuestionLogScoreBadge(badge, ourInput.value, actualInput.value);
  }

  ourInput.addEventListener("input", syncBadge);
  actualInput.addEventListener("input", syncBadge);

  const snapshot = {
    hour: item.hour,
    question_number: item.question_number,
    text: item.text,
  };

  saveBtn.addEventListener("click", function () {
    const pts = parseInt(String(ptsInput.value ?? "0"), 10);
    const pv = Number.isFinite(pts) && pts >= 0 ? pts : 0;
    saveQuestionLogScoring(
      snapshot,
      ourInput.value,
      actualInput.value,
      pv,
      saveBtn
    );
  });

  footer.appendChild(badge);
  footer.appendChild(saveBtn);

  editPanel.appendChild(grid);
  editPanel.appendChild(footer);

  toggleBtn.addEventListener("click", function () {
    const willOpen = editPanel.hidden;
    editPanel.hidden = !willOpen;
    toggleBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    toggleBtn.textContent = willOpen ? "Close editor" : hasQuestionLogScoringSaved(item)
      ? "Edit scoring"
      : "Add scoring";
    if (willOpen && ourInput) {
      window.setTimeout(function () {
        ourInput.focus();
      }, 0);
    }
    if (!willOpen) {
      window.setTimeout(function () {
        if (!questionLogScoringDirty) {
          refreshQuestionLog().catch(function () {});
        }
      }, 0);
    }
  });

  bar.appendChild(summary);
  bar.appendChild(toggleBtn);

  scoreWrap.appendChild(bar);
  scoreWrap.appendChild(editPanel);

  row.appendChild(meta);
  row.appendChild(body);
  row.appendChild(scoreWrap);

  if (item.updated_at) {
    const ts = document.createElement("div");
    ts.className = "question-log-updated";
    ts.textContent = "Updated " + item.updated_at;
    row.appendChild(ts);
  }

  return row;
}

/**
 * Appends hour sections for the given hour keys (sorted), using data from {@link byHour}.
 *
 * @param {Map<number, Array<object>>} byHour
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
      section.appendChild(buildQuestionLogItemElement(item));
    }

    questionLogEl.appendChild(section);
  }
}

/**
 * Renders the cached log for the selected single hour.
 */
function renderQuestionLogView() {
  const selectedHour = getQuestionLogSelectedHour();
  questionLogSelectedHour = selectedHour;

  const preserveScroll =
    questionLogLastRenderedHour !== null &&
    questionLogLastRenderedHour === selectedHour;
  let scrollTopKeep = 0;
  if (preserveScroll && questionLogEl) {
    scrollTopKeep = questionLogEl.scrollTop;
  }

  questionLogEl.innerHTML = "";
  questionLogScoringDirty = false;
  const questions = questionLogCachedQuestions;
  if (!questions || questions.length === 0) {
    const p = document.createElement("p");
    p.className = "question-log-empty";
    p.textContent =
      "No questions saved yet. Set hour and Q#, add text, then click “Save to shared log”.";
    questionLogEl.appendChild(p);
    questionLogLastRenderedHour = selectedHour;
    return;
  }

  const byHour = new Map();
  for (const q of questions) {
    const h = Number(q.hour);
    if (!Number.isFinite(h) || h !== selectedHour) continue;
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
      "No questions saved for Hour " + selectedHour + " yet.";
    questionLogEl.appendChild(p);
    questionLogLastRenderedHour = selectedHour;
    if (preserveScroll && questionLogEl) {
      questionLogEl.scrollTop = scrollTopKeep;
    }
    return;
  }

  renderQuestionLogHourSections(byHour, hoursSorted);
  questionLogLastRenderedHour = selectedHour;
  if (preserveScroll && questionLogEl) {
    questionLogEl.scrollTop = scrollTopKeep;
  }
}

/**
 * User picked a different hour—reset scroll to top for the new list.
 */
function onQuestionLogHourSelectChange() {
  questionLogScoringDirty = false;
  questionLogSelectedHour = getQuestionLogSelectedHour();
  questionLogLastRenderedHour = null;
  renderQuestionLogView();
  if (questionLogEl) {
    questionLogEl.scrollTop = 0;
  }
}

/**
 * Fetches the current question list from the API and re-renders the panel.
 *
 * @param {{ forceRender?: boolean }} [options] - Pass ``{ forceRender: true }`` after a save or when the DOM must refresh even if the user has unscored edits (e.g. new capture).
 */
async function refreshQuestionLog(options) {
  const forceRender = options && options.forceRender;
  const res = await fetch(apiUrl("/api/questions"));
  if (!res.ok) return;
  const data = await res.json();
  questionLogCachedQuestions = data.questions || [];
  updateQuestionLogPointTotal();
  if (
    !forceRender &&
    (questionLogScoringDirty || isQuestionLogScoringEditorOpen())
  ) {
    return;
  }
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
    questionLogSelectedHour = parsed.hour;
    syncQuestionLogHourSelectValue();
    await refreshQuestionLog({ forceRender: true });
  } catch (err) {
    setCaptureFeedback("Network error: " + err.message, "error");
  }
}

/**
 * Marks scoring fields as dirty when the user types in the scrollable log (so polling will not clobber inputs).
 */
function setupQuestionLogScoringDirtyTracking() {
  const log = document.getElementById("questionLog");
  if (!log || log.dataset.scoringDirtyBound === "1") {
    return;
  }
  log.dataset.scoringDirtyBound = "1";
  log.addEventListener("input", function (ev) {
    const t = ev.target;
    if (
      t &&
      t.classList &&
      (t.classList.contains("question-log-text-input") ||
        t.classList.contains("question-log-points-input"))
    ) {
      questionLogScoringDirty = true;
    }
  });
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

/**
 * Incremented when replacing or tearing down the stream so stale ``onerror``
 * callbacks from a previous EventSource do not clobber UI or status text.
 */
let streamGeneration = 0;

function closeStream() {
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }
  stopCountdown();
}

/**
 * Fetches shared session status from the server and updates URL field + buttons.
 *
 * @param {object} [payload] - Optional pre-parsed JSON from GET /api/session.
 * @returns {Promise<object|null>}
 */
async function refreshSessionStatus(payload) {
  try {
    const data =
      payload !== undefined
        ? payload
        : await fetch(apiUrl("/api/session")).then(function (r) {
            return r.ok ? r.json() : null;
          });
    if (data && typeof data.active === "boolean") {
      applySessionStatus(data);
    }
    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Applies GET /api/session payload: shared URL, read-only while live, Join vs Start label.
 *
 * @param {{ active: boolean, stream_url?: string|null }} data - Session status from API.
 */
function applySessionStatus(data) {
  serverSessionActive = !!data.active;
  if (data.active && data.stream_url) {
    urlInput.value = data.stream_url;
    urlInput.readOnly = true;
    if (!activeStream) {
      btnStartLabel.textContent = "Join live";
    }
  } else {
    urlInput.readOnly = false;
    if (!activeStream) {
      btnStartLabel.textContent = "Start session";
    }
  }
  syncStopButtonFromServerState();
}

function openStream() {
  closeStream();
  const myGen = ++streamGeneration;
  startCountdown();

  let firstSegment = true;
  activeStream = new EventSource(apiUrl("/api/transcription/stream"));

  activeStream.onmessage = function (ev) {
    if (myGen !== streamGeneration) return;
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
    if (myGen !== streamGeneration) return;
    closeStream();
    refreshSessionStatus()
      .then(function (data) {
        if (data && data.active) {
          setStatus(
            "Stream disconnected — network error. Session may still be running; try Join live.",
            "error"
          );
        } else {
          setStatus("Live session ended.", "success");
        }
        setStartBtn("idle");
      })
      .catch(function () {
        setStatus("Stream disconnected.", "error");
        setStartBtn("idle");
      });
  };
}

// ── Button handlers ──────────────────────────────────────────────────────────

/**
 * Subscribes to the existing server session (same transcript for all viewers).
 *
 * @returns {Promise<void>}
 */
async function joinLiveSession() {
  await fetchSessionConfig();
  const st = await refreshSessionStatus();
  if (!st || !st.active) {
    setStatus("No active session to join.", "error");
    setStartBtn("idle");
    return;
  }
  clearTranscript();
  stopSessionTimer();
  sessionStartTime = null;
  setStatus("Joining shared live transcript…");
  setStartBtn("connecting");
  openStream();
}

async function handleStart() {
  setStatus("");

  await fetchSessionConfig();
  const statusRes = await fetch(apiUrl("/api/session"));
  if (statusRes.ok) {
    const st = await statusRes.json();
    if (st.active) {
      await joinLiveSession();
      return;
    }
  }

  const twitchUrl = urlInput.value.trim();
  if (!twitchUrl) {
    setStatus("Enter a stream URL to start the shared session.", "error");
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

    if (res.status === 409) {
      await joinLiveSession();
      return;
    }

    if (!res.ok) {
      const detail = parseErrorDetail(await res.text());
      setStatus(`Start failed (${res.status}): ${detail}`, "error");
      setStartBtn("idle");
      return;
    }

    await refreshSessionStatus({ active: true, stream_url: twitchUrl });

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
  streamGeneration++;
  closeStream();

  btnStart.disabled = true;
  btnStop.disabled = true;
  btnStart.classList.remove("is-loading");

  const durationStr = duration !== null ? ` Session ran for ${formatDuration(duration)}.` : "";
  setStatus("Stopping shared session…");

  try {
    const res = await fetch(apiUrl("/api/stop"), { method: "POST" });

    if (res.ok) {
      await refreshSessionStatus({ active: false, stream_url: null });
      setStatus(`Stopped for everyone.${durationStr}`);
    } else if (res.status === 400) {
      await refreshSessionStatus();
      const detail = parseErrorDetail(await res.text());
      const already =
        /no active session/i.test(detail) ||
        /no session/i.test(detail);
      if (already) {
        setStatus(`Session was already stopped.${durationStr}`, "success");
      } else {
        setStatus(`Stop failed: ${detail}`, "error");
      }
    } else {
      const detail = parseErrorDetail(await res.text());
      setStatus(`Stop failed (${res.status}): ${detail}`, "error");
      await refreshSessionStatus();
    }
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
    await refreshSessionStatus();
  } finally {
    setStartBtn("idle");
  }
}

// ── Initialise ───────────────────────────────────────────────────────────────

(async function initSharedSession() {
  await fetchSessionConfig();
  const session = await fetch(apiUrl("/api/session"))
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .catch(function () {
      return null;
    });
  if (session) {
    applySessionStatus(session);
  }
  if (session && session.active) {
    clearTranscript();
    setStatus("Joining shared live transcript…");
    setStartBtn("connecting");
    openStream();
  } else {
    setStartBtn("idle");
  }
})();

ensureQuestionLogHourSelectOptions();
syncQuestionLogHourSelectValue();
questionLogSelectedHour = getQuestionLogSelectedHour();

setupQuestionLogScoringDirtyTracking();
refreshQuestionLog().catch(function () {});
startQuestionLogPolling();

if (questionLogHourSelectEl) {
  questionLogHourSelectEl.addEventListener(
    "change",
    onQuestionLogHourSelectChange
  );
}

btnStart.addEventListener("click", handleStart);
btnStop.addEventListener("click", handleStop);

setInterval(function () {
  if (activeStream) return;
  refreshSessionStatus().catch(function () {});
}, 15000);
btnUseSelection.addEventListener("click", handleUseSelectionAsQuestion);
btnSaveToLog.addEventListener("click", function () {
  handleSaveToSharedLog();
});
window.addEventListener("beforeunload", function () {
  stopQuestionLogPolling();
});
