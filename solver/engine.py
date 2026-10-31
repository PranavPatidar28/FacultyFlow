"""Compact interval-based CP-SAT model for college teaching allocation."""
from ortools.sat.python import cp_model
import time
from warm_start import incumbent, quality as incumbent_quality


def solve(data, time_limit=120):
    started = time.monotonic()
    settings = data["settings"]
    faculty = {f["id"]: f for f in data["faculty"]}
    rooms = {r["id"]: r for r in data["rooms"]}
    sections = {s["id"]: s for s in data["sections"]}
    requirements = data["requirements"]
    periods = {p["id"]: p for p in settings["periods"]}
    days, width = settings["days"], len(periods)
    diagnostics, model = [], cp_model.CpModel()
    owners, sessions, components = {}, {}, {}
    room_intervals, section_intervals, faculty_intervals = {}, {}, {}
    faculty_slots, preference_terms, spread_terms = {}, [], []
    locks = data.get("locks", [])
    for r in requirements:
        rid, duration = r["id"], r["duration"]
        section = sections.get(r["sectionId"])
        eligible = [f for f in faculty.values() if r["subjectId"] in f["subjects"] and (not r.get("facultyId") or f["id"] == r["facultyId"])]
        suitable = [room for room in rooms.values() if section and room["type"] == r["kind"] and room["capacity"] >= section["size"]]
        starts = [(day, p) for day in days for p in periods if all(q in periods and not periods[q]["break"] for q in range(p, p + duration))]
        if not eligible:
            diagnostics.append(f'{rid}: no approved qualified faculty.')
        if not suitable:
            diagnostics.append(f'{rid}: no room with the required type and capacity.')
        if not starts:
            diagnostics.append(f'{rid}: no consecutive teaching periods fit this component.')
        if not section:
            diagnostics.append(f'{rid}: missing section.')
        locked = [e for e in locks if e["requirementId"] == rid]
        if len(locked) > r["sessions"]:
            diagnostics.append(f'{rid}: too many locked sessions.')
        if diagnostics:
            continue
        owner = {f["id"]: model.new_bool_var(f'owner_{rid}_{f["id"]}') for f in eligible}
        owners[rid] = owner
        model.add_exactly_one(owner.values())
        choices = {}
        previous_start = None
        for n in range(r["sessions"]):
            start = model.new_int_var_from_domain(cp_model.Domain.from_values([day * width + p for day, p in starts]), f'start_{rid}_{n}')
            end = model.new_int_var(0, 7 * width + duration, f'end_{rid}_{n}')
            model.add(end == start + duration)
            interval = model.new_interval_var(start, duration, end, f'section_{rid}_{n}')
            section_intervals.setdefault(r["sectionId"], []).append(interval)
            room_vars = {}
            for room in suitable:
                v = model.new_bool_var(f'room_{rid}_{n}_{room["id"]}')
                room_vars[room["id"]] = v
                opt = model.new_optional_interval_var(start, duration, end, v, f'room_interval_{rid}_{n}_{room["id"]}')
                room_intervals.setdefault(room["id"], []).append(opt)
            model.add_exactly_one(room_vars.values())
            for fid, presence in owner.items():
                opt = model.new_optional_interval_var(start, duration, end, presence, f'faculty_interval_{rid}_{n}_{fid}')
                faculty_intervals.setdefault(fid, []).append(opt)
            if n < len(locked):
                lock = locked[n]
                if lock["facultyId"] not in owner or lock["roomId"] not in room_vars or (lock["day"], lock["period"]) not in starts:
                    diagnostics.append(f'{rid}: locked assignment is not eligible.')
                else:
                    model.add(start == lock["day"] * width + lock["period"])
                    model.add(owner[lock["facultyId"]] == 1)
                    model.add(room_vars[lock["roomId"]] == 1)
            else:
                if previous_start is not None:
                    model.add(start > previous_start)
                previous_start = start
            for day, p in starts:
                v = model.new_bool_var(f'placement_{rid}_{n}_{day}_{p}')
                model.add(start == day * width + p).only_enforce_if(v)
                model.add(start != day * width + p).only_enforce_if(v.Not())
                choices[(n, day, p)] = v
            sessions[(rid, n)] = (start, room_vars, n < len(locked))
        for day in days:
            day_starts = [var for (_, d, _), var in choices.items() if d == day]
            excess = model.new_int_var(0, r["sessions"], f'spread_{rid}_{day}')
            model.add(excess >= sum(day_starts) - 1)
            spread_terms.append(excess)
            for p in periods:
                terms = [v for (_, d, q), v in choices.items() if d == day and q <= p < q + duration]
                if not terms:
                    continue
                active = model.new_bool_var(f'component_{rid}_{day}_{p}')
                model.add(active == sum(terms))
                components[(rid, day, p)] = active
                for f in eligible:
                    fid = f["id"]
                    v = model.new_bool_var(f'teach_{rid}_{fid}_{day}_{p}')
                    model.add(v <= owner[fid])
                    model.add(v <= active)
                    model.add(v >= owner[fid] + active - 1)
                    if f'{day}:{p}' in f["unavailable"]:
                        model.add(v == 0)
                    if f.get("preferred") and f'{day}:{p}' not in f["preferred"]:
                        preference_terms.append(v)
                    faculty_slots.setdefault((fid, day, p), []).append(v)
    if not requirements:
        diagnostics.append("Add at least one teaching requirement.")
    if diagnostics:
        return {"status": "INFEASIBLE", "entries": [], "quality": {}, "diagnostics": sorted(set(diagnostics)), "elapsed": round(time.monotonic() - started, 3)}
    for intervals in list(room_intervals.values()) + list(section_intervals.values()) + list(faculty_intervals.values()):
        model.add_no_overlap(intervals)
    busy, deviations, gaps = {}, [], []
    for fid, f in faculty.items():
        week = []
        for day in days:
            daily = []
            for p in periods:
                b = model.new_bool_var(f'busy_{fid}_{day}_{p}')
                model.add(b == sum(faculty_slots.get((fid, day, p), [])))
                busy[(fid, day, p)] = b
                daily.append(b)
            model.add(sum(daily) <= f["maxDaily"])
            week.extend(daily)
            window_size = f["maxConsecutive"] + 1
            for i in range(len(periods) - window_size + 1):
                window = list(periods)[i:i + window_size]
                if not any(periods[p]["break"] for p in window):
                    model.add(sum(busy[(fid, day, p)] for p in window) <= f["maxConsecutive"])
            teachable = [p for p in periods if not periods[p]["break"]]
            for i, p in enumerate(teachable[1:-1], 1):
                before = model.new_bool_var(f'before_{fid}_{day}_{p}')
                after = model.new_bool_var(f'after_{fid}_{day}_{p}')
                model.add_max_equality(before, [busy[(fid, day, q)] for q in teachable[:i]])
                model.add_max_equality(after, [busy[(fid, day, q)] for q in teachable[i + 1:]])
                gap = model.new_bool_var(f'gap_{fid}_{day}_{p}')
                model.add(gap >= before + after - busy[(fid, day, p)] - 1)
                gaps.append(gap)
        model.add(sum(week) <= f["maxWeekly"])
        dev = model.new_int_var(0, max(f["maxWeekly"], f["target"]), f'deviation_{fid}')
        model.add_abs_equality(dev, sum(week) - f["target"])
        squared = model.new_int_var(0, max(f["maxWeekly"], f["target"]) ** 2, f'squared_deviation_{fid}')
        model.add_multiplication_equality(squared, [dev, dev])
        deviations.append(squared * max(1, round(120 / max(f["target"], 1))) ** 2)
    invalid = model.validate()
    if invalid:
        return {"status": "MODEL_INVALID", "entries": [], "quality": {}, "diagnostics": [invalid]}
    initial = incumbent(data, min(5, max(0, time_limit / 10)))
    if initial:
        for (rid, n), (start, room_vars, _) in sessions.items():
            entry = next(e for e in initial if e["id"] == f'{rid}-{n}')
            model.add_hint(start, entry["day"] * width + entry["period"])
            for room, var in room_vars.items():
                model.add_hint(var, int(room == entry["roomId"]))
        for rid, owner in owners.items():
            fid = next(e["facultyId"] for e in initial if e["requirementId"] == rid)
            for person, var in owner.items():
                model.add_hint(var, int(person == fid))
    objectives = [sum(deviations), sum(gaps), sum(preference_terms), sum(spread_terms)]
    names = ["loadDeviation", "facultyGaps", "preferencePenalty", "subjectSpreadPenalty"]
    budgets = [.65, .20, .10, .05]
    best, quality, all_optimal, final_status = initial, incumbent_quality(initial, data) if initial else {}, True, "UNKNOWN"
    for index, objective in enumerate(objectives):
        remaining = time_limit - (time.monotonic() - started)
        if remaining <= .01:
            all_optimal = False
            break
        model.minimize(objective)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = min(remaining, max(.01, time_limit * budgets[index]))
        solver.parameters.num_search_workers = 2
        solver.parameters.random_seed = 42
        status = solver.solve(model)
        if status == cp_model.UNKNOWN and best is None:
            remaining = time_limit - (time.monotonic() - started)
            if remaining > .01:
                solver.parameters.max_time_in_seconds = remaining
                status = solver.solve(model)
        final_status = solver.status_name(status)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            all_optimal = False
            break
        best = []
        for (rid, n), (start, room_vars, locked) in sessions.items():
            fid = next(fid for fid, owner in owners[rid].items() if solver.boolean_value(owner))
            room = next(room for room, var in room_vars.items() if solver.boolean_value(var))
            value = solver.value(start)
            req = next(r for r in requirements if r["id"] == rid)
            best.append({"id": f'{rid}-{n}', "requirementId": rid, "facultyId": fid, "roomId": room, "day": value // width, "period": value % width, "duration": req["duration"], "locked": locked})
        quality = incumbent_quality(best, data)
        model.add(objective == solver.value(objective))
        if status != cp_model.OPTIMAL:
            all_optimal = False
        model.clear_hints()
        for start, room_vars, _ in sessions.values():
            model.add_hint(start, solver.value(start))
            for var in room_vars.values():
                model.add_hint(var, solver.value(var))
        for owner in owners.values():
            for var in owner.values():
                model.add_hint(var, solver.value(var))
    if best is not None:
        final_status = "OPTIMAL" if all_optimal else "FEASIBLE"
    message = (["A constraint-checked warm start is available; optimization did not prove optimality."] if best and not all_optimal else []) if best else (["The mandatory constraints conflict. Review teaching limits, locks, availability, and shared resource capacity."] if final_status == "INFEASIBLE" else ["No complete solution found within the time limit. Feasibility is unresolved."])
    return {"status": final_status, "entries": best or [], "quality": quality, "diagnostics": message, "elapsed": round(time.monotonic() - started, 3)}
