/* Fully client-side replacement for web/server.py: no network calls, no Python.
   Reads from the embedded QUESTIONS/TOPICS constants and browser localStorage.
   Exposes an async `api(path, {method, body})` with the exact same shape the
   original fetch-based version had, so app.js needs no changes beyond this file. */

// ---------- progress (mirrors core/progress.py, stored in localStorage) ----------
const PROGRESS_KEY = "javaJuniorExam:progress:v1";

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data.questions === "object" ? data : { questions: {} };
  } catch {
    return { questions: {} };
  }
}

function saveProgress(data) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(data)); }
  catch { /* storage unavailable (private mode, quota, etc.) — practice still works */ }
}

function recordResults(results) {
  const data = loadProgress();
  for (const r of results) {
    const key = String(r.question.id);
    const entry = data.questions[key] || { attempts: 0, correct: 0, last_correct: null };
    entry.attempts += 1;
    entry.correct += r.correct ? 1 : 0;
    entry.last_correct = r.correct;
    data.questions[key] = entry;
  }
  saveProgress(data);
}

function failedIds() {
  const data = loadProgress();
  const ids = new Set();
  for (const [id, entry] of Object.entries(data.questions)) {
    if (entry.last_correct === false) ids.add(Number(id));
  }
  return ids;
}

function progressSummary() {
  const data = loadProgress();
  let attempts = 0, correct = 0;
  for (const entry of Object.values(data.questions)) { attempts += entry.attempts; correct += entry.correct; }
  return { attempts, correct };
}

// ---------- selection (mirrors core/selection.py) ----------
function filterQuestions(questions, { topic, difficulty, ids } = {}) {
  let result = questions;
  if (topic) result = result.filter((q) => q.topic === topic);
  if (difficulty) result = result.filter((q) => q.difficulty === difficulty);
  if (ids) result = result.filter((q) => ids.has(q.id));
  return result;
}

function shuffled(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function selectQuestions(pool, amount, { balanced = false } = {}) {
  amount = amount == null ? pool.length : amount;
  if (!(amount > 0 && amount <= pool.length)) {
    throw new Error(`Cannot select ${amount} questions from a pool of ${pool.length}.`);
  }
  if (!balanced) return shuffled(pool).slice(0, amount);

  const byTopic = new Map();
  for (const q of pool) {
    if (!byTopic.has(q.topic)) byTopic.set(q.topic, []);
    byTopic.get(q.topic).push(q);
  }
  const groups = shuffled([...byTopic.values()].map(shuffled));
  const chosen = [];
  while (chosen.length < amount) {
    for (const group of groups) {
      if (group.length && chosen.length < amount) chosen.push(group.pop());
    }
  }
  return shuffled(chosen);
}

// ---------- exam session (mirrors core/exam.py) ----------
class ExamSession {
  constructor(questions, mode) {
    if (!questions.length) throw new Error("The exam requires at least one question.");
    this.questions = questions;
    this.mode = mode; // "practice" | "exam"
    this.results = [];
    this.index = 0;
  }
  get total() { return this.questions.length; }
  get currentQuestion() { return this.questions[this.index]; }
  get isLast() { return this.index === this.total - 1; }
  get isFinished() { return this.results.length === this.total; }
  get currentAnswered() { return this.results.length > this.index; }

  submitAnswer(selectedArr) {
    if (this.currentAnswered) throw new Error("The current question was already answered.");
    const q = this.currentQuestion;
    const selected = new Set(selectedArr);
    const optionKeys = new Set(Object.keys(q.options));
    if (selected.size === 0 || ![...selected].every((s) => optionKeys.has(s))) {
      throw new Error("Invalid selection.");
    }
    if (q.type !== "multiple" && selected.size !== 1) {
      throw new Error("This question accepts exactly one answer.");
    }
    const correctSet = new Set(q.correct_answers);
    const correct = selected.size === correctSet.size && [...selected].every((s) => correctSet.has(s));
    const result = { question: q, selected: [...selected].sort(), correct };
    this.results.push(result);
    return result;
  }

  next() {
    if (!this.currentAnswered) throw new Error("Answer the current question first.");
    if (this.isFinished) throw new Error("The exam is finished.");
    this.index += 1;
  }

  get score() { return this.results.filter((r) => r.correct).length; }
  get percentage() { return this.results.length ? (this.score / this.results.length) * 100 : 0; }

  topicBreakdown() {
    const stats = {};
    for (const r of this.results) {
      const t = r.question.topic;
      stats[t] = stats[t] || [0, 0];
      stats[t][1] += 1;
      if (r.correct) stats[t][0] += 1;
    }
    return stats;
  }

  failedQuestions() { return this.results.filter((r) => !r.correct).map((r) => r.question); }
}

// ---------- local "API" (mirrors web/server.py's routes, no network) ----------
const sessions = new Map();

function newId() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function topicName(topicId) { return TOPICS[topicId] || topicId; }

function publicQuestion(q) {
  return {
    id: q.id, topic: q.topic, topic_name: topicName(q.topic), difficulty: q.difficulty,
    multiple: q.type === "multiple", question: q.question, code: q.code || null, options: q.options,
  };
}

function feedbackFor(result) {
  return {
    correct: result.correct,
    selected: result.selected,
    correct_answers: [...result.question.correct_answers].sort(),
    explanation: result.question.explanation,
  };
}

function stateFor(id, entry) {
  const s = entry.session;
  const data = {
    id, mode: s.mode, index: s.index, total: s.total, finished: s.isFinished,
    answered: s.currentAnswered, question: publicQuestion(s.currentQuestion), feedback: null,
  };
  if (s.currentAnswered && s.mode === "practice") data.feedback = feedbackFor(s.results[s.index]);
  return data;
}

function poolFor(topic, difficulty, failedOnly) {
  return filterQuestions(QUESTIONS, {
    topic: topic || null,
    difficulty: difficulty || null,
    ids: failedOnly ? failedIds() : null,
  });
}

function newSession(qs, mode) {
  const id = newId();
  sessions.set(id, { session: new ExamSession(qs, mode), recorded: false });
  return { id, total: qs.length, mode };
}

function apiError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function getEntry(id) {
  const entry = sessions.get(id);
  if (!entry) throw apiError(404, "Session not found.");
  return entry;
}

async function api(path, { method = "GET", body } = {}) {
  const [route, qs] = path.split("?");
  const params = new URLSearchParams(qs || "");

  if (route === "/meta" && method === "GET") {
    const { attempts, correct } = progressSummary();
    return {
      total: QUESTIONS.length,
      topics: Object.entries(TOPICS).map(([id, name]) => ({
        id, name, count: QUESTIONS.filter((q) => q.topic === id).length,
      })),
      difficulties: ["easy", "medium", "hard"],
      history: { answers: attempts, correct },
      failed_count: failedIds().size,
    };
  }

  if (route === "/pool" && method === "GET") {
    const failedOnly = params.get("failed_only") === "true";
    return { count: poolFor(params.get("topic"), params.get("difficulty"), failedOnly).length };
  }

  if (route === "/sessions" && method === "POST") {
    const pool = poolFor(body.topic, body.difficulty, body.failed_only);
    if (!pool.length) throw apiError(400, "No questions match these filters.");
    const amount = Math.min(body.amount || pool.length, pool.length);
    const balanced = Boolean(body.balanced) && !body.topic;
    return newSession(selectQuestions(pool, amount, { balanced }), body.mode);
  }

  let m = route.match(/^\/sessions\/([^/]+)$/);
  if (m && method === "GET") return stateFor(m[1], getEntry(m[1]));

  m = route.match(/^\/sessions\/([^/]+)\/answer$/);
  if (m && method === "POST") {
    const entry = getEntry(m[1]);
    let result;
    try { result = entry.session.submitAnswer(body.selected); }
    catch (e) { throw apiError(400, e.message); }
    return entry.session.mode === "practice" ? feedbackFor(result) : { recorded: true };
  }

  m = route.match(/^\/sessions\/([^/]+)\/next$/);
  if (m && method === "POST") {
    const entry = getEntry(m[1]);
    const s = entry.session;
    if (!s.currentAnswered) throw apiError(409, "Answer the current question first.");
    if (s.isFinished) return { finished: true };
    s.next();
    return stateFor(m[1], entry);
  }

  m = route.match(/^\/sessions\/([^/]+)\/results$/);
  if (m && method === "GET") {
    const entry = getEntry(m[1]);
    const s = entry.session;
    if (s.results.length && !entry.recorded) { recordResults(s.results); entry.recorded = true; }
    const breakdown = Object.entries(s.topicBreakdown())
      .map(([t, [ok, n]]) => ({ topic: t, name: topicName(t), correct: ok, total: n }))
      .sort((a, b) => a.correct / a.total - b.correct / b.total);
    return {
      score: s.score, answered: s.results.length, total: s.total,
      percentage: Math.round(s.percentage * 10) / 10,
      failed_count: s.failedQuestions().length,
      breakdown,
      review: s.results.map((r) => ({ ...publicQuestion(r.question), ...feedbackFor(r) })),
    };
  }

  m = route.match(/^\/sessions\/([^/]+)\/practice-failed$/);
  if (m && method === "POST") {
    const entry = getEntry(m[1]);
    const failed = entry.session.failedQuestions();
    if (!failed.length) throw apiError(400, "There are no failed questions.");
    return newSession(selectQuestions(failed, failed.length), "practice");
  }

  throw apiError(404, "Unknown route: " + path);
}
