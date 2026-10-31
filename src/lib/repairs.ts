import type {
  Member,
  Occurrence,
  RepairInput,
  RepairPlan,
  RepairRequest,
  State,
} from "./types";
import type { Action } from "./validation";
import { assert, consecutiveLimit } from "./rules";
import { classStart, localDate, monday, occupied, weekday } from "./time";

const liveStatuses = new Set<RepairPlan["status"]>([
  "queued",
  "running",
  "awaiting-consent",
  "ready",
]);
export function roomBlocked(
  s: Pick<State, "roomClosures">,
  o: Pick<Occurrence, "date" | "period" | "duration" | "roomId">,
) {
  return s.roomClosures.some(
    (c) =>
      c.status === "confirmed" &&
      c.date === o.date &&
      c.roomId === o.roomId &&
      occupied(o.period, o.duration).some((p) => c.periods.includes(p)),
  );
}
function department(s: State, o: Occurrence) {
  return s.sections.find((x) => x.id === o.sectionId)?.departmentId || "";
}
function send(
  s: State,
  memberId: string,
  title: string,
  body: string,
  id: string,
  href = "/changes",
) {
  if (!s.notifications.some((n) => n.id === id))
    s.notifications.push({
      id,
      memberId,
      title,
      body,
      href,
      read: false,
      createdAt: new Date().toISOString(),
    });
}
function escalate(s: State, r: RepairRequest, title: string, key: string) {
  for (const m of s.members.filter(
    (m) =>
      m.role === "admin" ||
      (m.role === "coordinator" && r.departmentIds.includes(m.departmentId)),
  ))
    send(
      s,
      m.id,
      title,
      `${r.date} · Review the Daily Change Desk. No changes have been applied.`,
      `${key}-${m.id}`,
    );
}
function access(m: Member, departmentIds: string[]) {
  assert(
    m.role === "admin" ||
      (m.role === "coordinator" &&
        departmentIds.length === 1 &&
        departmentIds[0] === m.departmentId),
    "Cross-department repairs require a campus administrator",
    403,
  );
}
export function affectedOccurrences(
  s: State,
  trigger: RepairRequest["trigger"],
  id: string,
): Occurrence[] {
  if (trigger === "closure") {
    const c = s.roomClosures.find((c) => c.id === id);
    assert(c?.status === "confirmed", "Choose a confirmed room closure", 409);
    return s.occurrences.filter(
      (o) =>
        o.date === c.date &&
        o.roomId === c.roomId &&
        occupied(o.period, o.duration).some((p) => c.periods.includes(p)),
    );
  }
  const a = s.absences.find((a) => a.id === id);
  assert(a?.status === "approved", "Choose an approved absence", 409);
  assert(
    a.periods.length,
    "Full-day absences need qualified substitution, not same-day rescheduling",
    409,
  );
  return s.occurrences.filter(
    (o) =>
      o.date === a.date &&
      o.facultyId === a.facultyId &&
      occupied(o.period, o.duration).some((p) => a.periods.includes(p)),
  );
}
export function buildRepairInput(
  s: State,
  r: RepairRequest,
  now: Date,
): RepairInput {
  const occurrences = s.occurrences
    .filter((o) => o.date === r.date)
    .sort((a, b) => a.id.localeCompare(b.id));
  const targetIds = affectedOccurrences(s, r.trigger, r.triggerId)
    .filter((o) => r.departmentIds.includes(department(s, o)))
    .map((o) => o.id)
    .sort();
  const coverage = s.coverage
    .filter((c) => occurrences.some((o) => o.id === c.occurrenceId))
    .sort((a, b) => a.id.localeCompare(b.id));
  const offers = s.offers
    .filter(
      (o) =>
        coverage.some((c) => c.id === o.coverageId) &&
        ["pending", "accepted"].includes(o.status),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const protectedIds = new Set(
    coverage
      .filter((c) => c.status === "offered" || c.status === "covered")
      .map((c) => c.occurrenceId),
  );
  const movableIds = occurrences
    .filter(
      (o) =>
        r.departmentIds.includes(department(s, o)) &&
        classStart(o.date, o.period, s.settings) > now &&
        !protectedIds.has(o.id),
    )
    .map((o) => o.id);
  const activeOccurrenceIds = occurrences
    .filter(
      (o) =>
        !coverage.some(
          (c) => c.occurrenceId === o.id && c.status !== "covered",
        ) ||
        (r.trigger === "absence" && targetIds.includes(o.id)),
    )
    .map((o) => o.id);
  const facultyIds = new Set(occurrences.map((o) => o.facultyId));
  const faculty = s.faculty
    .filter((f) => facultyIds.has(f.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const weeklyLoads: Record<string, number> = {};
  for (const f of faculty)
    weeklyLoads[f.id] = s.occurrences
      .filter(
        (o) =>
          o.date !== r.date &&
          monday(o.date) === monday(r.date) &&
          o.facultyId === f.id &&
          !s.coverage.some(
            (c) => c.occurrenceId === o.id && c.status !== "covered",
          ),
      )
      .reduce((n, o) => n + o.duration, 0);
  return structuredClone({
    mode: "repair",
    date: r.date,
    settings: s.settings,
    faculty,
    rooms: [...s.rooms].sort((a, b) => a.id.localeCompare(b.id)),
    sections: [...s.sections].sort((a, b) => a.id.localeCompare(b.id)),
    requirements: [...s.requirements].sort((a, b) => a.id.localeCompare(b.id)),
    occurrences,
    absences: s.absences
      .filter((a) => a.date === r.date && a.status === "approved")
      .map((a) => ({ ...a, reason: "" }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    closures: s.roomClosures
      .filter((c) => c.date === r.date && c.status === "confirmed")
      .map((c) => ({ ...c, reason: "" }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    coverage,
    offers,
    departmentIds: [...r.departmentIds].sort(),
    targetIds,
    movableIds,
    activeOccurrenceIds,
    weeklyLoads,
    futurePeriods: s.settings.periods
      .filter((p) => !p.break && classStart(r.date, p.id, s.settings) > now)
      .map((p) => p.id),
  });
}
function stableJSON(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
function fingerprint(i: RepairInput) {
  return stableJSON({
    ...i,
    settings: {
      timezone: i.settings.timezone,
      start: i.settings.start,
      end: i.settings.end,
      days: i.settings.days,
      holidays: i.settings.holidays,
      periods: i.settings.periods.map(({ id, start, end, break: pause }) => ({
        id,
        start,
        end,
        break: pause,
      })),
    },
    faculty: i.faculty.map(({ name, email, title, ...f }) => {
      void name;
      void email;
      void title;
      return f;
    }),
    rooms: i.rooms.map(({ name, ...r }) => {
      void name;
      return r;
    }),
    sections: i.sections.map(({ name, ...s }) => {
      void name;
      return s;
    }),
    closures: i.closures.map(({ id, roomId, date, periods, status }) => ({
      id,
      roomId,
      date,
      periods,
      status,
    })),
  });
}
export function planIsStale(s: State, p: RepairPlan) {
  try {
    const r = s.repairRequests.find((r) => r.id === p.requestId);
    return (
      !r ||
      r.status !== "open" ||
      fingerprint(buildRepairInput(s, r, new Date(p.createdAt))) !==
        fingerprint(p.input)
    );
  } catch {
    return true;
  }
}
export function refreshRepairPlans(s: State, now = new Date()) {
  let changed = false;
  for (const p of s.repairPlans.filter((p) => liveStatuses.has(p.status))) {
    const r = s.repairRequests.find((r) => r.id === p.requestId)!;
    if (p.deadline && Date.parse(p.deadline) <= now.getTime()) {
      p.status = "expired";
      escalate(s, r, "Repair proposal expired", `${p.id}-expired`);
      changed = true;
    } else if (planIsStale(s, p)) {
      p.status = "stale";
      escalate(s, r, "Repair needs a fresh proposal", `${p.id}-stale`);
      changed = true;
    }
  }
  return changed;
}
export function validateRepairAssignments(
  input: RepairInput,
  proposed: Occurrence[],
): string[] {
  const errors: string[] = [];
  const before = new Map(input.occurrences.map((o) => [o.id, o]));
  const used = new Set<string>();
  const seen = new Set<string>();
  const daily = new Map<string, number[]>();
  if (proposed.length !== before.size)
    errors.push("The proposal must retain every dated class exactly once.");
  for (const o of proposed) {
    const old = before.get(o.id);
    if (!old || seen.has(o.id)) {
      errors.push("Unknown or duplicate class in proposal.");
      continue;
    }
    seen.add(o.id);
    if (
      stableJSON({ ...old, period: o.period, roomId: o.roomId }) !==
      stableJSON(o)
    )
      errors.push(
        "A repair cannot change date, teacher, subject, section, duration, or class identity.",
      );
    const changed = old.period !== o.period || old.roomId !== o.roomId;
    if (changed && !input.movableIds.includes(o.id))
      errors.push(
        "Started, protected, and out-of-scope classes must remain fixed.",
      );
    if (changed && !input.futurePeriods.includes(o.period))
      errors.push("A repaired class must start in a future teaching period.");
    const req = input.requirements.find((r) => r.id === o.requirementId),
      section = input.sections.find((s) => s.id === o.sectionId),
      room = input.rooms.find((r) => r.id === o.roomId),
      f = input.faculty.find((f) => f.id === o.facultyId);
    if (!req || !section || !room || !f) {
      errors.push("A required resource no longer exists.");
      continue;
    }
    if (room.type !== req.kind || room.capacity < section.size)
      errors.push("Room type or capacity does not fit the class.");
    const slots = occupied(o.period, o.duration);
    if (
      slots.some(
        (p) => !input.settings.periods.some((q) => q.id === p && !q.break),
      ) ||
      slots
        .slice(1)
        .some(
          (p) =>
            input.settings.periods.find((q) => q.id === p - 1)?.end !==
            input.settings.periods.find((q) => q.id === p)?.start,
        )
    )
      errors.push(
        "Labs must use consecutive teaching periods without a break.",
      );
    if (
      (changed || input.targetIds.includes(o.id)) &&
      roomBlocked({ roomClosures: input.closures }, o)
    )
      errors.push("The proposed room is closed.");
    const active = input.activeOccurrenceIds.includes(o.id);
    if (active) {
      if (!f.subjects.includes(req.subjectId))
        errors.push("Faculty is not qualified for the subject.");
      if (
        slots.some((p) => f.unavailable.includes(`${weekday(o.date)}:${p}`)) ||
        input.absences.some(
          (a) =>
            a.facultyId === f.id &&
            (a.periods.length === 0 ||
              slots.some((p) => a.periods.includes(p))),
        )
      )
        errors.push("Faculty is unavailable at the proposed time.");
      daily.set(f.id, [...(daily.get(f.id) || []), ...slots]);
    } else if (old.period !== o.period)
      errors.push(
        "Uncovered classes outside this absence repair must keep their teaching time.",
      );
    for (const p of slots)
      for (const key of [
        `r:${o.roomId}:${p}`,
        `s:${o.sectionId}:${p}`,
        ...(active ? [`f:${o.facultyId}:${p}`] : []),
      ]) {
        if (used.has(key))
          errors.push("The proposal contains a resource clash.");
        used.add(key);
      }
  }
  for (const f of input.faculty) {
    const ps = daily.get(f.id) || [];
    if (
      ps.length > f.maxDaily ||
      (input.weeklyLoads[f.id] || 0) + ps.length > f.maxWeekly ||
      !consecutiveLimit(ps, f, { settings: input.settings } as State)
    )
      errors.push("Faculty teaching limits would be exceeded.");
  }
  return [...new Set(errors)];
}
function gaps(input: RepairInput, occurrences: Occurrence[]) {
  let total = 0;
  for (const f of input.faculty) {
    const slots = occurrences
      .filter(
        (o) => o.facultyId === f.id && input.activeOccurrenceIds.includes(o.id),
      )
      .flatMap((o) => occupied(o.period, o.duration));
    if (slots.length)
      total += input.settings.periods.filter(
        (p) =>
          !p.break &&
          p.id > Math.min(...slots) &&
          p.id < Math.max(...slots) &&
          !slots.includes(p.id),
      ).length;
  }
  return total;
}
export function finishRepairPlan(
  s: State,
  id: string,
  result: {
    status: RepairPlan["solverStatus"];
    assignments: { occurrenceId: string; period: number; roomId: string }[];
    diagnostics: string[];
  },
  now = new Date(),
) {
  const p = s.repairPlans.find((p) => p.id === id);
  assert(p, "Repair plan not found", 404);
  if (!["queued", "running"].includes(p.status)) return;
  if (planIsStale(s, p)) {
    p.status = "stale";
    escalate(
      s,
      s.repairRequests.find((r) => r.id === p.requestId)!,
      "Repair needs a fresh proposal",
      `${p.id}-stale`,
    );
    return;
  }
  p.solverStatus = result.status;
  p.diagnostics = result.diagnostics;
  if (!["FEASIBLE", "OPTIMAL"].includes(result.status || "")) {
    p.status = "unsolved";
    escalate(
      s,
      s.repairRequests.find((r) => r.id === p.requestId)!,
      "Repair needs a coordinator decision",
      `${p.id}-unsolved`,
    );
    return;
  }
  assert(
    result.assignments.length === p.input.occurrences.length &&
      new Set(result.assignments.map((a) => a.occurrenceId)).size ===
        result.assignments.length,
    "Solver must return each class exactly once",
    502,
  );
  const proposed = p.input.occurrences.map((o) => {
    const assignment = result.assignments.find((a) => a.occurrenceId === o.id);
    assert(assignment, "Solver omitted a dated class", 502);
    return { ...o, period: assignment.period, roomId: assignment.roomId };
  });
  const errors = validateRepairAssignments(p.input, proposed);
  assert(!errors.length, errors.join(" "), 502);
  p.changes = proposed
    .filter((o) => {
      const old = p.input.occurrences.find((x) => x.id === o.id)!;
      return old.period !== o.period || old.roomId !== o.roomId;
    })
    .map((o) => ({
      occurrenceId: o.id,
      before: p.input.occurrences.find((x) => x.id === o.id)!,
      after: o,
      reason: p.input.targetIds.includes(o.id)
        ? "Resolve the reported disruption"
        : "Free a resource needed by another repaired class",
    }));
  p.unresolvedOccurrenceIds = proposed
    .filter(
      (o) =>
        roomBlocked({ roomClosures: p.input.closures }, o) ||
        !p.input.activeOccurrenceIds.includes(o.id),
    )
    .map((o) => o.id);
  assert(p.changes.length, "The disruption does not require a change", 409);
  const timed = p.changes.filter((c) => c.before.period !== c.after.period),
    facultyIds = [...new Set(timed.map((c) => c.after.facultyId))];
  assert(
    facultyIds.every((id) => s.members.some((m) => m.facultyId === id)),
    "Every faculty member whose time changes needs an invited account",
    409,
  );
  p.impact = {
    timeChanges: timed.length,
    classesChanged: p.changes.length,
    facultyAffected: new Set(p.changes.map((c) => c.after.facultyId)).size,
    roomChanges: p.changes.filter((c) => c.before.roomId !== c.after.roomId)
      .length,
    gapDelta: gaps(p.input, proposed) - gaps(p.input, p.input.occurrences),
  };
  p.deadline = new Date(
    Math.min(
      Date.parse(p.createdAt) + 30 * 60000,
      ...p.changes.flatMap((c) => [
        classStart(c.before.date, c.before.period, p.input.settings).getTime(),
        classStart(c.after.date, c.after.period, p.input.settings).getTime(),
      ]),
    ),
  ).toISOString();
  if (Date.parse(p.deadline) <= now.getTime()) {
    p.status = "expired";
    escalate(
      s,
      s.repairRequests.find((r) => r.id === p.requestId)!,
      "Repair proposal expired",
      `${p.id}-expired`,
    );
    return;
  }
  for (const facultyId of facultyIds) {
    const consentId = `${p.id}-${facultyId}`;
    if (!s.repairConsents.some((c) => c.id === consentId))
      s.repairConsents.push({
        id: consentId,
        planId: p.id,
        facultyId,
        status: "pending",
      });
    for (const m of s.members.filter((m) => m.facultyId === facultyId))
      send(
        s,
        m.id,
        "A timetable change needs your acceptance",
        `${p.input.date} · Review all changes to your classes before the deadline.`,
        `${consentId}-${m.id}`,
        "/inbox",
      );
  }
  p.status = facultyIds.length ? "awaiting-consent" : "ready";
  escalate(
    s,
    s.repairRequests.find((r) => r.id === p.requestId)!,
    facultyIds.length
      ? "Repair is awaiting faculty acceptance"
      : "Repair is ready to review and apply",
    `${p.id}-generated`,
  );
}
export type RepairAction = Extract<
  Action,
  {
    type:
      | "closure-create"
      | "closure-decision"
      | "repair-request"
      | "repair-consent"
      | "repair-withdraw"
      | "repair-apply";
  }
>;
export function applyRepairAction(
  s: State,
  m: Member,
  a: RepairAction,
  now: Date,
): Record<string, string | boolean> {
  switch (a.type) {
    case "closure-create": {
      assert(m.role !== "faculty", "Management access required", 403);
      assert(
        s.rooms.some((r) => r.id === a.roomId),
        "Room not found",
        404,
      );
      assert(
        a.date >= localDate(now, s.settings.timezone) &&
          a.date >= s.settings.start &&
          a.date <= s.settings.end,
        "Choose a remaining date in this term",
      );
      assert(
        a.periods.every((id) =>
          s.settings.periods.some((p) => p.id === id && !p.break),
        ),
        "Choose teaching periods",
      );
      const id = crypto.randomUUID();
      s.roomClosures.push({
        id,
        roomId: a.roomId,
        date: a.date,
        periods: [...new Set(a.periods)].sort((a, b) => a - b),
        reason: a.reason,
        status: m.role === "admin" ? "confirmed" : "reported",
        reportedBy: m.id,
        confirmedBy: m.role === "admin" ? m.id : undefined,
        createdAt: now.toISOString(),
      });
      for (const member of s.members.filter(
        (x) =>
          x.role === "admin" ||
          (m.role === "admin" &&
            x.role === "coordinator" &&
            s.occurrences.some(
              (o) =>
                o.date === a.date &&
                o.roomId === a.roomId &&
                department(s, o) === x.departmentId &&
                occupied(o.period, o.duration).some((p) =>
                  a.periods.includes(p),
                ),
            )),
      ))
        send(
          s,
          member.id,
          m.role === "admin"
            ? "Room closure confirmed"
            : "Room closure needs confirmation",
          `${a.date} · Review affected classes in the Daily Change Desk.`,
          `${id}-${member.id}`,
        );
      return { closureId: id };
    }
    case "closure-decision": {
      const c = s.roomClosures.find((c) => c.id === a.id);
      assert(c, "Room closure not found", 404);
      assert(
        m.role === "admin" ||
          (a.decision === "cancel" &&
            c.status === "reported" &&
            c.reportedBy === m.id),
        "Only an admin can confirm or cancel a campus room closure",
        403,
      );
      if (a.decision === "confirm") {
        assert(
          c.status === "reported",
          "Only a reported closure can be confirmed",
          409,
        );
        c.status = "confirmed";
        c.confirmedBy = m.id;
        for (const member of s.members.filter(
          (x) =>
            x.role === "admin" ||
            (x.role === "coordinator" &&
              s.occurrences.some(
                (o) =>
                  o.date === c.date &&
                  o.roomId === c.roomId &&
                  department(s, o) === x.departmentId &&
                  occupied(o.period, o.duration).some((p) =>
                    c.periods.includes(p),
                  ),
              )),
        ))
          send(
            s,
            member.id,
            "Room closure confirmed",
            `${c.date} · Existing classes are flagged until a repair is applied.`,
            `${c.id}-confirmed-${member.id}`,
          );
      } else {
        c.status = "cancelled";
        for (const r of s.repairRequests.filter(
          (r) =>
            r.trigger === "closure" &&
            r.triggerId === c.id &&
            r.status === "open",
        )) {
          r.status = "cancelled";
          for (const p of s.repairPlans.filter(
            (p) => p.requestId === r.id && liveStatuses.has(p.status),
          )) {
            p.status = "withdrawn";
            escalate(
              s,
              r,
              "Room closure cancelled; proposal withdrawn",
              `${p.id}-cancelled`,
            );
          }
        }
      }
      return { ok: true };
    }
    case "repair-request": {
      const duplicate = s.repairPlans.find((p) => p.key === a.key);
      if (duplicate) {
        const r = s.repairRequests.find((r) => r.id === duplicate.requestId)!;
        access(m, r.departmentIds);
        return { planId: duplicate.id };
      }
      const departmentIds = [...new Set(a.departmentIds)].sort();
      access(m, departmentIds);
      assert(
        departmentIds.every((id) => s.departments.some((d) => d.id === id)),
        "Unknown department",
      );
      const targets = affectedOccurrences(s, a.trigger, a.triggerId).filter(
        (o) => departmentIds.includes(department(s, o)),
      );
      assert(
        targets.length,
        "No affected classes in the selected departments",
        409,
      );
      const date = targets[0].date;
      assert(
        date >= localDate(now, s.settings.timezone),
        "Past disruptions cannot be repaired",
        409,
      );
      let r = s.repairRequests.find(
        (r) =>
          r.trigger === a.trigger &&
          r.triggerId === a.triggerId &&
          JSON.stringify(r.departmentIds) === JSON.stringify(departmentIds) &&
          r.status === "open",
      );
      if (r?.activePlanId)
        assert(
          !liveStatuses.has(
            s.repairPlans.find((p) => p.id === r!.activePlanId)!.status,
          ),
          "Withdraw the existing proposal before generating another",
          409,
        );
      if (!r) {
        r = {
          id: crypto.randomUUID(),
          trigger: a.trigger,
          triggerId: a.triggerId,
          date,
          departmentIds,
          occurrenceIds: targets.map((o) => o.id),
          actorId: m.id,
          status: "open",
          createdAt: now.toISOString(),
        };
        s.repairRequests.push(r);
      }
      const id = crypto.randomUUID();
      r.activePlanId = id;
      s.repairPlans.push({
        id,
        key: a.key,
        requestId: r.id,
        createdAt: now.toISOString(),
        input: buildRepairInput(s, r, now),
        status: "queued",
        changes: [],
        unresolvedOccurrenceIds: [],
        impact: {
          timeChanges: 0,
          classesChanged: 0,
          facultyAffected: 0,
          roomChanges: 0,
          gapDelta: 0,
        },
        diagnostics: [],
      });
      return { planId: id };
    }
    case "repair-consent":
    case "repair-apply":
    case "repair-withdraw": {
      const p = s.repairPlans.find((p) => p.id === a.planId);
      assert(p, "Repair plan not found", 404);
      const r = s.repairRequests.find((r) => r.id === p.requestId)!;
      if (a.type === "repair-consent")
        assert(
          m.facultyId &&
            s.repairConsents.some(
              (c) => c.planId === p.id && c.facultyId === m.facultyId,
            ),
          "Only the affected faculty may respond",
          403,
        );
      else access(m, r.departmentIds);
      if (a.type === "repair-apply" && p.status === "applied")
        return { ok: true };
      refreshRepairPlans(s, now);
      if (p.status === "stale" || p.status === "expired")
        return {
          conflict: true,
          error:
            p.status === "stale"
              ? "Relevant bookings changed. Generate a new proposal and collect fresh acceptance."
              : "This proposal expired. Generate a new plan.",
        };
      if (a.type === "repair-withdraw") {
        assert(
          liveStatuses.has(p.status),
          "This proposal is no longer active",
          409,
        );
        p.status = "withdrawn";
        escalate(s, r, "Repair proposal withdrawn", `${p.id}-withdrawn`);
        return { ok: true };
      }
      if (a.type === "repair-consent") {
        const c = s.repairConsents.find(
          (c) => c.planId === p.id && c.facultyId === m.facultyId,
        )!;
        if (c.status === a.decision) return { ok: true };
        assert(
          p.status === "awaiting-consent" && c.status === "pending",
          "This proposal is no longer accepting responses",
          409,
        );
        c.status = a.decision;
        c.decidedAt = now.toISOString();
        if (a.decision === "declined") {
          p.status = "declined";
          escalate(
            s,
            r,
            "Repair declined; a new plan is needed",
            `${p.id}-declined`,
          );
        } else if (
          s.repairConsents
            .filter((c) => c.planId === p.id)
            .every((c) => c.status === "accepted")
        ) {
          p.status = "ready";
          escalate(
            s,
            r,
            "All faculty accepted; repair is ready to apply",
            `${p.id}-ready`,
          );
        }
        return { ok: true };
      }
      assert(
        p.status === "ready" &&
          s.repairConsents
            .filter((c) => c.planId === p.id)
            .every((c) => c.status === "accepted"),
        "Every required faculty acceptance is needed before application",
        409,
      );
      const proposed = p.input.occurrences.map(
        (o) => p.changes.find((c) => c.occurrenceId === o.id)?.after || o,
      );
      const errors = validateRepairAssignments(
        buildRepairInput(s, r, new Date(p.createdAt)),
        proposed,
      );
      assert(!errors.length, errors.join(" "), 409);
      assert(
        p.changes.every(
          (c) =>
            classStart(c.before.date, c.before.period, s.settings) > now &&
            classStart(c.after.date, c.after.period, s.settings) > now,
        ),
        "A class has already started",
        409,
      );
      for (const change of p.changes) {
        const index = s.occurrences.findIndex(
          (o) => o.id === change.occurrenceId,
        );
        assert(index >= 0, "Class no longer exists", 409);
        s.occurrences[index] = structuredClone(change.after);
        if (
          r.trigger === "absence" &&
          p.input.targetIds.includes(change.occurrenceId)
        ) {
          const c = s.coverage.find(
            (c) =>
              c.occurrenceId === change.occurrenceId &&
              c.absenceId === r.triggerId,
          );
          if (c) s.coverage = s.coverage.filter((x) => x.id !== c.id);
        }
        for (const member of s.members.filter(
          (m) => m.facultyId === change.after.facultyId,
        ))
          send(
            s,
            member.id,
            "Your dated timetable has changed",
            `${r.date} · ${s.settings.periods.find((p) => p.id === change.after.period)?.start} · ${s.rooms.find((room) => room.id === change.after.roomId)?.name}. Review your agenda.`,
            `${p.id}-applied-${change.occurrenceId}-${member.id}`,
            "/timetable",
          );
      }
      p.status = "applied";
      p.appliedAt = now.toISOString();
      p.appliedBy = m.id;
      r.status = "resolved";
      return { ok: true };
    }
  }
}
