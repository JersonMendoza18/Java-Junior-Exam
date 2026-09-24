"""Local web API + static frontend. All exam rules live in `core`."""
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from core.exam import ExamSession, Mode, QuestionResult
from core.progress import ProgressStore
from core.question import Question
from core.selection import filter_questions, select_questions

STATIC_DIR = Path(__file__).resolve().parent / "static"
DIFFICULTIES = ["easy", "medium", "hard"]


class SessionConfig(BaseModel):
    mode: Mode = Mode.PRACTICE
    topic: str | None = None
    difficulty: str | None = None
    amount: int | None = Field(default=None, gt=0)  # None = all matching
    balanced: bool = False
    failed_only: bool = False


class AnswerBody(BaseModel):
    selected: list[str]


@dataclass
class Entry:
    session: ExamSession
    recorded: bool = False  # progress is saved once per session


def create_app(questions: list[Question], topics: dict[str, str], progress: ProgressStore) -> FastAPI:
    app = FastAPI(title="Java Junior Assessment", docs_url="/api/docs", redoc_url=None)
    sessions: dict[str, Entry] = {}

    # --- serialization ------------------------------------------------------
    def topic_name(topic_id: str) -> str:
        return topics.get(topic_id, topic_id)

    def public_question(q: Question) -> dict:
        """Everything the UI needs to show a question, without the answers."""
        return {
            "id": q.id,
            "topic": q.topic,
            "topic_name": topic_name(q.topic),
            "difficulty": q.difficulty,
            "multiple": q.is_multiple_choice,
            "question": q.question,
            "code": q.code,
            "options": q.options,
        }

    def feedback(result: QuestionResult) -> dict:
        return {
            "correct": result.correct,
            "selected": sorted(result.selected),
            "correct_answers": sorted(result.question.correct_answers),
            "explanation": result.question.explanation,
        }

    def state(session_id: str, entry: Entry) -> dict:
        s = entry.session
        data = {
            "id": session_id,
            "mode": s.mode.value,
            "index": s.index,
            "total": s.total,
            "finished": s.is_finished,
            "answered": s.current_answered,
            "question": public_question(s.current_question),
            "feedback": None,
        }
        if s.current_answered and s.mode is Mode.PRACTICE:
            data["feedback"] = feedback(s.results[s.index])
        return data

    def get_entry(session_id: str) -> Entry:
        entry = sessions.get(session_id)
        if entry is None:
            raise HTTPException(404, "Session not found.")
        return entry

    def pool_for(topic, difficulty, failed_only) -> list[Question]:
        return filter_questions(
            questions,
            topic=topic or None,
            difficulty=difficulty or None,
            ids=progress.failed_ids() if failed_only else None,
        )

    def new_session(qs: list[Question], mode: Mode) -> dict:
        session_id = uuid.uuid4().hex
        sessions[session_id] = Entry(ExamSession(qs, mode))
        return {"id": session_id, "total": len(qs), "mode": mode.value}

    # --- API ----------------------------------------------------------------
    @app.get("/api/meta")
    def meta():
        attempts, correct = progress.summary()
        return {
            "total": len(questions),
            "topics": [
                {"id": tid, "name": name, "count": sum(q.topic == tid for q in questions)}
                for tid, name in topics.items()
            ],
            "difficulties": DIFFICULTIES,
            "history": {"answers": attempts, "correct": correct},
            "failed_count": len(progress.failed_ids()),
        }

    @app.get("/api/pool")
    def pool(topic: str = "", difficulty: str = "", failed_only: bool = False):
        return {"count": len(pool_for(topic, difficulty, failed_only))}

    @app.post("/api/sessions")
    def create_session(cfg: SessionConfig):
        pool = pool_for(cfg.topic, cfg.difficulty, cfg.failed_only)
        if not pool:
            raise HTTPException(400, "No questions match these filters.")
        amount = min(cfg.amount or len(pool), len(pool))
        balanced = cfg.balanced and not cfg.topic
        return new_session(select_questions(pool, amount, balanced=balanced), cfg.mode)

    @app.get("/api/sessions/{session_id}")
    def get_session(session_id: str):
        return state(session_id, get_entry(session_id))

    @app.post("/api/sessions/{session_id}/answer")
    def answer(session_id: str, body: AnswerBody):
        s = get_entry(session_id).session
        try:
            result = s.submit_answer(set(body.selected))
        except ValueError as error:
            raise HTTPException(400, str(error))
        except RuntimeError as error:
            raise HTTPException(409, str(error))
        # Exam mode never reveals anything before the results.
        return feedback(result) if s.mode is Mode.PRACTICE else {"recorded": True}

    @app.post("/api/sessions/{session_id}/next")
    def next_question(session_id: str):
        entry = get_entry(session_id)
        s = entry.session
        if not s.current_answered:
            raise HTTPException(409, "Answer the current question first.")
        if s.is_finished:
            return {"finished": True}
        s.next_question()
        return state(session_id, entry)

    @app.get("/api/sessions/{session_id}/results")
    def results(session_id: str):
        entry = get_entry(session_id)
        s = entry.session
        if s.results and not entry.recorded:
            progress.record(s.results)
            entry.recorded = True
        return {
            "score": s.score,
            "answered": len(s.results),
            "total": s.total,
            "percentage": round(s.percentage, 1),
            "failed_count": len(s.failed_questions()),
            "breakdown": sorted(
                (
                    {"topic": t, "name": topic_name(t), "correct": ok, "total": n}
                    for t, (ok, n) in s.topic_breakdown().items()
                ),
                key=lambda row: row["correct"] / row["total"],
            ),
            "review": [
                {**public_question(r.question), **feedback(r)} for r in s.results
            ],
        }

    @app.post("/api/sessions/{session_id}/practice-failed")
    def practice_failed(session_id: str):
        failed = get_entry(session_id).session.failed_questions()
        if not failed:
            raise HTTPException(400, "There are no failed questions.")
        return new_session(select_questions(failed), Mode.PRACTICE)

    # --- frontend -----------------------------------------------------------
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-store"})

    return app
