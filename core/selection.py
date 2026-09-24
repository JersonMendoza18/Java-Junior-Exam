import random
from collections import defaultdict
from collections.abc import Iterable

from .question import Question


def filter_questions(
    questions: Iterable[Question],
    *,
    topic: str | None = None,
    difficulty: str | None = None,
    ids: set[int] | None = None,
) -> list[Question]:
    result = list(questions)
    if topic:
        result = [q for q in result if q.topic == topic]
    if difficulty:
        result = [q for q in result if q.difficulty == difficulty]
    if ids is not None:
        result = [q for q in result if q.id in ids]
    return result


def select_questions(
    questions: Iterable[Question],
    amount: int | None = None,
    *,
    balanced: bool = False,
    rng=random,
) -> list[Question]:
    """Pick `amount` questions (all if None), in random order.

    balanced=True spreads the picks evenly across topics (round-robin)
    instead of a plain random sample.
    """
    pool = list(questions)
    if amount is None:
        amount = len(pool)
    if not 0 < amount <= len(pool):
        raise ValueError(f"Cannot select {amount} questions from a pool of {len(pool)}.")

    if not balanced:
        return rng.sample(pool, amount)

    by_topic: dict[str, list[Question]] = defaultdict(list)
    for question in pool:
        by_topic[question.topic].append(question)

    groups = list(by_topic.values())
    for group in groups:
        rng.shuffle(group)
    rng.shuffle(groups)

    chosen: list[Question] = []
    while len(chosen) < amount:
        for group in groups:
            if group and len(chosen) < amount:
                chosen.append(group.pop())

    rng.shuffle(chosen)
    return chosen
