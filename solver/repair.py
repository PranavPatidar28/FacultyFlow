"""Dated, teacher-preserving repair with fixed external resource reservations."""
import time
from ortools.sat.python import cp_model


def solve_repair(data, time_limit=30):
    began = time.monotonic()
    model = cp_model.CpModel()
    periods = {p["id"]: p for p in data["settings"]["periods"]}
    people = {f["id"]: f for f in data["faculty"]}
    sections = {s["id"]: s for s in data["sections"]}
    reqs = {r["id"]: r for r in data["requirements"]}
    rooms = {r["id"]: r for r in data["rooms"]}
    movable, active, targets = map(set, [data["movableIds"], data["activeOccurrenceIds"], data["targetIds"]])
    faculty_intervals, room_intervals, section_intervals = {}, {}, {}
    variables, at_period, time_changes, class_changes, distances, gaps = {}, {}, [], [], [], []
    diagnostics = []
    from datetime import date
    day = (date.fromisoformat(data["date"]).weekday() + 1) % 7

    def unavailable(o, p):
        f = people[o["facultyId"]]
        slots = range(p, p + o["duration"])
        return any(f'{day}:{q}' in f["unavailable"] for q in slots) or any(a["facultyId"] == f["id"] and (not a["periods"] or any(q in a["periods"] for q in slots)) for a in data["absences"])

    def closed(room, p, duration):
        return any(c["roomId"] == room and any(q in c["periods"] for q in range(p, p + duration)) for c in data["closures"])

    for o in data["occurrences"]:
        oid, duration = o["id"], o["duration"]
        req, section, f = reqs[o["requirementId"]], sections[o["sectionId"]], people[o["facultyId"]]
        can_move = oid in movable
        if oid in targets and not can_move:
            diagnostics.append(f'{oid}: the affected class is started, protected by a substitution, or outside the editable scope. Resolve the protected commitment explicitly.')
        starts = [p for p in periods if all(q in periods and not periods[q]["break"] for q in range(p, p + duration)) and all(periods[q].get("end") == periods[q + 1].get("start") for q in range(p, p + duration - 1))]
        if can_move:
            starts = [p for p in starts if p in data["futurePeriods"]]
        else:
            starts = [p for p in starts if p == o["period"]]
        if oid not in active:
            starts = [p for p in starts if p == o["period"]]
        else:
            starts = [p for p in starts if not unavailable(o, p)]
            if req["subjectId"] not in f["subjects"]:
                diagnostics.append(f'{oid}: assigned teacher is not qualified.')
        suitable = [r for r in rooms.values() if r["type"] == req["kind"] and r["capacity"] >= section["size"] and (can_move or r["id"] == o["roomId"])]
        if not starts or not suitable:
            diagnostics.append(f'{oid}: no valid placement; started, protected, and out-of-scope classes remain fixed.')
            continue
        start = model.new_int_var_from_domain(cp_model.Domain.from_values(starts), f'start_{oid}')
        end = model.new_int_var(0, len(periods) + duration, f'end_{oid}')
        model.add(end == start + duration)
        interval = model.new_interval_var(start, duration, end, f'section_{oid}')
        section_intervals.setdefault(o["sectionId"], []).append(interval)
        if oid in active:
            faculty_intervals.setdefault(o["facultyId"], []).append(interval)
        room_vars = {}
        for room in suitable:
            v = model.new_bool_var(f'room_{oid}_{room["id"]}')
            room_vars[room["id"]] = v
            opt = model.new_optional_interval_var(start, duration, end, v, f'room_interval_{oid}_{room["id"]}')
            room_intervals.setdefault(room["id"], []).append(opt)
            if can_move or oid in targets:
                for p in starts:
                    if closed(room["id"], p, duration):
                        model.add(start != p).only_enforce_if(v)
        model.add_exactly_one(room_vars.values())
        tc = model.new_bool_var(f'time_changed_{oid}')
        model.add(start != o["period"]).only_enforce_if(tc)
        model.add(start == o["period"]).only_enforce_if(tc.Not())
        rc = 1 - room_vars[o["roomId"]] if o["roomId"] in room_vars else 1
        changed = model.new_bool_var(f'changed_{oid}')
        model.add_max_equality(changed, [tc, rc])
        distance = model.new_int_var(0, len(periods), f'distance_{oid}')
        model.add_abs_equality(distance, start - o["period"])
        time_changes.append(tc)
        class_changes.append(changed)
        distances.append(distance)
        variables[oid] = (start, room_vars)
        if oid in active:
            for p in starts:
                v = model.new_bool_var(f'placement_{oid}_{p}')
                model.add(start == p).only_enforce_if(v)
                model.add(start != p).only_enforce_if(v.Not())
                for q in range(p, p + duration):
                    at_period.setdefault((f["id"], q), []).append(v)
    if diagnostics:
        return {"status": "INFEASIBLE", "assignments": [], "diagnostics": diagnostics, "elapsed": round(time.monotonic() - began, 3)}
    for intervals in list(faculty_intervals.values()) + list(section_intervals.values()) + list(room_intervals.values()):
        model.add_no_overlap(intervals)
    for fid, f in people.items():
        busy = {}
        for p in periods:
            b = model.new_bool_var(f'busy_{fid}_{p}')
            model.add(b == sum(at_period.get((fid, p), [])))
            busy[p] = b
        model.add(sum(busy.values()) <= f["maxDaily"])
        model.add(sum(busy.values()) + data["weeklyLoads"].get(fid, 0) <= f["maxWeekly"])
        size = f["maxConsecutive"] + 1
        for i in range(len(periods) - size + 1):
            window = list(periods)[i:i + size]
            if not any(periods[p]["break"] for p in window):
                model.add(sum(busy[p] for p in window) <= f["maxConsecutive"])
        teachable = [p for p in periods if not periods[p]["break"]]
        for i, p in enumerate(teachable[1:-1], 1):
            before, after = model.new_bool_var(f'before_{fid}_{p}'), model.new_bool_var(f'after_{fid}_{p}')
            model.add_max_equality(before, [busy[q] for q in teachable[:i]])
            model.add_max_equality(after, [busy[q] for q in teachable[i + 1:]])
            gap = model.new_bool_var(f'gap_{fid}_{p}')
            model.add(gap >= before + after - busy[p] - 1)
            gaps.append(gap)
    invalid = model.validate()
    if invalid:
        return {"status": "MODEL_INVALID", "assignments": [], "diagnostics": [invalid]}
    best, optimal, status_name, quality = None, True, "UNKNOWN", {}
    objectives = [sum(time_changes), sum(class_changes), sum(distances), sum(gaps)]
    names = ["timeChanges", "classesChanged", "displacement", "facultyGaps"]
    for i, objective in enumerate(objectives):
        remaining = time_limit - (time.monotonic() - began)
        if remaining <= .005:
            optimal = False
            break
        solver = cp_model.CpSolver()
        model.minimize(objective)
        solver.parameters.max_time_in_seconds = min(remaining, max(.005, time_limit * [.55, .25, .10, .10][i]))
        solver.parameters.num_search_workers = 2
        solver.parameters.random_seed = 42
        status = solver.solve(model)
        if status == cp_model.UNKNOWN and best is None:
            remaining = time_limit - (time.monotonic() - began)
            if remaining > .005:
                solver.parameters.max_time_in_seconds = remaining
                status = solver.solve(model)
        status_name = solver.status_name(status)
        if status not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
            optimal = False
            break
        best = [{"occurrenceId": oid, "period": solver.value(start), "roomId": next(room for room, v in room_vars.items() if solver.boolean_value(v))} for oid, (start, room_vars) in variables.items()]
        quality = {name: int(solver.value(obj)) for name, obj in zip(names, objectives)}
        optimal = optimal and status == cp_model.OPTIMAL
        model.add(objective == solver.value(objective))
        model.clear_hints()
        for start, room_vars in variables.values():
            model.add_hint(start, solver.value(start))
            for v in room_vars.values():
                model.add_hint(v, solver.value(v))
    if best is not None:
        status_name = "OPTIMAL" if optimal else "FEASIBLE"
    diagnostics = [] if best else (["No valid same-day repair exists within this scope. Protected commitments cannot move; review scope or resolve pending/confirmed substitutions explicitly."] if status_name == "INFEASIBLE" else ["No complete repair established within the time budget. Feasibility remains unresolved."])
    return {"status": status_name, "assignments": best or [], "quality": quality, "diagnostics": diagnostics, "elapsed": round(time.monotonic() - began, 3)}
