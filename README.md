# Java Junior Assessment (local web app)

Personal practice tool for Java Junior questions. Runs only on your machine (`127.0.0.1`).

## Run

```bash
pip install -r requirements.txt     # fastapi + uvicorn
python main.py                      # opens http://127.0.0.1:8000
python -m unittest                  # core + API tests
```

## Structure

```text
java_junior_exam/
├── main.py                  # loads data, starts the local server, opens the browser
├── core/                    # exam rules; knows nothing about the web
│   ├── question.py, question_loader.py, selection.py, exam.py, progress.py
├── web/
│   ├── server.py            # FastAPI: thin JSON API over core (sessions kept in memory)
│   └── static/              # index.html, style.css, app.js (no build step)
│       └── vendor/          # highlight.js, bundled so it works offline
├── data/
│   ├── questions.json, topics.json
│   └── progress.json        # created automatically (git-ignored)
└── tests/
```

The browser never receives the correct answers of a question before it is answered
(and in Exam mode never until the results), because answers are evaluated in `core`
on the server side. Interactive API docs: http://127.0.0.1:8000/api/docs

## Portable version (single HTML file, no server, no Python)

```bash
python build_portable.py    # writes dist/java_junior_exam_portable.html
```

That one file has everything inlined — all 200 questions, styles, and the Java syntax
highlighter — and runs entirely in the browser with no backend. Copy it anywhere
(email it to yourself, drop it in a cloud-synced folder, AirDrop it, send it over
USB) and open it directly on your phone or PC; nothing needs to be installed or running.

Rebuild it any time the question bank or the web app's source changes — it does not
update itself, since it is a frozen snapshot.

**Trade-offs of opening it as a local file (`file://`):**
- **History may not persist.** The portable file saves your practice history with
  the browser's `localStorage`, keyed to that file. Some browsers (notably Firefox)
  restrict storage for pages opened straight from disk, so your history might reset
  between sessions. Chrome and mobile Chrome are generally more reliable for this.
  If it doesn't persist, the app still works fine — it just always starts empty.
  Answers are never at risk either way, since correctness is computed in the browser.
- **Answers are visible in the page source.** Unlike the server version, there is no
  backend to hide `correct_answers` before you submit — everything is embedded in
  the file. Fine for solo studying, not for anything where cheating matters.
- **If you want history to reliably persist**, either keep using the local-server
  version (`python main.py`), or host this single file on any static web host (even
  a free one like GitHub Pages) so it loads from a real `https://` origin instead of
  `file://`.

## Questions

Edit `data/questions.json`. The loader validates it at startup and names the offending question.
Text in backticks is rendered as inline code in questions, options and explanations.
`code` is shown as a highlighted Java block with line numbers and a copy button.
