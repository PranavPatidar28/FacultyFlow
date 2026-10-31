"""Pilot-size sparse and tightly-packed day benchmarks with reproducible inputs."""
import json
from pathlib import Path
from repair import solve_repair


def benchmark_input(dense=False):
    times = [("09:00", "09:50"), ("09:50", "10:40"), ("10:40", "11:00"), ("11:00", "11:50"), ("11:50", "12:40"), ("12:40", "13:30"), ("13:30", "14:20"), ("14:20", "15:10")]
    settings = {"name": "Benchmark", "term": "Synthetic", "timezone": "Asia/Kolkata", "start": "2030-01-07", "end": "2030-02-01", "days": [1, 2, 3, 4, 5], "holidays": [], "periods": [{"id": i, "label": str(i), "start": start, "end": end, "break": i in [2, 5]} for i, (start, end) in enumerate(times)]}
    faculty = [{"id": f'f{i}', "name": f'Faculty {i}', "email": f'f{i}@example.test', "departmentId": "cse", "title": "Professor", "subjects": ["subject"], "target": 12, "maxWeekly": 20, "maxDaily": 5, "maxConsecutive": 3, "unavailable": [], "preferred": []} for i in range(150)]
    rooms = [{"id": f'r{i}', "name": f'Room {i}', "type": "lecture", "capacity": 60} for i in range(20)]
    sections = [{"id": f's{i}', "name": f'Section {i}', "size": 40, "departmentId": "cse"} for i in range(60)]
    count = 114 if dense else 60
    teaching = [0, 1, 3, 4, 6, 7]
    occurrences = [{"id": f'o{i}', "versionId": "v", "entryId": f'e{i}', "requirementId": f'q{i}', "date": "2030-01-07", "facultyId": f'f{i}', "originalFacultyId": f'f{i}', "sectionId": f's{i % 60}', "roomId": f'r{i % 20}', "period": teaching[i // 20] if dense else teaching[i % 6], "duration": 1} for i in range(count)]
    requirements = [{"id": f'q{i}', "subjectId": "subject", "sectionId": f's{i % 60}', "kind": "lecture", "duration": 1, "sessions": 1} for i in range(count)]
    closure = {"id": "closure", "roomId": "r0", "date": "2030-01-07", "periods": [0], "status": "confirmed", "reason": "", "reportedBy": "admin", "createdAt": "2030-01-06T00:00:00Z"}
    return {"mode": "repair", "date": "2030-01-07", "settings": settings, "faculty": faculty, "rooms": rooms, "sections": sections, "requirements": requirements, "occurrences": occurrences, "closures": [closure], "absences": [], "coverage": [], "offers": [], "departmentIds": ["cse"], "targetIds": [o["id"] for o in occurrences if o["roomId"] == "r0" and o["period"] == 0], "movableIds": [o["id"] for o in occurrences], "activeOccurrenceIds": [o["id"] for o in occurrences], "weeklyLoads": {}, "futurePeriods": teaching}


if __name__ == "__main__":
    reports = []
    for dense in [False, True]:
        data = benchmark_input(dense)
        result = solve_repair(data, 30)
        reports.append({"scenario": "tightly-packed" if dense else "sparse", "input": data, "result": result})
        print(json.dumps({"scenario": reports[-1]["scenario"], "faculty": 150, "sections": 60, "rooms": 20, "classes": len(data["occurrences"]), "status": result["status"], "assignments": len(result["assignments"]), "elapsedSeconds": result.get("elapsed"), "quality": result.get("quality"), "diagnostics": result["diagnostics"]}), flush=True)
    output = Path(__file__).resolve().parents[1] / ".local" / "repair-benchmark.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(reports), encoding="utf-8")
