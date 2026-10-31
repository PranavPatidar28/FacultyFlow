import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from repair import solve_repair


def repair_fixture():
    periods = [{"id": i, "break": i in [2, 5]} for i in range(8)]
    return {"mode": "repair", "date": "2030-01-07", "settings": {"periods": periods}, "faculty": [{"id": f'f{i}', "subjects": ["subject"], "unavailable": [], "maxDaily": 5, "maxWeekly": 10, "maxConsecutive": 3} for i in range(1, 4)], "rooms": [{"id": f'r{i}', "type": "lecture", "capacity": 40} for i in range(1, 4)], "sections": [{"id": f's{i}', "size": 30} for i in range(1, 4)], "requirements": [{"id": f'q{i}', "subjectId": "subject", "kind": "lecture"} for i in range(1, 4)], "occurrences": [{"id": f'o{i}', "facultyId": f'f{i}', "sectionId": f's{i}', "requirementId": f'q{i}', "roomId": "r2" if i == 3 else "r1", "period": 1 if i == 2 else 0, "duration": 1} for i in range(1, 4)], "movableIds": ["o1", "o2"], "activeOccurrenceIds": ["o1", "o2", "o3"], "targetIds": ["o1"], "closures": [{"roomId": "r1", "periods": [0]}], "absences": [], "weeklyLoads": {}, "futurePeriods": [0, 1, 3, 4, 6, 7]}


def chain_fixture():
    data = repair_fixture()
    data["rooms"] = data["rooms"][:2]
    data["closures"] = [{"roomId": "r2", "periods": [1]}]
    data["absences"] = [{"facultyId": "f1", "periods": [0]}]
    data["faculty"][0]["unavailable"] = [f'1:{p}' for p in [3, 4, 6, 7]]
    data["faculty"][1]["unavailable"] = [f'1:{p}' for p in [0, 4, 6, 7]]
    return data


class RepairTests(unittest.TestCase):
    def test_room_only_change_has_priority(self):
        result = solve_repair(repair_fixture(), 3)
        self.assertEqual(result["status"], "OPTIMAL")
        self.assertEqual(result["quality"]["timeChanges"], 0)
        self.assertEqual(result["quality"]["classesChanged"], 1)
        self.assertEqual(next(a for a in result["assignments"] if a["occurrenceId"] == "o1")["roomId"], "r3")

    def test_partial_absence_moves_original_teacher_class(self):
        data = repair_fixture()
        data["closures"] = []
        data["absences"] = [{"facultyId": "f1", "periods": [0]}]
        result = solve_repair(data, 3)
        self.assertIn(result["status"], ["OPTIMAL", "FEASIBLE"])
        self.assertNotEqual(next(a for a in result["assignments"] if a["occurrenceId"] == "o1")["period"], 0)

    def test_chain_move_changes_two_teaching_times(self):
        result = solve_repair(chain_fixture(), 3)
        self.assertEqual(result["quality"]["timeChanges"], 2)
        self.assertEqual(next(a for a in result["assignments"] if a["occurrenceId"] == "o1")["period"], 1)
        self.assertEqual(next(a for a in result["assignments"] if a["occurrenceId"] == "o2")["period"], 3)

    def test_external_commitments_stay_fixed(self):
        data = repair_fixture()
        result = solve_repair(data, 3)
        self.assertEqual(next(a for a in result["assignments"] if a["occurrenceId"] == "o3"), {"occurrenceId": "o3", "period": 0, "roomId": "r2"})

    def test_protected_chain_member_prevents_repair(self):
        data = chain_fixture()
        data["movableIds"] = ["o1"]
        self.assertEqual(solve_repair(data, 3)["status"], "INFEASIBLE")

    def test_protected_target_has_explicit_diagnostic(self):
        data = repair_fixture()
        data["movableIds"] = ["o2"]
        result = solve_repair(data, 3)
        self.assertEqual(result["status"], "INFEASIBLE")
        self.assertIn("o1", result["diagnostics"][0])

    def test_full_day_unavailability_is_not_relaxed(self):
        data = repair_fixture()
        data["absences"] = [{"facultyId": "f1", "periods": []}]
        self.assertEqual(solve_repair(data, 3)["status"], "INFEASIBLE")

    def test_weekly_limits_include_other_days(self):
        data = repair_fixture()
        data["weeklyLoads"] = {"f1": 10}
        self.assertEqual(solve_repair(data, 3)["status"], "INFEASIBLE")

    def test_lab_cannot_cross_breaks(self):
        data = repair_fixture()
        data["occurrences"][0]["duration"] = 2
        data["futurePeriods"] = [1]
        data["occurrences"] = data["occurrences"][:1]
        data["closures"] = []
        data["absences"] = [{"facultyId": "f1", "periods": [0]}]
        self.assertEqual(solve_repair(data, 3)["status"], "INFEASIBLE")

    def test_timeout_is_unknown(self):
        self.assertEqual(solve_repair(repair_fixture(), 0)["status"], "UNKNOWN")


if __name__ == "__main__":
    unittest.main()
