"""Builds a single, self-contained HTML file with no server and no dependencies:
all questions, styles, scripts and libraries are inlined. Open it directly in any
browser (double-click, or copy it to a phone) — no Python, no network required.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "web" / "static"
PORTABLE = STATIC / "portable"
OUT = ROOT / "dist" / "java_junior_exam_portable.html"

questions = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))["questions"]
topics = {t["id"]: t["name"] for t in json.loads((ROOT / "data" / "topics.json").read_text(encoding="utf-8"))["topics"]}

data_js = (
    "const QUESTIONS = " + json.dumps(questions, ensure_ascii=False) + ";\n"
    "const TOPICS = " + json.dumps(topics, ensure_ascii=False) + ";\n"
)

style_css = (STATIC / "style.css").read_text(encoding="utf-8")
hljs_css = (STATIC / "vendor" / "github-dark.min.css").read_text(encoding="utf-8")
hljs_js = (STATIC / "vendor" / "highlight.min.js").read_text(encoding="utf-8")
engine_js = (PORTABLE / "engine.js").read_text(encoding="utf-8")
app_js = (PORTABLE / "app.portable.js").read_text(encoding="utf-8")

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Java Junior Assessment (portable)</title>
<script>
  let saved = null;
  try {{ saved = localStorage.getItem("theme"); }} catch (e) {{ /* storage unavailable */ }}
  document.documentElement.dataset.theme =
    saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
</script>
<style>
/* --- highlight.js theme (github-dark) --- */
{hljs_css}
/* --- app styles --- */
{style_css}
</style>
</head>
<body>
  <header class="topbar">
    <a class="brand" id="home" href="#">☕ Java Junior Assessment</a>
    <button id="theme" class="icon-btn" title="Toggle light/dark theme" aria-label="Toggle theme">◐</button>
  </header>
  <main id="app"></main>
  <script>
  /* ===== highlight.js (vendored, MIT license) ===== */
  {hljs_js}
  </script>
  <script>
  /* ===== embedded question bank ({len(questions)} questions) ===== */
  {data_js}
  </script>
  <script>
  /* ===== local engine: replaces the FastAPI backend, no network calls ===== */
  {engine_js}
  </script>
  <script>
  /* ===== UI (same as the local-server version) ===== */
  {app_js}
  </script>
</body>
</html>
"""

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB), {len(questions)} questions, {len(topics)} topics")
