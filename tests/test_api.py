import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from core.progress import ProgressStore
from core.question_loader import load_questions, load_topics
from web.server import create_app

DATA = Path(__file__).resolve().parent.parent / "data"


class ApiTests(unittest.TestCase):
    def setUp(self):
        topics = load_topics(DATA / "topics.json")
        self.questions = {q.id: q for q in load_questions(DATA / "questions.json", set(topics))}
        self.tmp = tempfile.TemporaryDirectory()
        self.progress = ProgressStore(Path(self.tmp.name) / "progress.json")
        self.client = TestClient(create_app(list(self.questions.values()), topics, self.progress))

    def tearDown(self):
        self.tmp.cleanup()

    def start(self, **cfg):
        r = self.client.post("/api/sessions", json=cfg)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["id"]

    def test_question_payload_never_leaks_answers(self):
        sid = self.start(mode="exam", amount=3)
        body = self.client.get(f"/api/sessions/{sid}").json()
        self.assertNotIn("correct_answers", body["question"])
        self.assertNotIn("explanation", body["question"])
        self.assertIsNone(body["feedback"])

    def test_exam_mode_hides_feedback_practice_shows_it(self):
        exam, practice = self.start(mode="exam", amount=1), self.start(mode="practice", amount=1)
        for sid, key in ((exam, "recorded"), (practice, "correct_answers")):
            q = self.client.get(f"/api/sessions/{sid}").json()["question"]
            r = self.client.post(f"/api/sessions/{sid}/answer", json={"selected": [next(iter(q["options"]))]})
            self.assertIn(key, r.json())

    def test_full_flow_records_progress_once(self):
        sid = self.start(mode="practice", amount=3, balanced=True)
        for _ in range(3):
            q = self.client.get(f"/api/sessions/{sid}").json()["question"]
            self.client.post(f"/api/sessions/{sid}/answer", json={"selected": [next(iter(q["options"]))]})
            r = self.client.post(f"/api/sessions/{sid}/next").json()
        self.assertTrue(r.get("finished"))
        res = self.client.get(f"/api/sessions/{sid}/results").json()
        self.client.get(f"/api/sessions/{sid}/results")  # second call must not double count
        self.assertEqual(res["answered"], 3)
        self.assertEqual(self.progress.summary()[0], 3)
        self.assertEqual(len(res["review"]), 3)

    def test_errors(self):
        sid = self.start(amount=1)
        self.assertEqual(self.client.post(f"/api/sessions/{sid}/next").status_code, 409)
        self.assertEqual(self.client.post(f"/api/sessions/{sid}/answer", json={"selected": []}).status_code, 400)
        self.assertEqual(self.client.get("/api/sessions/nope").status_code, 404)
        self.assertEqual(self.client.post("/api/sessions", json={"topic": "nope"}).status_code, 400)

    def test_meta_pool_and_static(self):
        meta = self.client.get("/api/meta").json()
        self.assertEqual(meta["total"], 50)
        self.assertEqual(self.client.get("/api/pool?difficulty=easy").json()["count"], 15)
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/static/vendor/highlight.min.js").status_code, 200)


if __name__ == "__main__":
    unittest.main()
