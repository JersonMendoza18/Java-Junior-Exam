import json
import os
from pathlib import Path

from .exam import QuestionResult


class ProgressStore:
    """Remembers, per question, how many times it was answered and the last outcome."""

    def __init__(self, path: Path):
        self.path = path
        self._data = self._load()

    def _load(self) -> dict:
        try:
            with self.path.open("r", encoding="utf-8") as file:
                data = json.load(file)
            if isinstance(data.get("questions"), dict):
                return data
        except (FileNotFoundError, json.JSONDecodeError, AttributeError):
            pass
        return {"questions": {}}

    def record(self, results: list[QuestionResult]) -> None:
        for r in results:
            entry = self._data["questions"].setdefault(
                str(r.question.id), {"attempts": 0, "correct": 0, "last_correct": None}
            )
            entry["attempts"] += 1
            entry["correct"] += int(r.correct)
            entry["last_correct"] = r.correct
        self._save()

    def _save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as file:
            json.dump(self._data, file, indent=2)
        os.replace(tmp, self.path)

    def failed_ids(self) -> set[int]:
        """Questions whose most recent attempt was wrong."""
        return {
            int(qid)
            for qid, entry in self._data["questions"].items()
            if entry["last_correct"] is False
        }

    def summary(self) -> tuple[int, int]:
        """(total answers given, total correct)."""
        entries = self._data["questions"].values()
        return sum(e["attempts"] for e in entries), sum(e["correct"] for e in entries)
