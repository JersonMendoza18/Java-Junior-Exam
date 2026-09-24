from dataclasses import dataclass
from enum import Enum

from .question import Question


class Mode(str, Enum):
    PRACTICE = "practice"  # feedback + explanation after every answer
    EXAM = "exam"          # no feedback until the end


@dataclass(frozen=True)
class QuestionResult:
    question: Question
    selected: frozenset[str]
    correct: bool


class ExamSession:
    """State of one run through a list of questions. Knows nothing about any UI."""

    def __init__(self, questions: list[Question], mode: Mode = Mode.PRACTICE):
        if not questions:
            raise ValueError("The exam requires at least one question.")
        self.questions = list(questions)
        self.mode = mode
        self.results: list[QuestionResult] = []
        self._index = 0

    # --- navigation -------------------------------------------------------
    @property
    def total(self) -> int:
        return len(self.questions)

    @property
    def index(self) -> int:
        return self._index

    @property
    def current_question(self) -> Question:
        return self.questions[self._index]

    @property
    def is_last(self) -> bool:
        return self._index == self.total - 1

    @property
    def is_finished(self) -> bool:
        return len(self.results) == self.total

    @property
    def current_answered(self) -> bool:
        return len(self.results) > self._index

    def submit_answer(self, selected: set[str]) -> QuestionResult:
        if self.current_answered:
            raise RuntimeError("The current question was already answered.")
        question = self.current_question
        selected = frozenset(selected)
        if not selected or not selected <= set(question.options):
            raise ValueError("Invalid selection.")
        if not question.is_multiple_choice and len(selected) != 1:
            raise ValueError("This question accepts exactly one answer.")

        result = QuestionResult(question, selected, selected == question.correct_answers)
        self.results.append(result)
        return result

    def next_question(self) -> Question:
        if not self.current_answered:
            raise RuntimeError("Answer the current question first.")
        if self.is_finished:
            raise RuntimeError("The exam is finished.")
        self._index += 1
        return self.current_question

    # --- results ----------------------------------------------------------
    @property
    def score(self) -> int:
        return sum(r.correct for r in self.results)

    @property
    def percentage(self) -> float:
        return self.score / len(self.results) * 100 if self.results else 0.0

    def topic_breakdown(self) -> dict[str, tuple[int, int]]:
        """{topic_id: (correct, total)} for the answered questions."""
        stats: dict[str, tuple[int, int]] = {}
        for r in self.results:
            ok, total = stats.get(r.question.topic, (0, 0))
            stats[r.question.topic] = (ok + r.correct, total + 1)
        return stats

    def failed_questions(self) -> list[Question]:
        return [r.question for r in self.results if not r.correct]
