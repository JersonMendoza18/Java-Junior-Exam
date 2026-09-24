import json
from pathlib import Path

from .question import Question

VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_TYPES = {"single", "multiple"}


def load_topics(path: Path) -> dict[str, str]:
    """Return {topic_id: topic_name} from topics.json."""
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return {topic["id"]: topic["name"] for topic in data["topics"]}


def load_questions(
    path: Path, valid_topics: set[str] | None = None
) -> list[Question]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    questions: list[Question] = []
    seen_ids: set[int] = set()

    for raw in data.get("questions", []):
        _validate(raw, valid_topics)

        if raw["id"] in seen_ids:
            raise ValueError(f"Duplicate question id: {raw['id']}")
        seen_ids.add(raw["id"])

        questions.append(
            Question(
                id=raw["id"],
                topic=raw["topic"],
                difficulty=raw["difficulty"],
                type=raw["type"],
                question=raw["question"],
                options=raw["options"],
                correct_answers=frozenset(raw["correct_answers"]),
                explanation=raw["explanation"],
                code=raw.get("code"),
                tags=tuple(raw.get("tags", [])),
            )
        )

    return questions


def _validate(question: dict, valid_topics: set[str] | None) -> None:
    required = {
        "id", "topic", "difficulty", "type", "question",
        "options", "correct_answers", "explanation",
    }
    missing = required - question.keys()
    if missing:
        raise ValueError(
            f"Question {question.get('id', '?')} is missing: {sorted(missing)}"
        )

    qid = question["id"]

    if valid_topics is not None and question["topic"] not in valid_topics:
        raise ValueError(f"Unknown topic in question {qid}: {question['topic']}")

    if question["difficulty"] not in VALID_DIFFICULTIES:
        raise ValueError(
            f"Invalid difficulty in question {qid}: {question['difficulty']}"
        )

    if question["type"] not in VALID_TYPES:
        raise ValueError(f"Invalid question type in question {qid}: {question['type']}")

    correct = set(question["correct_answers"])
    if not correct:
        raise ValueError(f"Question {qid} has no correct answer.")

    if not correct.issubset(set(question["options"])):
        raise ValueError(
            f"Question {qid} has a correct answer that is not present in its options."
        )

    if question["type"] == "single" and len(correct) != 1:
        raise ValueError(
            f"Question {qid} is single-choice but has {len(correct)} correct answers."
        )
    # "multiple" questions may have one or more correct answers (intentional).
