"""Reproducible pilot-size benchmark; never asserts optimality or a speed claim."""
import json
from pathlib import Path
from engine import solve
data = {"settings": {"days": [1, 2, 3, 4, 5], "periods": [{"id": i, "break": i in [2, 5]} for i in range(8)]}, "faculty": [], "sections": [], "rooms": [], "requirements": [], "locks": []}
for i in range(150):
    data["faculty"].append({"id": f'f{i}', "subjects": [f's{i // 3}'], "target": 12, "maxWeekly": 20, "maxDaily": 5, "maxConsecutive": 3, "unavailable": [], "preferred": []})
for i in range(20):
    data["rooms"].append({"id": f'r{i}', "type": "lecture", "capacity": 60})
for i in range(60):
    data["sections"].append({"id": f'sec{i}', "size": 40})
    for n in range(3):
        data["requirements"].append({"id": f'req{i}-{n}', "subjectId": f's{(i * 3 + n) % 50}', "sectionId": f'sec{i}', "kind": "lecture", "sessions": 3, "duration": 1})
if __name__ == "__main__":
    result = solve(data, 120)
    output = Path(__file__).resolve().parents[1] / ".local" / "benchmark.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({"input": data, "result": result}), encoding="utf-8")
    print(json.dumps({"faculty": 150, "sections": 60, "requirements": 180, "weeklySessions": 540, "status": result["status"], "assignments": len(result["entries"]), "quality": result["quality"], "elapsedSeconds": result.get("elapsed"), "diagnostics": result["diagnostics"]}, indent=2))
