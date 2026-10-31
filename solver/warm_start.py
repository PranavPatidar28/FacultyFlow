"""Find a valid incumbent quickly; CP-SAT then improves the same objective order."""
import random
import time


def incumbent(data, max_seconds=5):
    began = time.monotonic()
    rng = random.Random(42)
    settings, people = data["settings"], data["faculty"]
    periods = {p["id"]: p for p in settings["periods"]}
    sections = {s["id"]: s for s in data["sections"]}
    reqs = data["requirements"]
    for attempt in range(30):
        if time.monotonic() - began > max_seconds:
            break
        faculty_slots, room_slots, section_slots = set(), set(), set()
        loads, daily, result = {}, {}, []

        def fits(f, r, day, p, room):
            slots = list(range(p, p + r["duration"]))
            if any(q not in periods or periods[q]["break"] or f'{day}:{q}' in f["unavailable"] for q in slots):
                return False
            if loads.get(f["id"], 0) + len(slots) > f["maxWeekly"]:
                return False
            taught = daily.get((f["id"], day), set())
            if len(taught) + len(slots) > f["maxDaily"]:
                return False
            if any((f["id"], day, q) in faculty_slots or (room["id"], day, q) in room_slots or (r["sectionId"], day, q) in section_slots for q in slots):
                return False
            streak = 0
            for q, period in periods.items():
                streak = streak + 1 if not period["break"] and (q in taught or q in slots) else 0
                if streak > f["maxConsecutive"]:
                    return False
            return True

        def reserve(f, r, day, p, room, locked=False):
            number = sum(e["requirementId"] == r["id"] for e in result)
            result.append({"id": f'{r["id"]}-{number}', "requirementId": r["id"], "facultyId": f["id"], "roomId": room["id"], "day": day, "period": p, "duration": r["duration"], "locked": locked})
            for q in range(p, p + r["duration"]):
                faculty_slots.add((f["id"], day, q))
                room_slots.add((room["id"], day, q))
                section_slots.add((r["sectionId"], day, q))
                daily.setdefault((f["id"], day), set()).add(q)
            loads[f["id"]] = loads.get(f["id"], 0) + r["duration"]

        failed = False
        for lock in data.get("locks", []):
            r = next((r for r in reqs if r["id"] == lock["requirementId"]), None)
            f = next((f for f in people if f["id"] == lock["facultyId"]), None)
            room = next((x for x in data["rooms"] if x["id"] == lock["roomId"]), None)
            if not r or not f or not room or not fits(f, r, lock["day"], lock["period"], room):
                failed = True
                break
            reserve(f, r, lock["day"], lock["period"], room, True)
        if failed:
            continue
        ordered = list(reqs)
        if attempt:
            rng.shuffle(ordered)
        ordered.sort(key=lambda r: (sum(r["subjectId"] in f["subjects"] for f in people), -r["duration"]))
        for r in ordered:
            existing = [e for e in result if e["requirementId"] == r["id"]]
            eligible = [f for f in people if r["subjectId"] in f["subjects"] and (not r.get("facultyId") or f["id"] == r["facultyId"]) and (not existing or f["id"] == existing[0]["facultyId"])]
            eligible.sort(key=lambda f: (loads.get(f["id"], 0) / max(1, f["target"]), rng.random()))
            suitable = [room for room in data["rooms"] if room["type"] == r["kind"] and room["capacity"] >= sections[r["sectionId"]]["size"]]
            assigned = False
            for f in eligible:
                chosen = []
                # Plan sessions against temporary reservations, rolling back on failure.
                saved_f, saved_r, saved_s = faculty_slots.copy(), room_slots.copy(), section_slots.copy()
                saved_load, saved_daily = loads.copy(), {k: v.copy() for k, v in daily.items()}
                count = len(result)
                for _ in range(r["sessions"] - len(existing)):
                    choices = []
                    for day in settings["days"]:
                        repeats = sum(e["day"] == day for e in result if e["requirementId"] == r["id"])
                        for p in periods:
                            for room in suitable:
                                if fits(f, r, day, p, room):
                                    choices.append(((repeats, len(daily.get((f["id"], day), set())), rng.random()), day, p, room))
                    if not choices:
                        break
                    _, day, p, room = min(choices, key=lambda c: c[0])
                    reserve(f, r, day, p, room)
                    chosen.append(1)
                if len(chosen) == r["sessions"] - len(existing):
                    assigned = True
                    break
                faculty_slots, room_slots, section_slots = saved_f, saved_r, saved_s
                loads, daily = saved_load, saved_daily
                del result[count:]
            if not assigned:
                failed = True
                break
        if not failed:
            # Match solver's symmetry order for interchangeable unlocked sessions.
            for r in reqs:
                entries = [e for e in result if e["requirementId"] == r["id"]]
                entries.sort(key=lambda e: (not e["locked"], e["day"], e["period"]))
                for n, e in enumerate(entries):
                    e["id"] = f'{r["id"]}-{n}'
            return result
    return None


def quality(entries, data):
    people, settings = data["faculty"], data["settings"]
    deviations, gaps, preferences, spread = 0, 0, 0, 0
    for f in people:
        own = [e for e in entries if e["facultyId"] == f["id"]]
        load = sum(e["duration"] for e in own)
        deviations += (load - f["target"]) ** 2 * max(1, round(120 / max(f["target"], 1))) ** 2
        for day in settings["days"]:
            slots = {q for e in own if e["day"] == day for q in range(e["period"], e["period"] + e["duration"])}
            if slots:
                gaps += sum(not p["break"] and min(slots) < p["id"] < max(slots) and p["id"] not in slots for p in settings["periods"])
            if f.get("preferred"):
                preferences += sum(f'{day}:{p}' not in f["preferred"] for p in slots)
    for r in data["requirements"]:
        for day in settings["days"]:
            spread += max(0, sum(e["requirementId"] == r["id"] and e["day"] == day for e in entries) - 1)
    return {"loadDeviation": deviations, "facultyGaps": gaps, "preferencePenalty": preferences, "subjectSpreadPenalty": spread}
