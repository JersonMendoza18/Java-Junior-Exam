import json
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

from core.progress import ProgressStore
from core.question_loader import load_questions, load_topics
from web.server import create_app

DATA_DIR = Path(__file__).resolve().parent / "data"
HOST, PORT = "127.0.0.1", 8000  # loopback only: not reachable from other machines


def main() -> None:
    try:
        topics = load_topics(DATA_DIR / "topics.json")
        questions = load_questions(DATA_DIR / "questions.json", valid_topics=set(topics))
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        sys.exit(f"Could not load the question bank: {error}")

    app = create_app(questions, topics, ProgressStore(DATA_DIR / "progress.json"))
    threading.Timer(1.0, lambda: webbrowser.open(f"http://{HOST}:{PORT}")).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
