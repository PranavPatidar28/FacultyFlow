import type { AppData, Member, State, Viewer } from "./types";
import { assert, candidates, candidateFor, validateEntries } from "./rules";
import { addDays, classStart, localDate, occupied, weekday } from "./time";
import { recordSchemas, type Action } from "./validation";
import { applyRepairAction, roomBlocked } from "./repairs";
export function notify(
  s: State,
  memberId: string,
  title: string,
  body: string,
  href: string,
  key: string,
) {
  if (!s.notifications.some((n) => n.id === key))
    s.notifications.push({
      id: key,
      memberId,
      title,
      body,
      href,
      read: false,
      createdAt: new Date().toISOString(),
    });
}
function managers(s: State, departmentId: string) {
  return s.members.filter(
    (m) =>
      m.role === "admin" ||
      (m.role === "coordinator" && m.departmentId === departmentId),
  );
}
export function managed(s: State, m: Member, facultyId: string) {
  const f = s.faculty.find((f) => f.id === facultyId);
  assert(f, "Faculty not found", 404);
  assert(
    m.role === "admin" ||
      (m.role === "coordinator" && m.departmentId === f.departmentId),
    "This faculty is outside your department",
    403,
  );
}
function coverageAccess(s: State, m: Member, id: string) {
  const c = s.coverage.find((c) => c.id === id);
  assert(c, "Coverage task not found", 404);
  const o = s.occurrences.find((o) => o.id === c.occurrenceId);
  assert(o, "Class no longer exists", 409);
  const section = s.sections.find((x) => x.id === o.sectionId)!;
  assert(
    m.role === "admin" ||
      (m.role === "coordinator" && m.departmentId === section.departmentId),
    "This class is outside your department",
    403,
  );
  return { c, o };
}
export function expireOffers(s: State, now = new Date()) {
  for (const o of s.offers.filter(
    (o) => o.status === "pending" && Date.parse(o.expiresAt) <= now.getTime(),
  )) {
    o.status = "expired";
    const c = s.coverage.find((c) => c.id === o.coverageId);
    if (c?.status === "offered") {
      c.status = "uncovered";
      const occ = s.occurrences.find((x) => x.id === c.occurrenceId);
      const dep =
        s.sections.find((x) => x.id === occ?.sectionId)?.departmentId || "";
      for (const m of managers(s, dep))
        notify(
          s,
          m.id,
          "Substitution offer expired",
          "This class needs another offer.",
          "/substitutions",
          `${o.id}-expired-${m.id}`,
        );
    }
  }
}
export function offerIsStale(s: State, offer: State["offers"][number]) {
  const c = s.coverage.find((c) => c.id === offer.coverageId),
    o = s.occurrences.find((o) => o.id === c?.occurrenceId);
  return (
    !o ||
    o.versionId !== offer.versionId ||
    !candidateFor(
      s,
      o,
      s.faculty.find((f) => f.id === offer.facultyId),
    )
  );
}
export function invalidateOffers(s: State) {
  for (const offer of s.offers.filter(
    (o) => o.status === "pending" && offerIsStale(s, o),
  )) {
    offer.status = "invalidated";
    const c = s.coverage.find((c) => c.id === offer.coverageId);
    if (c?.status === "offered") c.status = "uncovered";
    for (const m of s.members.filter((m) => m.facultyId === offer.facultyId))
      notify(
        s,
        m.id,
        "Substitution offer updated",
        "The assignment is no longer available. Your schedule has not changed.",
        "/inbox",
        `${offer.id}-invalidated-${m.id}`,
      );
  }
}
function approveAbsence(s: State, id: string) {
  const a = s.absences.find((a) => a.id === id)!;
  a.status = "approved";
  for (const o of s.occurrences.filter(
    (o) =>
      o.facultyId === a.facultyId &&
      o.date === a.date &&
      (a.periods.length === 0 ||
        occupied(o.period, o.duration).some((p) => a.periods.includes(p))),
  )) {
    if (
      s.coverage.some((c) => c.occurrenceId === o.id && c.status !== "covered")
    )
      continue;
    const previous = s.coverage.find(
      (c) => c.occurrenceId === o.id && c.status === "covered",
    );
    if (previous) {
      previous.status = "uncovered";
      previous.substituteId = undefined;
      previous.absenceId = a.id;
    } else {
      const id = `cover-${a.id}-${o.id}`;
      s.coverage.push({
        id,
        occurrenceId: o.id,
        absenceId: a.id,
        status: "uncovered",
      });
    }
    for (const offer of s.offers.filter(
      (x) =>
        x.status === "accepted" &&
        s.coverage.some(
          (c) => c.id === x.coverageId && c.occurrenceId === o.id,
        ),
    ))
      offer.status = "invalidated";
  }
}
export function applyAction(
  s: State,
  m: Member,
  a: Action,
  now = new Date(),
): unknown {
  expireOffers(s, now);
  let result: unknown = { ok: true };
  const nowIso = now.toISOString();
  switch (a.type) {
    case "closure-create":
    case "closure-decision":
    case "repair-request":
    case "repair-consent":
    case "repair-withdraw":
    case "repair-apply":
      result = applyRepairAction(s, m, a, now);
      break;
    case "upsert": {
      assert(m.role !== "faculty", "Management access required", 403);
      if (["departments", "rooms", "members"].includes(a.collection))
        assert(m.role === "admin", "Admin access required", 403);
      const parsed = a.records.map((r) => recordSchemas[a.collection].parse(r));
      for (const record of parsed) {
        const rec = record as unknown as Record<string, unknown>;
        if (m.role === "coordinator") {
          const dep =
            rec.departmentId ||
            s.sections.find((x) => x.id === rec.sectionId)?.departmentId;
          assert(
            dep === m.departmentId,
            "Record is outside your department",
            403,
          );
          const existing = (
            s[a.collection] as {
              id: string;
              departmentId?: string;
              sectionId?: string;
            }[]
          ).find((r) => r.id === rec.id);
          if (existing)
            assert(
              (existing.departmentId ||
                s.sections.find((x) => x.id === existing.sectionId)
                  ?.departmentId) === m.departmentId,
              "Record is outside your department",
              403,
            );
        }
        if (rec.departmentId)
          assert(
            s.departments.some((d) => d.id === rec.departmentId),
            "Department does not exist",
          );
        if (a.collection === "faculty")
          assert(
            (rec.subjects as string[]).every((id) =>
              s.subjects.some((x) => x.id === id),
            ),
            "Unknown subject qualification",
          );
        if (a.collection === "members") {
          assert(
            !s.members.some(
              (x) =>
                x.id !== rec.id &&
                x.email.toLowerCase() === String(rec.email).toLowerCase(),
            ),
            "This email is already invited",
          );
          if (rec.facultyId)
            assert(
              s.faculty.some(
                (f) =>
                  f.id === rec.facultyId && f.departmentId === rec.departmentId,
              ),
              "Faculty membership must match its department",
            );
          const old = s.members.find((x) => x.id === rec.id);
          if (old?.authId) rec.authId = old.authId;
          else delete rec.authId;
        }
        if (a.collection === "requirements") {
          assert(
            s.subjects.some((x) => x.id === rec.subjectId) &&
              s.sections.some((x) => x.id === rec.sectionId),
            "Unknown subject or section",
          );
          if (rec.facultyId)
            assert(
              s.faculty.some(
                (x) =>
                  x.id === rec.facultyId &&
                  x.subjects.includes(String(rec.subjectId)),
              ),
              "Fixed teacher must be qualified",
            );
        }
        const list = s[a.collection] as { id: string }[];
        const index = list.findIndex((x) => x.id === record.id);
        if (
          index >= 0 &&
          a.collection === "requirements" &&
          s.versions.some(
            (v) =>
              v.status !== "draft" &&
              v.entries.some((e) => e.requirementId === record.id),
          )
        )
          assert(
            JSON.stringify(list[index]) === JSON.stringify(record),
            "Published teaching requirements are immutable. Add a new component for a revision.",
            409,
          );
        if (index < 0) list.push(record);
        else list[index] = record;
      }
      assert(
        s.members.some((x) => x.role === "admin"),
        "Keep at least one administrator",
      );
      for (const version of s.versions.filter(
        (v) => v.status === "published",
      )) {
        const errors = validateEntries(s, version.entries, false);
        assert(
          !errors.length,
          `This change would invalidate the published timetable: ${errors.join(" ")}`,
          409,
        );
      }
      break;
    }
    case "settings":
      assert(m.role === "admin", "Admin access required", 403);
      assert(
        !s.versions.some((v) => v.status === "published"),
        "Calendar is frozen after publication. Create a new term to change it.",
        409,
      );
      s.settings = a.settings;
      break;
    case "availability": {
      assert(m.facultyId, "A faculty profile is required");
      const f = s.faculty.find((f) => f.id === m.facultyId)!;
      const old = f.unavailable;
      f.unavailable = a.unavailable;
      f.preferred = a.preferred;
      const clashes = s.occurrences.some(
        (o) =>
          o.facultyId === f.id &&
          o.date >= localDate(now, s.settings.timezone) &&
          occupied(o.period, o.duration).some((p) =>
            a.unavailable.includes(`${weekday(o.date)}:${p}`),
          ),
      );
      if (clashes) {
        f.unavailable = old;
        assert(
          false,
          "Availability overlaps published classes. Request an absence for existing commitments.",
          409,
        );
      }
      break;
    }
    case "absence": {
      if (m.role === "faculty")
        assert(
          a.facultyId === m.facultyId,
          "You may only request your own absence",
          403,
        );
      else managed(s, m, a.facultyId);
      assert(
        a.date >= localDate(now, s.settings.timezone) &&
          a.date <= s.settings.end,
        "Choose a remaining date in this term",
      );
      assert(
        a.periods.every((id) =>
          s.settings.periods.some((p) => p.id === id && !p.break),
        ),
        "Unknown teaching period",
      );
      assert(
        !a.urgent || m.role !== "faculty",
        "Only management may approve urgent absence",
        403,
      );
      const id = crypto.randomUUID();
      s.absences.push({
        id,
        facultyId: a.facultyId,
        date: a.date,
        periods: a.periods,
        reason: a.reason,
        status: "pending",
      });
      if (a.urgent) approveAbsence(s, id);
      result = { id };
      break;
    }
    case "absence-decision": {
      const absence = s.absences.find((x) => x.id === a.id);
      assert(absence, "Absence not found", 404);
      managed(s, m, absence.facultyId);
      assert(
        absence.status === "pending",
        "Absence has already been decided",
        409,
      );
      if (a.approve) approveAbsence(s, a.id);
      else absence.status = "rejected";
      break;
    }
    case "offer": {
      const { c, o } = coverageAccess(s, m, a.coverageId);
      assert(
        c.status === "uncovered",
        "Class already has an offer or confirmed cover",
        409,
      );
      assert(
        candidateFor(
          s,
          o,
          s.faculty.find((x) => x.id === a.facultyId)!,
        ),
        "Faculty is no longer eligible",
        409,
      );
      const start = classStart(o.date, o.period, s.settings).getTime();
      const expiresAt =
        a.expiresAt ||
        new Date(Math.min(now.getTime() + 30 * 60000, start)).toISOString();
      assert(
        Date.parse(expiresAt) > now.getTime() && Date.parse(expiresAt) <= start,
        "Offer must expire before class starts",
      );
      const id = crypto.randomUUID();
      s.offers.push({
        id,
        coverageId: c.id,
        facultyId: a.facultyId,
        status: "pending",
        expiresAt,
        createdAt: nowIso,
        versionId: o.versionId,
      });
      c.status = "offered";
      for (const member of s.members.filter((x) => x.facultyId === a.facultyId))
        notify(
          s,
          member.id,
          "A class could use your expertise",
          `${o.date} · Review this substitution offer before it expires.`,
          "/inbox",
          `${id}-${member.id}`,
        );
      result = { offerId: id, expiresAt };
      break;
    }
    case "offer-response": {
      const offer = s.offers.find((x) => x.id === a.id);
      assert(offer, "Offer not found", 404);
      const c = s.coverage.find((x) => x.id === offer.coverageId)!;
      const o = s.occurrences.find((x) => x.id === c.occurrenceId);
      if (a.decision === "withdrawn") coverageAccess(s, m, c.id);
      else
        assert(
          m.facultyId === offer.facultyId,
          "Only the offered faculty may respond",
          403,
        );
      if (offer.status === a.decision) break;
      assert(
        offer.status === "pending" &&
          Date.parse(offer.expiresAt) > now.getTime(),
        "Offer is no longer active",
        409,
      );
      if (a.decision === "accepted") {
        assert(
          o && o.versionId === offer.versionId,
          "Timetable changed; ask for a new offer",
          409,
        );
        assert(
          candidateFor(
            s,
            o,
            s.faculty.find((f) => f.id === offer.facultyId)!,
          ),
          "Availability changed; this assignment would violate teaching constraints",
          409,
        );
        o.facultyId = offer.facultyId;
        c.status = "covered";
        c.substituteId = offer.facultyId;
      } else c.status = "uncovered";
      offer.status = a.decision;
      const dep =
        s.sections.find((x) => x.id === o?.sectionId)?.departmentId || "";
      for (const manager of managers(s, dep))
        notify(
          s,
          manager.id,
          `Substitution ${a.decision}`,
          "The coverage queue has been updated.",
          "/substitutions",
          `${offer.id}-${a.decision}-${manager.id}`,
        );
      break;
    }
    case "reopen-coverage": {
      const { c, o } = coverageAccess(s, m, a.coverageId);
      assert(
        c.status === "covered",
        "Only confirmed cover can be reopened",
        409,
      );
      assert(
        classStart(o.date, o.period, s.settings) > now,
        "Past classes cannot be reopened",
        409,
      );
      o.facultyId = o.originalFacultyId;
      c.status = "uncovered";
      c.substituteId = undefined;
      for (const offer of s.offers.filter(
        (x) => x.coverageId === c.id && x.status === "accepted",
      ))
        offer.status = "invalidated";
      break;
    }
    case "clone": {
      assert(m.role !== "faculty", "Management access required", 403);
      const v = s.versions.find((v) => v.id === a.versionId);
      assert(v, "Timetable not found", 404);
      const id = crypto.randomUUID();
      s.versions.push({
        ...structuredClone(v),
        id,
        status: "draft",
        name: `Revision ${s.versions.length + 1}`,
        createdAt: nowIso,
        effectiveDate: undefined,
        sourceRevision: s.revision,
      });
      result = { versionId: id };
      break;
    }
    case "edit-entry": {
      assert(m.role !== "faculty", "Management access required", 403);
      const v = s.versions.find((v) => v.id === a.versionId);
      assert(v?.status === "draft", "Only drafts can be edited", 409);
      const old = v.entries.find((e) => e.id === a.entry.id);
      assert(old, "Assignment not found", 404);
      if (m.role === "coordinator")
        for (const reqId of [old.requirementId, a.entry.requirementId])
          assert(
            s.sections.find(
              (x) =>
                x.id === s.requirements.find((r) => r.id === reqId)?.sectionId,
            )?.departmentId === m.departmentId,
            "Assignment is outside your department",
            403,
          );
      const entries = v.entries.map((e) =>
        e.id === a.entry.id
          ? a.entry
          : old.facultyId !== a.entry.facultyId &&
              e.requirementId === old.requirementId
            ? { ...e, facultyId: a.entry.facultyId }
            : e,
      );
      const errors = validateEntries(s, entries);
      assert(!errors.length, errors.join(" "), 409);
      v.entries = entries;
      break;
    }
    case "publish": {
      assert(
        m.role === "admin",
        "Only an admin can publish a college-wide timetable",
        403,
      );
      const v = s.versions.find((v) => v.id === a.versionId);
      assert(v, "Draft not found", 404);
      if (v.status === "published" && v.effectiveDate === a.effectiveDate)
        break;
      assert(v.status === "draft", "Only drafts may be published", 409);
      assert(
        a.effectiveDate >= localDate(now, s.settings.timezone) &&
          a.effectiveDate >= s.settings.start &&
          a.effectiveDate <= s.settings.end,
        "Invalid effective date",
      );
      const errors = validateEntries(s, v.entries);
      assert(!errors.length, errors.join(" "), 409);
      const future = s.occurrences.filter((o) => o.date >= a.effectiveDate);
      assert(
        !s.repairPlans.some(
          (p) =>
            p.status === "applied" &&
            p.changes.some((c) => c.after.date >= a.effectiveDate),
        ),
        "Publication would overwrite applied dated repairs. Choose an effective date after those repairs.",
        409,
      );
      for (
        let date = a.effectiveDate;
        date <= s.settings.end;
        date = addDays(date, 1)
      ) {
        if (s.settings.holidays.includes(date)) continue;
        for (const e of v.entries.filter((e) => e.day === weekday(date)))
          assert(
            !roomBlocked(s, {
              date,
              period: e.period,
              duration: e.duration,
              roomId: e.roomId,
            }),
            `Room closure conflicts with a new class on ${date}. Revise this timetable or its effective date.`,
            409,
          );
      }
      assert(
        !s.coverage.some(
          (c) =>
            future.some((o) => o.id === c.occurrenceId) &&
            (c.status === "offered" || c.status === "covered"),
        ),
        "Resolve pending offers and confirmed substitutions before replacing this timetable",
        409,
      );
      s.occurrences = s.occurrences.filter((o) => o.date < a.effectiveDate);
      s.coverage = s.coverage.filter((c) =>
        s.occurrences.some((o) => o.id === c.occurrenceId),
      );
      for (const old of s.versions.filter((x) => x.status === "published"))
        old.status = "archived";
      v.status = "published";
      v.effectiveDate = a.effectiveDate;
      for (
        let date = a.effectiveDate;
        date <= s.settings.end;
        date = addDays(date, 1)
      ) {
        if (s.settings.holidays.includes(date)) continue;
        for (const e of v.entries.filter((e) => e.day === weekday(date))) {
          const r = s.requirements.find((r) => r.id === e.requirementId)!;
          s.occurrences.push({
            id: `${v.id}-${date}-${e.id}`,
            versionId: v.id,
            entryId: e.id,
            requirementId: e.requirementId,
            date,
            period: e.period,
            duration: e.duration,
            facultyId: e.facultyId,
            originalFacultyId: e.facultyId,
            roomId: e.roomId,
            sectionId: r.sectionId,
          });
        }
      }
      for (const a of s.absences.filter((a) => a.status === "approved"))
        approveAbsence(s, a.id);
      for (const member of s.members)
        notify(
          s,
          member.id,
          "A new timetable is published",
          `Effective ${a.effectiveDate}. Your schedule is ready.`,
          "/timetable",
          `${v.id}-${member.id}`,
        );
      break;
    }
    case "generate": {
      assert(m.role !== "faculty", "Management access required", 403);
      const existing = s.jobs.find((j) => j.key === a.key);
      if (existing) {
        result = { jobId: existing.id };
        break;
      }
      assert(
        !s.jobs.some((j) => j.status === "queued" || j.status === "running"),
        "A generation job is already in progress",
        409,
      );
      assert(
        s.requirements.length,
        "Add teaching requirements before generating",
      );
      const locks = a.versionId
        ? s.versions
            .find((v) => v.id === a.versionId)
            ?.entries.filter((e) => e.locked)
        : [];
      assert(!a.versionId || locks, "Timetable not found", 404);
      const id = crypto.randomUUID();
      s.jobs.push({
        id,
        key: a.key,
        status: "queued",
        createdAt: nowIso,
        revision: s.revision,
        input: structuredClone({
          settings: s.settings,
          faculty: s.faculty,
          rooms: s.rooms,
          sections: s.sections,
          requirements: s.requirements,
          locks: locks || [],
        }),
      });
      result = { jobId: id };
      break;
    }
    case "read-notifications":
      for (const n of s.notifications.filter((n) => n.memberId === m.id))
        n.read = true;
      break;
  }
  s.audit.push({
    id: crypto.randomUUID(),
    actorId: m.id,
    action: a.type,
    targetId:
      "id" in a
        ? a.id
        : "planId" in a
          ? a.planId
          : "triggerId" in a
            ? a.triggerId
            : "",
    createdAt: nowIso,
  });
  s.revision++;
  return result;
}
export function appData(s: State, viewer: Viewer): AppData {
  const data = structuredClone(s);
  const m = viewer.member;
  data.members =
    viewer.demo || m.role === "admin"
      ? data.members.map((x) => ({ ...x, authId: undefined }))
      : [{ ...m, authId: undefined }];
  data.absences = data.absences
    .filter(
      (a) =>
        m.role === "admin" ||
        (m.role === "coordinator" &&
          s.faculty.find((f) => f.id === a.facultyId)?.departmentId ===
            m.departmentId) ||
        a.facultyId === m.facultyId,
    )
    .map((a) => ({
      ...a,
      reason:
        a.facultyId === m.facultyId || m.role !== "faculty" ? a.reason : "",
    }));
  data.notifications = data.notifications.filter((n) => n.memberId === m.id);
  data.audit = m.role === "admin" ? data.audit : [];
  const visible = data.coverage.filter(
    (c) =>
      m.role === "admin" ||
      (m.role === "coordinator" &&
        s.sections.find(
          (x) =>
            x.id ===
            s.occurrences.find((o) => o.id === c.occurrenceId)?.sectionId,
        )?.departmentId === m.departmentId),
  );
  data.coverage =
    m.role === "faculty"
      ? data.coverage.filter((c) =>
          s.offers.some(
            (o) => o.coverageId === c.id && o.facultyId === m.facultyId,
          ),
        )
      : visible;
  data.offers = data.offers.filter((o) =>
    m.role !== "faculty"
      ? visible.some((c) => c.id === o.coverageId)
      : o.facultyId === m.facultyId,
  );
  const allowedRequests = s.repairRequests.filter(
    (r) =>
      m.role === "admin" ||
      (m.role === "coordinator" && r.departmentIds.includes(m.departmentId)) ||
      s.repairConsents.some(
        (c) =>
          s.repairPlans.some(
            (p) => p.id === c.planId && p.requestId === r.id,
          ) && c.facultyId === m.facultyId,
      ),
  );
  data.repairRequests = allowedRequests;
  data.repairConsents = data.repairConsents.filter((c) =>
    m.role === "faculty"
      ? c.facultyId === m.facultyId
      : allowedRequests.some((r) =>
          s.repairPlans.some((p) => p.id === c.planId && p.requestId === r.id),
        ),
  );
  data.roomClosures = data.roomClosures.filter(
    (c) =>
      m.role !== "faculty" ||
      (c.status === "confirmed" &&
        s.occurrences.some(
          (o) =>
            o.date === c.date &&
            o.roomId === c.roomId &&
            o.facultyId === m.facultyId,
        )),
  );
  const { jobs, repairPlans, ...rest } = data;
  return {
    ...rest,
    features: {
      dailyChanges:
        process.env.DEMO_MODE === "true" ||
        process.env.DAILY_CHANGES_ENABLED === "true",
    },
    repairPlans: repairPlans
      .filter((p) => allowedRequests.some((r) => r.id === p.requestId))
      .map(({ input, ...p }) => {
        void input;
        return p;
      }),
    jobs:
      m.role === "faculty"
        ? []
        : jobs.map(({ input: _input, ...job }) => {
            void _input;
            return job;
          }),
    viewer,
    candidates: Object.fromEntries(
      visible
        .filter((c) => c.status === "uncovered")
        .map((c) => [c.id, candidates(s, c.occurrenceId)]),
    ),
  };
}
