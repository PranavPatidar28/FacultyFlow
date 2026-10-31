import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import solve


def fixture():
    return {"settings": {"days": [1, 2], "periods": [{"id": 0, "break": False}, {"id": 1, "break": False}, {"id": 2, "break": True}, {"id": 3, "break": False}]}, "faculty": [{"id": "f1", "subjects": ["s1"], "target": 4, "maxWeekly": 6, "maxDaily": 3, "maxConsecutive": 2, "unavailable": [], "preferred": []}, {"id": "f2", "subjects": ["s1"], "target": 4, "maxWeekly": 6, "maxDaily": 3, "maxConsecutive": 2, "unavailable": [], "preferred": []}], "rooms": [{"id": "r1", "type": "lab", "capacity": 40}], "sections": [{"id": "sec1", "size": 30}], "requirements": [{"id": "req1", "subjectId": "s1", "sectionId": "sec1", "kind": "lab", "duration": 2, "sessions": 2}], "locks": []}


class SolverTests(unittest.TestCase):
    def test_consecutive_labs_and_ownership(self):
        result = solve(fixture(), 3)
        self.assertIn(result["status"], ["OPTIMAL", "FEASIBLE"])
        self.assertEqual(len(result["entries"]), 2)
        self.assertEqual(len(set(e["facultyId"] for e in result["entries"])), 1)
        self.assertTrue(all(e["period"] == 0 for e in result["entries"]))

    def test_missing_qualification(self):
        data = fixture()
        for f in data["faculty"]:
            f["subjects"] = []
        self.assertEqual(solve(data, 2)["status"], "INFEASIBLE")

    def test_impossible_capacity(self):
        data = fixture()
        data["sections"][0]["size"] = 50
        self.assertEqual(solve(data, 2)["status"], "INFEASIBLE")

    def test_locked_assignment(self):
        data = fixture()
        data["locks"] = [{"requirementId": "req1", "facultyId": "f2", "day": 1, "period": 0, "roomId": "r1"}]
        result = solve(data, 3)
        self.assertTrue(any(e["facultyId"] == "f2" and e["day"] == 1 and e["locked"] for e in result["entries"]))

    def test_unavailable_period(self):
        data = fixture()
        for f in data["faculty"]:
            f["unavailable"] = ["1:0", "2:0"]
        self.assertEqual(solve(data, 2)["status"], "INFEASIBLE")

    def test_timeout_is_unknown(self):
        self.assertEqual(solve(fixture(), 0)["status"], "UNKNOWN")

    def test_shared_room(self):
        data = fixture()
        data["sections"].append({"id": "sec2", "size": 20})
        data["requirements"].append({**data["requirements"][0], "id": "req2", "sectionId": "sec2"})
        self.assertEqual(solve(data, 3)["status"], "INFEASIBLE")


if __name__ == "__main__":
    unittest.main()
