from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Question:
    id: int
    topic: str
    difficulty: str
    type: str
    question: str
    options: dict[str, str]
    correct_answers: frozenset[str]
    explanation: str
    code: Optional[str] = None
    tags: tuple[str, ...] = ()

    @property
    def is_multiple_choice(self) -> bool:
        return self.type == "multiple"
