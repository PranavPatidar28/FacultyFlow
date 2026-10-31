import { describe, it, expect } from "vitest";
import { applyAction, expireOffers } from "../src/lib/domain";
import { candidates, validateEntries } from "../src/lib/rules";
import { demoState, emptyState } from "../src/lib/seed";
import { classStart, monday } from "../src/lib/time";
import { actionSchema } from "../src/lib/validation";
function fixture() {
  const s = demoState(),
    admin = s.members[0],
    coverage = s.coverage[0],
    occ = s.occurrences.find((o) => o.id === coverage.occurrenceId)!;
  const now = new Date(
    classStart(occ.date, occ.period, s.settings).getTime() - 3600000,
  );
  return { s, admin, coverage, occ, now };
}
describe("Timetable validation", () => {
  it("detects shared faculty, room and section collisions", () => {
    const { s } = fixture();
    const entries = s.versions[0].entries;
    const e = entries[0];
    expect(
      validateEntries(s, [...entries, { ...e, id: "duplicate" }]).join(" "),
    ).toContain("Clash");
  });
  it("requires every component's complete weekly count", () => {
    const { s } = fixture();
    expect(validateEntries(s, []).some((e) => e.includes("exactly"))).toBe(
      true,
    );
  });
  it("rejects unqualified ownership", () => {
    const { s } = fixture();
    const es = structuredClone(s.versions[0].entries);
    es[0].facultyId = "f12";
    expect(validateEntries(s, es).some((e) => e.includes("not eligible"))).toBe(
      true,
    );
  });
  it("does not publish an invalid draft", () => {
    const { s, admin } = fixture();
    s.versions.push({
      ...s.versions[0],
      id: "draft",
      status: "draft",
      entries: [],
    });
    expect(() =>
      applyAction(s, admin, {
        type: "publish",
        versionId: "draft",
        effectiveDate: s.settings.start,
      }),
    ).toThrow("exactly");
  });
});
describe("Substitution acceptance", () => {
  it("confirms only after the offered faculty accepts", () => {
    const { s, admin, coverage, now, occ } = fixture();
    const match = candidates(s, occ.id)[0];
    expect(match).toBeTruthy();
    applyAction(
      s,
      admin,
      { type: "offer", coverageId: coverage.id, facultyId: match.facultyId },
      now,
    );
    expect(coverage.status).toBe("offered");
    expect(occ.facultyId).not.toBe(match.facultyId);
    const offer = s.offers.at(-1)!;
    const member = s.members.find((m) => m.facultyId === match.facultyId)!;
    applyAction(
      s,
      member,
      { type: "offer-response", id: offer.id, decision: "accepted" },
      now,
    );
    expect(coverage.status).toBe("covered");
    expect(occ.facultyId).toBe(match.facultyId);
    applyAction(
      s,
      member,
      { type: "offer-response", id: offer.id, decision: "accepted" },
      now,
    );
    expect(s.offers.filter((o) => o.status === "accepted")).toHaveLength(1);
  });
  it("refuses a second pending offer", () => {
    const { s, admin, coverage, now, occ } = fixture();
    const match = candidates(s, occ.id)[0];
    applyAction(
      s,
      admin,
      { type: "offer", coverageId: coverage.id, facultyId: match.facultyId },
      now,
    );
    expect(() =>
      applyAction(
        s,
        admin,
        { type: "offer", coverageId: coverage.id, facultyId: match.facultyId },
        now,
      ),
    ).toThrow("already");
  });
  it("expires offers and reopens coverage", () => {
    const { s, admin, coverage, now, occ } = fixture();
    const match = candidates(s, occ.id)[0];
    applyAction(
      s,
      admin,
      { type: "offer", coverageId: coverage.id, facultyId: match.facultyId },
      now,
    );
    expireOffers(s, new Date(now.getTime() + 31 * 60000));
    expect(s.offers.at(-1)?.status).toBe("expired");
    expect(coverage.status).toBe("uncovered");
  });
  it("rechecks changed availability during acceptance", () => {
    const { s, admin, coverage, now, occ } = fixture();
    const match = candidates(s, occ.id)[0];
    applyAction(
      s,
      admin,
      { type: "offer", coverageId: coverage.id, facultyId: match.facultyId },
      now,
    );
    const f = s.faculty.find((f) => f.id === match.facultyId)!;
    f.unavailable.push(
      `${new Date(`${occ.date}T12:00Z`).getUTCDay()}:${occ.period}`,
    );
    const member = s.members.find((m) => m.facultyId === match.facultyId)!;
    expect(() =>
      applyAction(
        s,
        member,
        {
          type: "offer-response",
          id: s.offers.at(-1)!.id,
          decision: "accepted",
        },
        now,
      ),
    ).toThrow("Availability changed");
  });
  it("rejects acceptance by another member", () => {
    const { s, admin, coverage, now, occ } = fixture();
    const match = candidates(s, occ.id)[0];
    applyAction(
      s,
      admin,
      { type: "offer", coverageId: coverage.id, facultyId: match.facultyId },
      now,
    );
    expect(() =>
      applyAction(
        s,
        admin,
        {
          type: "offer-response",
          id: s.offers.at(-1)!.id,
          decision: "accepted",
        },
        now,
      ),
    ).toThrow("Only the offered");
  });
  it("excludes an approved full-day absence", () => {
    const { s, occ } = fixture();
    const match = candidates(s, occ.id)[0];
    s.absences.push({
      id: "absent",
      facultyId: match.facultyId,
      date: occ.date,
      periods: [],
      reason: "private",
      status: "approved",
    });
    expect(
      candidates(s, occ.id).some((c) => c.facultyId === match.facultyId),
    ).toBe(false);
  });
  it("excludes candidates at their weekly limit", () => {
    const { s, occ } = fixture();
    const match = candidates(s, occ.id)[0];
    s.faculty.find((f) => f.id === match.facultyId)!.maxWeekly =
      match.weeklyLoad;
    expect(
      candidates(s, occ.id).some((c) => c.facultyId === match.facultyId),
    ).toBe(false);
  });
});
describe("Permissions and validation", () => {
  it("prevents faculty from editing setup", () => {
    const s = demoState(),
      member = s.members.find((m) => m.role === "faculty")!;
    expect(() =>
      applyAction(s, member, {
        type: "upsert",
        collection: "rooms",
        records: [s.rooms[0]],
      }),
    ).toThrow("Management");
  });
  it("prevents cross-department administration", () => {
    const s = demoState(),
      member = s.members.find((m) => m.role === "coordinator")!;
    expect(() =>
      applyAction(s, member, {
        type: "upsert",
        collection: "faculty",
        records: [s.faculty.find((f) => f.departmentId === "ece")!],
      }),
    ).toThrow("outside");
  });
  it("treats dates as actual calendar dates", () => {
    expect(
      actionSchema.safeParse({
        type: "absence",
        facultyId: "f1",
        date: "2026-02-31",
        reason: "test",
        periods: [],
      }).success,
    ).toBe(false);
  });
  it("calculates campus-local time correctly", () => {
    expect(
      classStart("2026-11-02", 0, emptyState().settings).toISOString(),
    ).toBe("2026-11-02T03:30:00.000Z");
    expect(monday("2026-11-01")).toBe("2026-10-26");
  });
});
