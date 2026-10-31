import type { Candidate, Entry, Faculty, Occurrence, State } from "./types";
import { monday, occupied, weekday } from "./time";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new DomainError(message, status);
}
export function consecutiveLimit(
  periods: number[],
  faculty: Faculty,
  s: State,
) {
  let streak = 0;
  const set = new Set(periods);
  for (const p of s.settings.periods) {
    streak = !p.break && set.has(p.id) ? streak + 1 : 0;
    if (streak > faculty.maxConsecutive) return false;
  }
  return true;
}
export function validateEntries(
  s: State,
  entries: Entry[],
  complete = true,
): string[] {
  const errors: string[] = [];
  const used = new Set<string>();
  const owners = new Map<string, string>();
  const counts = new Map<string, number>();
  const loads = new Map<string, number[]>();
  for (const e of entries) {
    const r = s.requirements.find((x) => x.id === e.requirementId),
      f = s.faculty.find((x) => x.id === e.facultyId),
      room = s.rooms.find((x) => x.id === e.roomId);
    const section = s.sections.find((x) => x.id === r?.sectionId);
    if (!r || !f || !room || !section) {
      errors.push(
        "An assignment references a missing requirement, faculty, section, or room.",
      );
      continue;
    }
    if (
      !f.subjects.includes(r.subjectId) ||
      (r.facultyId && r.facultyId !== f.id)
    )
      errors.push(`${f.name} is not eligible for ${r.id}.`);
    if (room.type !== r.kind || room.capacity < section.size)
      errors.push(`${room.name} does not meet ${section.name}'s requirements.`);
    if (e.duration !== r.duration || !s.settings.days.includes(e.day))
      errors.push(`Invalid duration or day for ${r.id}.`);
    if (owners.has(r.id) && owners.get(r.id) !== f.id)
      errors.push(`Teaching ownership must stay consistent for ${r.id}.`);
    owners.set(r.id, f.id);
    counts.set(r.id, (counts.get(r.id) || 0) + 1);
    for (const p of occupied(e.period, e.duration)) {
      const def = s.settings.periods.find((x) => x.id === p);
      if (!def || def.break || f.unavailable.includes(`${e.day}:${p}`))
        errors.push(`Unavailable period in ${r.id}.`);
      for (const key of [
        `f:${f.id}:${e.day}:${p}`,
        `r:${room.id}:${e.day}:${p}`,
        `s:${section.id}:${e.day}:${p}`,
      ]) {
        if (used.has(key))
          errors.push(`Clash at ${e.day}:${p} (${key.split(":")[0]}).`);
        used.add(key);
      }
      const key = `${f.id}:${e.day}`;
      loads.set(key, [...(loads.get(key) || []), p]);
    }
  }
  for (const f of s.faculty) {
    let total = 0;
    for (const d of s.settings.days) {
      const ps = loads.get(`${f.id}:${d}`) || [];
      total += ps.length;
      if (ps.length > f.maxDaily)
        errors.push(`${f.name} exceeds the daily limit.`);
      if (!consecutiveLimit(ps, f, s))
        errors.push(`${f.name} exceeds the consecutive teaching limit.`);
    }
    if (total > f.maxWeekly) errors.push(`${f.name} exceeds the weekly limit.`);
  }
  if (complete)
    for (const r of s.requirements)
      if (counts.get(r.id) !== r.sessions)
        errors.push(`${r.id} needs exactly ${r.sessions} sessions.`);
  return [...new Set(errors)];
}
export function candidateFor(
  s: State,
  o: Occurrence,
  f: Faculty | undefined,
): Candidate | null {
  const req = s.requirements.find((r) => r.id === o.requirementId);
  if (!req || !f || !f.subjects.includes(req.subjectId) || f.id === o.facultyId)
    return null;
  if (
    s.roomClosures.some(
      (c) =>
        c.status === "confirmed" &&
        c.date === o.date &&
        c.roomId === o.roomId &&
        occupied(o.period, o.duration).some((p) => c.periods.includes(p)),
    )
  )
    return null;
  const slots = occupied(o.period, o.duration),
    day = weekday(o.date);
  if (slots.some((p) => f.unavailable.includes(`${day}:${p}`))) return null;
  if (
    s.absences.some(
      (a) =>
        a.facultyId === f.id &&
        a.status === "approved" &&
        a.date === o.date &&
        (a.periods.length === 0 || slots.some((p) => a.periods.includes(p))),
    )
  )
    return null;
  const active = s.occurrences.filter(
    (x) =>
      x.facultyId === f.id &&
      !s.coverage.some(
        (c) => c.occurrenceId === x.id && c.status !== "covered",
      ),
  );
  const daily = active
    .filter((x) => x.date === o.date)
    .flatMap((x) => occupied(x.period, x.duration));
  if (
    slots.some((p) => daily.includes(p)) ||
    daily.length + o.duration > f.maxDaily ||
    !consecutiveLimit([...daily, ...slots], f, s)
  )
    return null;
  const week = monday(o.date);
  const weeklyLoad = active
    .filter((x) => monday(x.date) === week)
    .reduce((a, x) => a + x.duration, 0);
  if (weeklyLoad + o.duration > f.maxWeekly) return null;
  const recentCover = s.coverage.filter(
    (c) =>
      c.status === "covered" &&
      c.substituteId === f.id &&
      s.occurrences.some(
        (x) =>
          x.id === c.occurrenceId &&
          x.date <= o.date &&
          x.date >=
            new Date(Date.parse(`${o.date}T12:00:00Z`) - 28 * 86400000)
              .toISOString()
              .slice(0, 10),
      ),
  ).length;
  const adjacent = daily.some(
    (p) => p === o.period - 1 || p === o.period + o.duration,
  );
  const headroom = f.maxWeekly - weeklyLoad - o.duration;
  return {
    facultyId: f.id,
    score: headroom * 100 - recentCover * 10 + (adjacent ? 1 : 0),
    weeklyLoad,
    resultingLoad: weeklyLoad + o.duration,
    recentCover,
    reasons: [
      "Approved subject qualification",
      `${headroom} periods of weekly headroom`,
      `${recentCover} substitutions in the previous 28 days`,
      adjacent
        ? "Fits alongside an existing class"
        : "Available for the entire session",
    ],
  };
}
export function candidates(s: State, occurrenceId: string) {
  const o = s.occurrences.find((o) => o.id === occurrenceId);
  return o
    ? s.faculty
        .map((f) => candidateFor(s, o, f))
        .filter((c): c is Candidate => !!c)
        .sort(
          (a, b) => b.score - a.score || a.facultyId.localeCompare(b.facultyId),
        )
    : [];
}
