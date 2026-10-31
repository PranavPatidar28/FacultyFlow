import { describe, expect, it } from "vitest";
import { applyAction, appData } from "../src/lib/domain";
import {
  buildRepairInput,
  finishRepairPlan,
  refreshRepairPlans,
  validateRepairAssignments,
} from "../src/lib/repairs";
import { emptyState } from "../src/lib/seed";
import type { Occurrence, State } from "../src/lib/types";

export function repairFixture() {
  const s = emptyState();
  s.settings.start = "2030-01-07";
  s.settings.end = "2030-02-01";
  const now = new Date("2030-01-06T00:00:00Z");
  s.departments = [
    { id: "cse", name: "Computing", code: "CS", color: "violet" },
    { id: "ece", name: "Electronics", code: "EC", color: "blue" },
  ];
  s.subjects = [
    {
      id: "subject",
      name: "Computing",
      code: "CS1",
      departmentId: "cse",
      color: "violet",
    },
  ];
  s.faculty = [1, 2, 3].map((i) => ({
    id: `f${i}`,
    name: `Faculty ${i}`,
    email: `f${i}@college.example`,
    departmentId: i === 3 ? "ece" : "cse",
    title: "Professor",
    subjects: ["subject"],
    target: 3,
    maxWeekly: 10,
    maxDaily: 5,
    maxConsecutive: 3,
    unavailable: [],
    preferred: [],
  }));
  s.members = [
    {
      id: "admin",
      name: "Admin",
      email: "admin@college.example",
      role: "admin",
      departmentId: "cse",
    },
    {
      id: "co",
      name: "Coordinator",
      email: "co@college.example",
      role: "coordinator",
      departmentId: "cse",
    },
    ...s.faculty.map((f) => ({
      id: `m-${f.id}`,
      name: f.name,
      email: f.email,
      departmentId: f.departmentId,
      facultyId: f.id,
      role: "faculty" as const,
    })),
  ];
  s.rooms = [1, 2, 3].map((i) => ({
    id: `r${i}`,
    name: `Room ${i}`,
    type: "lecture" as const,
    capacity: 40,
  }));
  s.sections = [1, 2, 3].map((i) => ({
    id: `s${i}`,
    name: `Section ${i}`,
    departmentId: i === 3 ? "ece" : "cse",
    size: 30,
  }));
  s.requirements = [1, 2, 3].map((i) => ({
    id: `q${i}`,
    sectionId: `s${i}`,
    subjectId: "subject",
    kind: "lecture" as const,
    sessions: 1,
    duration: 1,
  }));
  s.occurrences = [1, 2, 3].map((i) => ({
    id: `o${i}`,
    versionId: "v",
    entryId: `e${i}`,
    requirementId: `q${i}`,
    date: "2030-01-07",
    period: i === 2 ? 1 : 0,
    duration: 1,
    facultyId: `f${i}`,
    originalFacultyId: `f${i}`,
    roomId: i === 3 ? "r2" : "r1",
    sectionId: `s${i}`,
  }));
  s.versions = [
    {
      id: "v",
      name: "Published",
      status: "published",
      createdAt: now.toISOString(),
      diagnostics: [],
      sourceRevision: 0,
      entries: s.occurrences.map((o) => ({
        id: o.entryId,
        requirementId: o.requirementId,
        facultyId: o.facultyId,
        roomId: o.roomId,
        day: 1,
        period: o.period,
        duration: o.duration,
        locked: false,
      })),
    },
  ];
  return {
    s,
    now,
    admin: s.members[0],
    co: s.members[1],
    f1: s.members[2],
    f2: s.members[3],
  };
}
function closurePlan(f = repairFixture()) {
  const { s, now, admin, co } = f;
  const { closureId } = applyAction(
    s,
    admin,
    {
      type: "closure-create",
      roomId: "r1",
      date: "2030-01-07",
      periods: [0],
      reason: "Equipment maintenance",
    },
    now,
  ) as { closureId: string };
  const { planId } = applyAction(
    s,
    co,
    {
      type: "repair-request",
      key: crypto.randomUUID(),
      trigger: "closure",
      triggerId: closureId,
      departmentIds: ["cse"],
    },
    now,
  ) as { planId: string };
  return {
    ...f,
    closureId,
    planId,
    plan: s.repairPlans.find((p) => p.id === planId)!,
  };
}
function complete(
  s: State,
  planId: string,
  updates: Record<string, Partial<Occurrence>>,
  now: Date,
) {
  finishRepairPlan(
    s,
    planId,
    {
      status: "OPTIMAL",
      assignments: s.occurrences
        .filter((o) => o.date === "2030-01-07")
        .map((o) => ({ ...o, ...updates[o.id] }))
        .map((o) => ({
          occurrenceId: o.id,
          period: o.period,
          roomId: o.roomId,
        })),
      diagnostics: [],
    },
    now,
  );
}
function absencePlan() {
  const f = repairFixture();
  const { s, admin, co, now } = f;
  const { id } = applyAction(
    s,
    admin,
    {
      type: "absence",
      facultyId: "f1",
      date: "2030-01-07",
      periods: [0],
      reason: "PRIVATE ABSENCE",
      urgent: true,
    },
    now,
  ) as { id: string };
  const { planId } = applyAction(
    s,
    co,
    {
      type: "repair-request",
      key: crypto.randomUUID(),
      trigger: "absence",
      triggerId: id,
      departmentIds: ["cse"],
    },
    now,
  ) as { planId: string };
  return {
    ...f,
    absenceId: id,
    planId,
    plan: s.repairPlans.find((p) => p.id === planId)!,
  };
}
describe("Daily Change Desk permissions and lifecycle", () => {
  it("compares persisted JSON snapshots by content, independent of database key order", () => {
    const { s, co, now, planId, plan } = closurePlan();
    plan.input = JSON.parse(
      JSON.stringify(plan.input, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => b.localeCompare(a)),
            )
          : value,
      ),
    );
    expect(refreshRepairPlans(s, now)).toBe(false);
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    applyAction(s, co, { type: "repair-apply", planId }, now);
    expect(plan.status).toBe("applied");
  });
  it("requires admin confirmation for a coordinator's room report", () => {
    const { s, co, f1, now } = repairFixture();
    const result = applyAction(
      s,
      co,
      {
        type: "closure-create",
        roomId: "r1",
        date: "2030-01-07",
        periods: [0],
        reason: "Equipment issue",
      },
      now,
    ) as { closureId: string };
    expect(s.roomClosures[0].status).toBe("reported");
    expect(() =>
      applyAction(
        s,
        co,
        { type: "closure-decision", id: result.closureId, decision: "confirm" },
        now,
      ),
    ).toThrow("Only an admin");
    expect(() =>
      applyAction(
        s,
        f1,
        {
          type: "closure-create",
          roomId: "r1",
          date: "2030-01-07",
          periods: [0],
          reason: "Issue",
        },
        now,
      ),
    ).toThrow("Management");
  });
  it("applies room-only repair without faculty consent and preserves recurring timetable", () => {
    const { s, co, now, planId, closureId } = closurePlan();
    const version = structuredClone(s.versions[0]);
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    expect(s.repairPlans[0].status).toBe("ready");
    expect(s.repairConsents).toHaveLength(0);
    applyAction(s, co, { type: "repair-apply", planId }, now);
    expect(s.occurrences[0].roomId).toBe("r3");
    expect(s.occurrences[0].id).toBe("o1");
    expect(s.versions[0]).toEqual(version);
    expect(s.repairRequests[0].status).toBe("resolved");
    applyAction(
      s,
      s.members[0],
      { type: "closure-decision", id: closureId, decision: "cancel" },
      now,
    );
    expect(s.occurrences[0].roomId).toBe("r3");
  });
  it("keeps bookings unchanged until all affected faculty accept and a coordinator applies", () => {
    const { s, co, f1, f2, now, planId } = absencePlan();
    complete(s, planId, { o1: { period: 1 }, o2: { period: 3 } }, now);
    expect(s.repairConsents).toHaveLength(2);
    expect(() =>
      applyAction(s, co, { type: "repair-apply", planId }, now),
    ).toThrow("Every required");
    applyAction(
      s,
      f1,
      { type: "repair-consent", planId, decision: "accepted" },
      now,
    );
    expect(s.repairPlans[0].status).toBe("awaiting-consent");
    applyAction(
      s,
      f2,
      { type: "repair-consent", planId, decision: "accepted" },
      now,
    );
    expect(s.repairPlans[0].status).toBe("ready");
    expect(s.occurrences[0].period).toBe(0);
    applyAction(s, co, { type: "repair-apply", planId }, now);
    expect(s.occurrences[0].period).toBe(1);
    expect(s.occurrences[1].period).toBe(3);
    expect(s.coverage).toHaveLength(0);
    expect(s.occurrences[0].facultyId).toBe("f1");
  });
  it("returns declined repairs to management without changing bookings", () => {
    const { s, f1, now, planId } = absencePlan();
    complete(s, planId, { o1: { period: 3 } }, now);
    applyAction(
      s,
      f1,
      { type: "repair-consent", planId, decision: "declined" },
      now,
    );
    expect(s.repairPlans[0].status).toBe("declined");
    expect(s.occurrences[0].period).toBe(0);
    expect(
      s.notifications.some(
        (n) => n.memberId === "co" && n.title.includes("declined"),
      ),
    ).toBe(true);
  });
  it("expires once and cannot apply after the deadline", () => {
    const { s, co, now, planId } = closurePlan();
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    const later = new Date(now.getTime() + 31 * 60000);
    expect(
      applyAction(s, co, { type: "repair-apply", planId }, later),
    ).toMatchObject({ conflict: true });
    expect(s.repairPlans[0].status).toBe("expired");
    const count = s.notifications.length;
    refreshRepairPlans(s, later);
    expect(s.notifications).toHaveLength(count);
    expect(s.occurrences[0].roomId).toBe("r1");
  });
  it("marks changed source bookings stale and requires fresh acceptance", () => {
    const { s, co, now, planId } = closurePlan();
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    s.occurrences[2].period = 4;
    expect(
      applyAction(s, co, { type: "repair-apply", planId }, now),
    ).toMatchObject({ conflict: true });
    expect(s.repairPlans[0].status).toBe("stale");
    expect(s.occurrences[0].roomId).toBe("r1");
  });
  it("does not invalidate proposals when notifications or revision counters change", () => {
    const { s, co, now, planId } = closurePlan();
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    applyAction(s, co, { type: "read-notifications" }, now);
    expect(refreshRepairPlans(s, now)).toBe(false);
    applyAction(s, co, { type: "repair-apply", planId }, now);
    expect(s.repairPlans[0].status).toBe("applied");
  });
  it("enforces department scope and faculty decision ownership", () => {
    const { s, co, f2, now, closureId } = closurePlan();
    expect(() =>
      applyAction(
        s,
        co,
        {
          type: "repair-request",
          key: crypto.randomUUID(),
          trigger: "closure",
          triggerId: closureId,
          departmentIds: ["cse", "ece"],
        },
        now,
      ),
    ).toThrow("Cross-department");
    const a = absencePlan();
    complete(a.s, a.planId, { o1: { period: 3 } }, a.now);
    expect(() =>
      applyAction(
        a.s,
        f2,
        { type: "repair-consent", planId: a.planId, decision: "accepted" },
        a.now,
      ),
    ).toThrow("Only the affected");
  });
  it("keeps full-day absences in qualified substitution workflow", () => {
    const { s, admin, co, now } = repairFixture();
    const { id } = applyAction(
      s,
      admin,
      {
        type: "absence",
        facultyId: "f1",
        date: "2030-01-07",
        periods: [],
        reason: "Away",
        urgent: true,
      },
      now,
    ) as { id: string };
    expect(() =>
      applyAction(
        s,
        co,
        {
          type: "repair-request",
          key: crypto.randomUUID(),
          trigger: "absence",
          triggerId: id,
          departmentIds: ["cse"],
        },
        now,
      ),
    ).toThrow("Full-day");
  });
  it("makes request and application retries idempotent", () => {
    const { s, co, now, planId, plan } = closurePlan();
    applyAction(
      s,
      co,
      {
        type: "repair-request",
        key: plan.key,
        trigger: "closure",
        triggerId: s.roomClosures[0].id,
        departmentIds: ["cse"],
      },
      now,
    );
    expect(s.repairPlans).toHaveLength(1);
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    applyAction(s, co, { type: "repair-apply", planId }, now);
    const notifications = s.notifications.length;
    applyAction(s, co, { type: "repair-apply", planId }, now);
    expect(s.notifications).toHaveLength(notifications);
  });
  it("does not expose solver snapshots or private absence details to faculty", () => {
    const { s, f1, now, planId } = absencePlan();
    complete(s, planId, { o1: { period: 3 } }, now);
    const dto = appData(s, { member: f1, demo: false });
    expect(dto.repairPlans[0]).not.toHaveProperty("input");
    expect(JSON.stringify(s.repairPlans[0].input)).not.toContain(
      "PRIVATE ABSENCE",
    );
    expect(dto.repairConsents.every((c) => c.facultyId === f1.facultyId)).toBe(
      true,
    );
  });
  it("blocks future publication from overwriting an applied repair", () => {
    const { s, co, admin, now, planId } = closurePlan();
    complete(s, planId, { o1: { roomId: "r3" } }, now);
    applyAction(s, co, { type: "repair-apply", planId }, now);
    s.versions.push({
      ...structuredClone(s.versions[0]),
      id: "draft",
      status: "draft",
    });
    expect(() =>
      applyAction(
        s,
        admin,
        { type: "publish", versionId: "draft", effectiveDate: "2030-01-07" },
        now,
      ),
    ).toThrow("overwrite applied");
  });
  it("blocks publication into confirmed room closures", () => {
    const { s, admin, now } = closurePlan();
    s.versions.push({
      ...structuredClone(s.versions[0]),
      id: "draft",
      status: "draft",
    });
    expect(() =>
      applyAction(
        s,
        admin,
        { type: "publish", versionId: "draft", effectiveDate: "2030-01-07" },
        now,
      ),
    ).toThrow("Room closure conflicts");
  });
});
describe("Dated repair constraint validation", () => {
  function check(update: Partial<Occurrence>) {
    const { s, plan } = closurePlan();
    return validateRepairAssignments(
      plan.input,
      s.occurrences.map((o) => (o.id === "o1" ? { ...o, ...update } : o)),
    );
  }
  it("rejects changes to date, teacher, or duration", () => {
    for (const u of [
      { date: "2030-01-08" },
      { facultyId: "f2" },
      { duration: 2 },
    ])
      expect(check(u).join(" ")).toContain("identity");
  });
  it("rejects room and section clashes", () => {
    expect(check({ roomId: "r2" }).join(" ")).toContain("clash");
  });
  it("rejects breaks, unavailable time and capacity violations", () => {
    expect(check({ period: 2 }).join(" ")).toContain("consecutive");
    const { s, plan } = absencePlan();
    const assignments = s.occurrences.map((o) =>
      o.id === "o1" ? { ...o, roomId: "r3" } : o,
    );
    expect(
      validateRepairAssignments(plan.input, assignments).join(" "),
    ).toContain("unavailable");
    plan.input.rooms.find((r) => r.id === "r3")!.capacity = 10;
    expect(
      validateRepairAssignments(plan.input, assignments).join(" "),
    ).toContain("capacity");
  });
  it("protects pending offers, confirmed cover, and started classes", () => {
    for (const status of ["offered", "covered"] as const) {
      const { s, now } = closurePlan();
      s.coverage.push({
        id: "protected",
        occurrenceId: "o2",
        absenceId: "a",
        status,
      });
      const input = buildRepairInput(s, s.repairRequests[0], now);
      expect(input.movableIds).not.toContain("o2");
      expect(
        validateRepairAssignments(
          input,
          s.occurrences.map((o) => (o.id === "o2" ? { ...o, period: 3 } : o)),
        ).join(" "),
      ).toContain("fixed");
    }
    const f = closurePlan();
    expect(
      buildRepairInput(
        f.s,
        f.s.repairRequests[0],
        new Date("2030-01-07T04:00Z"),
      ).movableIds,
    ).not.toContain("o1");
  });
  it("validates weekly teaching loads across the rest of the week", () => {
    const { s, plan } = absencePlan();
    plan.input.faculty[0].maxWeekly = 1;
    plan.input.weeklyLoads.f1 = 1;
    expect(
      validateRepairAssignments(
        plan.input,
        s.occurrences.map((o) => (o.id === "o1" ? { ...o, period: 3 } : o)),
      ),
    ).toContain("Faculty teaching limits would be exceeded.");
  });
  it("does not move classes outside coordinator scope", () => {
    const { s, plan } = closurePlan();
    expect(
      validateRepairAssignments(
        plan.input,
        s.occurrences.map((o) => (o.id === "o3" ? { ...o, period: 4 } : o)),
      ).join(" "),
    ).toContain("fixed");
  });
});
