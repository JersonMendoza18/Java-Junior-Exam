import unittest
from pathlib import Path

from core.exam import ExamSession, Mode
from core.progress import ProgressStore
from core.question_loader import load_questions, load_topics
from core.selection import filter_questions, select_questions

DATA = Path(__file__).resolve().parent.parent / "data"


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.topics = load_topics(DATA / "topics.json")
        self.questions = load_questions(DATA / "questions.json", set(self.topics))

    def test_bank_loads(self):
        self.assertEqual(len(self.questions), 200)

    def test_balanced_selection_covers_topics(self):
        picked = select_questions(self.questions, 20, balanced=True)
        counts = {}
        for q in picked:
            counts[q.topic] = counts.get(q.topic, 0) + 1
        self.assertEqual(len(picked), 20)
        self.assertEqual(len(counts), 10)
        self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)

    def test_filters(self):
        easy = filter_questions(self.questions, difficulty="easy")
        self.assertTrue(all(q.difficulty == "easy" for q in easy))

    def test_session_flow(self):
        session = ExamSession(self.questions[:2], Mode.EXAM)
        q = session.current_question
        session.submit_answer(set(q.correct_answers))
        session.next_question()
        session.submit_answer({next(iter(session.current_question.options))})
        self.assertTrue(session.is_finished)
        self.assertEqual(session.score + len(session.failed_questions()), 2)

    def test_cannot_answer_twice(self):
        session = ExamSession(self.questions[:1])
        session.submit_answer({next(iter(session.current_question.options))})
        with self.assertRaises(RuntimeError):
            session.submit_answer({"A"})

    def test_progress_roundtrip(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "progress.json"
            session = ExamSession(self.questions[:1])
            session.submit_answer({"A"})
            store = ProgressStore(path)
            store.record(session.results)
            again = ProgressStore(path)
            self.assertEqual(again.summary()[0], 1)
            self.assertEqual(again.failed_ids(), {self.questions[0].id} if not session.results[0].correct else set())


if __name__ == "__main__":
    unittest.main()
