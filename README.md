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

## Questions

Edit `data/questions.json`. The loader validates it at startup and names the offending question.
Text in backticks is rendered as inline code in questions, options and explanations.
`code` is shown as a highlighted Java block with line numbers and a copy button.
