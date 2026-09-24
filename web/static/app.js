"use strict";

const app = document.getElementById("app");
let view = "start";
let quiz = null; // {st, selected:Set, feedback, busy}

// ---------- helpers ----------
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch { /* keep statusText */ }
    throw new Error(msg);
  }
  return res.json();
}

// `code` in backticks renders as inline code (works in questions, options, explanations).
function richText(text) {
  return String(text).split(/`([^`]+)`/).map((part, i) =>
    i % 2 ? h("code", { class: "inline" }, part) : part);
}

// Highlight Java and split into lines, closing/reopening spans that cross line breaks.
function highlightLines(code) {
  const html = hljs.highlight(code, { language: "java" }).value;
  const stack = [];
  return html.split("\n").map((line) => {
    const open = stack.join("");
    for (const m of line.matchAll(/<span[^>]*>|<\/span>/g)) {
      if (m[0] === "</span>") stack.pop(); else stack.push(m[0]);
    }
    return open + line + "</span>".repeat(stack.length);
  });
}

function codeBlock(code) {
  const body = h("code", { class: "hljs language-java" });
  body.innerHTML = highlightLines(code)
    .map((l) => `<span class="cl">${l || "&#8203;"}</span>`).join("");
  const copy = h("button", { type: "button", onClick: async () => {
    try { await navigator.clipboard.writeText(code); copy.textContent = "Copied!"; }
    catch { copy.textContent = "Copy failed"; }
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  } }, "Copy");
  return h("div", { class: "code" },
    h("div", { class: "code-head" }, h("span", {}, "Java"), copy),
    h("div", { class: "code-scroll" }, body));
}

function difficultyPill(d) {
  return h("span", { class: "pill " + d }, d[0].toUpperCase() + d.slice(1));
}

function verdictColor(pct) {
  return pct >= 80 ? "var(--good)" : pct >= 60 ? "var(--medium)" : "var(--bad)";
}

function show(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function errorView(error) {
  show(h("div", { class: "card stack" },
    h("h2", {}, "Something went wrong"),
    h("p", { class: "muted" }, error.message),
    h("button", { class: "btn primary", onClick: showStart }, "Back to start")));
}

// ---------- start ----------
function seg(items, get, set) {
  const wrap = h("div", { class: "seg" });
  const draw = () => wrap.replaceChildren(...items.map((it) =>
    h("button", { type: "button", "aria-pressed": String(get() === it.value),
      onClick: () => { set(it.value); draw(); } }, it.label)));
  draw();
  return wrap;
}

async function showStart() {
  view = "start";
  sessionStorage.removeItem("sid");
  let meta;
  try { meta = await api("/meta"); } catch (e) { return errorView(e); }

  const cfg = { mode: "practice", topic: "", difficulty: "", amount: "20", balanced: true, failed_only: false };
  const info = h("span", { class: "muted" });
  const startBtn = h("button", { class: "btn primary", onClick: start }, "Start");

  async function refresh() {
    const p = new URLSearchParams({ topic: cfg.topic, difficulty: cfg.difficulty, failed_only: cfg.failed_only });
    try {
      const { count } = await api("/pool?" + p);
      info.textContent = `${count} question${count === 1 ? "" : "s"} match these filters`;
      startBtn.disabled = count === 0;
    } catch (e) { info.textContent = e.message; }
  }

  async function start() {
    startBtn.disabled = true;
    try {
      const s = await api("/sessions", { method: "POST", body: {
        mode: cfg.mode, topic: cfg.topic || null, difficulty: cfg.difficulty || null,
        amount: cfg.amount === "all" ? null : Number(cfg.amount),
        balanced: cfg.balanced, failed_only: cfg.failed_only } });
      startQuiz(await api("/sessions/" + s.id));
    } catch (e) { errorView(e); }
  }

  const modes = [
    { value: "practice", title: "Practice", text: "Feedback and explanation after every question." },
    { value: "exam", title: "Exam", text: "No feedback until the results screen." },
  ];
  const modeGrid = h("div", { class: "mode-grid" });
  const drawModes = () => modeGrid.replaceChildren(...modes.map((m) =>
    h("button", { type: "button", "aria-pressed": String(cfg.mode === m.value),
      onClick: () => { cfg.mode = m.value; drawModes(); } },
      h("strong", {}, m.title), h("span", { class: "muted" }, m.text))));
  drawModes();

  const balancedRow = h("label", { class: "check" },
    h("input", { type: "checkbox", checked: true, onChange: (e) => (cfg.balanced = e.target.checked) }),
    "Spread questions evenly across topics");
  const topicSelect = h("select", { onChange: (e) => {
    cfg.topic = e.target.value;
    balancedRow.style.opacity = cfg.topic ? ".45" : "1";
    refresh();
  } }, h("option", { value: "" }, `All topics (${meta.total})`),
    meta.topics.map((t) => h("option", { value: t.id }, `${t.name} (${t.count})`)));

  const failedRow = h("label", { class: "check" },
    h("input", { type: "checkbox", disabled: meta.failed_count === 0,
      onChange: (e) => { cfg.failed_only = e.target.checked; refresh(); } }),
    `Only questions I failed last time (${meta.failed_count})`);

  const { answers, correct } = meta.history;
  const chips = h("div", { class: "chips" },
    answers
      ? [h("span", { class: "chip" }, `${answers} answers`),
         h("span", { class: "chip" }, `${Math.round((correct / answers) * 100)}% correct`),
         h("span", { class: "chip" }, `${meta.failed_count} to review`)]
      : h("span", { class: "chip" }, "No history yet — results are saved locally"));

  show(
    h("div", {}, h("h1", {}, "Test your Java fundamentals"),
      h("p", { class: "muted" }, "Practice questions locally and review the ones you miss."), chips),
    h("div", { class: "card stack", style: "margin-top:16px" },
      h("div", { class: "field" }, h("label", { class: "title" }, "Mode"), modeGrid),
      h("div", { class: "field" }, h("label", { class: "title" }, "Topic"), topicSelect),
      h("div", { class: "field" }, h("label", { class: "title" }, "Difficulty"),
        seg([{ value: "", label: "All" }, ...meta.difficulties.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))],
          () => cfg.difficulty, (v) => { cfg.difficulty = v; refresh(); })),
      h("div", { class: "field" }, h("label", { class: "title" }, "Number of questions"),
        seg(["10", "20", "30", "all"].map((v) => ({ value: v, label: v === "all" ? "All" : v })),
          () => cfg.amount, (v) => (cfg.amount = v))),
      balancedRow, failedRow,
      h("div", { class: "row between" }, info, startBtn)));
  refresh();
}

// ---------- quiz ----------
function startQuiz(st) {
  view = "quiz";
  sessionStorage.setItem("sid", st.id);
  quiz = { st, selected: new Set(), feedback: st.feedback, busy: false };
  if (st.feedback) st.feedback.selected.forEach((l) => quiz.selected.add(l));
  drawQuiz();
}

function drawQuiz() {
  const { st, feedback: fb } = quiz;
  const q = st.question;
  const last = st.index === st.total - 1;
  const done = st.index + (fb ? 1 : 0);

  const options = h("div", { class: "options" }, Object.entries(q.options).map(([letter, text]) => {
    const input = h("input", { type: q.multiple ? "checkbox" : "radio", name: "opt", value: letter, disabled: !!fb });
    input.checked = quiz.selected.has(letter);
    input.addEventListener("change", () => setSelected(letter, input.checked));
    let cls = "option", mark = "";
    if (fb) {
      cls += " locked";
      if (fb.correct_answers.includes(letter)) { cls += " correct"; mark = "✔"; }
      else if (fb.selected.includes(letter)) { cls += " wrong"; mark = "✘"; }
    }
    return h("label", { class: cls }, input, h("span", { class: "badge" }, letter),
      h("span", { class: "text" }, richText(text)), mark && h("span", { class: "mark" }, mark));
  }));

  const hint = h("span", { class: "hint", id: "hint" });
  const label = !fb && !st.answered && st.mode === "practice" ? "Submit" : last ? "Finish" : "Next";

  show(
    h("div", { class: "stack" },
      h("div", {},
        h("div", { class: "row between", style: "margin-bottom:8px" },
          h("span", { class: "muted" }, st.mode === "practice" ? "Practice mode" : "Exam mode"),
          h("strong", {}, `Question ${st.index + 1} / ${st.total}`)),
        h("div", { class: "progress" }, h("div", { style: `width:${(done / st.total) * 100}%` }))),
      h("div", { class: "card stack" },
        h("div", { class: "meta" },
          h("span", { class: "pill" }, q.topic_name), difficultyPill(q.difficulty),
          h("span", { class: "pill neutral" }, q.multiple ? "Multiple answers" : "Single answer"),
          h("span", { class: "muted", style: "font-size:.85rem" }, `#${q.id}`)),
        h("div", { class: "question" }, richText(q.question)),
        q.code && codeBlock(q.code),
        options,
        fb && h("div", { class: "feedback " + (fb.correct ? "ok" : "ko"), id: "feedback" },
          h("div", { class: "verdict" }, fb.correct ? "✔ Correct" : `✘ Incorrect — correct answer: ${fb.correct_answers.join(", ")}`),
          h("div", {}, richText(fb.explanation)))),
      h("div", { class: "row between" },
        h("button", { class: "btn ghost", onClick: endEarly }, "End exam"),
        h("div", { class: "row" }, hint, h("span", { class: "kbd" }, "Keys: letters to select · Enter to continue"),
          h("button", { class: "btn primary", id: "primary", onClick: primary }, label)))));
  document.getElementById("feedback")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function setHint(text) {
  const el = document.getElementById("hint");
  if (el) el.textContent = text;
}

function setSelected(letter, on) {
  if (quiz.feedback) return;
  if (quiz.st.question.multiple) on ? quiz.selected.add(letter) : quiz.selected.delete(letter);
  else quiz.selected = new Set(on ? [letter] : []);
  document.querySelectorAll(".option input").forEach((i) => (i.checked = quiz.selected.has(i.value)));
  setHint("");
}

async function primary() {
  if (!quiz || quiz.busy) return;
  quiz.busy = true;
  try {
    if (quiz.feedback || quiz.st.answered) {
      await nextQuestion();
    } else {
      if (!quiz.selected.size) { setHint("Select at least one option."); return; }
      const r = await api(`/sessions/${quiz.st.id}/answer`, { method: "POST", body: { selected: [...quiz.selected] } });
      if (quiz.st.mode === "practice") { quiz.feedback = r; drawQuiz(); }
      else await nextQuestion();
    }
  } catch (e) { setHint(e.message); }
  finally { if (quiz) quiz.busy = false; }
}

async function nextQuestion() {
  const id = quiz.st.id;
  const r = await api(`/sessions/${id}/next`, { method: "POST" });
  if (r.finished) await showResults(id);
  else startQuiz(r);
}

async function endEarly() {
  const answered = quiz.st.index + (quiz.feedback ? 1 : 0);
  if (!confirm(answered ? "End now and see the results so far?" : "Leave this exam?")) return;
  if (answered) await showResults(quiz.st.id); else showStart();
}

document.addEventListener("keydown", (e) => {
  if (view !== "quiz" || !quiz || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Enter") { e.preventDefault(); primary(); return; }
  const letter = e.key.length === 1 ? e.key.toUpperCase() : "";
  if (letter && letter in quiz.st.question.options && !quiz.feedback) {
    setSelected(letter, quiz.st.question.multiple ? !quiz.selected.has(letter) : true);
  }
});

// ---------- results ----------
function reviewOption(letter, text, item) {
  let cls = "option locked", mark = "";
  if (item.correct_answers.includes(letter)) { cls += " correct"; mark = "✔"; }
  else if (item.selected.includes(letter)) { cls += " wrong"; mark = "✘ your answer"; }
  return h("div", { class: cls }, h("span", { class: "badge" }, letter),
    h("span", { class: "text" }, richText(text)), mark && h("span", { class: "mark" }, mark));
}

async function showResults(id) {
  view = "results";
  quiz = null;
  let r;
  try { r = await api(`/sessions/${id}/results`); } catch (e) { return errorView(e); }
  const C = 2 * Math.PI * 60;
  const color = verdictColor(r.percentage);
  const ring = h("div", { class: "ring" });
  ring.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="60" fill="none" style="stroke:var(--border)" stroke-width="12"/>
    <circle cx="70" cy="70" r="60" fill="none" style="stroke:${color}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${(C * r.percentage) / 100} ${C}"/></svg>
    <div class="label">${Math.round(r.percentage)}%</div>`;
  const verdict = r.percentage >= 80 ? "Excellent" : r.percentage >= 60 ? "Good — keep practicing" : "More practice recommended";

  const practiceFailed = h("button", { class: "btn", disabled: r.failed_count === 0, onClick: async () => {
    try { const s = await api(`/sessions/${id}/practice-failed`, { method: "POST" }); startQuiz(await api("/sessions/" + s.id)); }
    catch (e) { errorView(e); }
  } }, `Practice failed (${r.failed_count})`);

  show(h("div", { class: "stack" },
    h("div", { class: "card summary" }, ring,
      h("div", {}, h("h1", { style: "margin-top:0" }, `${r.score} / ${r.answered} correct`),
        h("p", { class: "muted", style: "margin:0" }, verdict + (r.answered < r.total ? ` · ended early (${r.answered} of ${r.total} answered)` : "")))),
    h("div", { class: "row" }, h("button", { class: "btn primary", onClick: showStart }, "New exam"), practiceFailed),
    h("div", { class: "card" }, h("h2", {}, "By topic (weakest first)"),
      r.breakdown.map((b) => {
        const pct = (b.correct / b.total) * 100;
        return h("div", { class: "bar-row" }, h("span", {}, b.name),
          h("div", { class: "bar" }, h("div", { style: `width:${pct}%;background:${verdictColor(pct)}` })),
          h("span", { class: "num" }, `${b.correct}/${b.total}`));
      })),
    h("div", {}, h("h2", {}, "Review answers"),
      r.review.map((item, i) => h("details", { class: "review" },
        h("summary", {},
          h("span", { class: "status " + (item.correct ? "ok" : "ko") }, item.correct ? "✔" : "✘"),
          h("span", { class: "muted" }, `${i + 1}.`),
          h("span", { class: "grow" }, item.topic_name), difficultyPill(item.difficulty),
          h("span", { class: "muted", style: "font-size:.85rem" }, `Yours: ${item.selected.join(", ")} · Correct: ${item.correct_answers.join(", ")}`)),
        h("div", { class: "body stack" },
          h("div", { class: "question" }, richText(item.question)),
          item.code && codeBlock(item.code),
          h("div", { class: "options" }, Object.entries(item.options).map(([l, t]) => reviewOption(l, t, item))),
          h("div", { class: "feedback " + (item.correct ? "ok" : "ko") }, richText(item.explanation))))))));
}

// ---------- boot ----------
document.getElementById("home").addEventListener("click", (e) => { e.preventDefault(); showStart(); });
document.getElementById("theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});

(async function init() {
  const sid = sessionStorage.getItem("sid");
  if (sid) {
    try {
      const st = await api("/sessions/" + sid);
      return st.finished ? showResults(sid) : startQuiz(st);
    } catch { /* stale session: fall through */ }
  }
  showStart();
})();
