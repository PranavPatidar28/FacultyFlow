import { z } from "zod";
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(160);
const date = z.iso.date();
const positive = z.number().int().min(1).max(500);
const slot = z.string().regex(/^[0-6]:\d{1,2}$/);
export const facultySchema = z
  .object({
    id,
    name,
    email: z.email(),
    departmentId: id,
    title: name,
    subjects: z.array(id),
    target: z.number().int().min(0).max(100),
    maxWeekly: positive,
    maxDaily: positive,
    maxConsecutive: positive,
    unavailable: z.array(slot),
    preferred: z.array(slot),
  })
  .refine(
    (f) =>
      f.target <= f.maxWeekly &&
      f.maxConsecutive <= f.maxDaily &&
      f.maxDaily <= f.maxWeekly,
    "Teaching limits must be consistent",
  );
export const recordSchemas = {
  departments: z.object({
    id,
    name,
    code: name,
    color: z.enum(["violet", "blue", "emerald", "amber", "rose", "cyan"]),
  }),
  faculty: facultySchema,
  subjects: z.object({
    id,
    name,
    code: name,
    departmentId: id,
    color: z.enum(["violet", "blue", "emerald", "amber", "rose", "cyan"]),
  }),
  sections: z.object({ id, name, departmentId: id, size: positive }),
  rooms: z.object({
    id,
    name,
    type: z.enum(["lecture", "lab"]),
    capacity: positive,
  }),
  requirements: z.object({
    id,
    subjectId: id,
    sectionId: id,
    kind: z.enum(["lecture", "lab"]),
    sessions: positive,
    duration: z.number().int().min(1).max(8),
    facultyId: id.optional(),
  }),
  members: z.object({
    id,
    name,
    email: z.email(),
    role: z.enum(["admin", "coordinator", "faculty"]),
    departmentId: id,
    facultyId: id.optional(),
    authId: id.optional(),
  }),
};
export const entrySchema = z.object({
  id,
  requirementId: id,
  facultyId: id,
  roomId: id,
  day: z.number().int().min(0).max(6),
  period: z.number().int().min(0).max(23),
  duration: z.number().int().min(1).max(8),
  locked: z.boolean(),
});
export const settingsSchema = z
  .object({
    name,
    term: name,
    timezone: name.refine((t) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: t });
        return true;
      } catch {
        return false;
      }
    }, "Use an IANA timezone"),
    start: date,
    end: date,
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    holidays: z.array(date),
    periods: z
      .array(
        z.object({
          id: z.number().int().min(0).max(23),
          label: name,
          start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          break: z.boolean(),
        }),
      )
      .min(1)
      .max(24),
  })
  .superRefine((s, c) => {
    if (
      s.start > s.end ||
      Date.parse(s.end) - Date.parse(s.start) > 370 * 86400000
    )
      c.addIssue({
        code: "custom",
        message: "Term must be at most 370 days and end after its start",
      });
    if (new Set(s.days).size !== s.days.length)
      c.addIssue({ code: "custom", message: "Duplicate working days" });
    for (let i = 0; i < s.periods.length; i++) {
      const p = s.periods[i];
      if (
        p.id !== i ||
        p.end <= p.start ||
        (i > 0 && s.periods[i - 1].end > p.start)
      )
        c.addIssue({
          code: "custom",
          message:
            "Periods must have consecutive IDs, positive length, and no time overlaps",
        });
    }
  });
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("closure-create"),
    roomId: id,
    date,
    periods: z.array(z.number().int().min(0).max(23)).min(1),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal("closure-decision"),
    id,
    decision: z.enum(["confirm", "cancel"]),
  }),
  z.object({
    type: z.literal("repair-request"),
    key: z.uuid(),
    trigger: z.enum(["closure", "absence"]),
    triggerId: id,
    departmentIds: z.array(id).min(1).max(10),
  }),
  z.object({
    type: z.literal("repair-consent"),
    planId: id,
    decision: z.enum(["accepted", "declined"]),
  }),
  z.object({ type: z.literal("repair-withdraw"), planId: id }),
  z.object({ type: z.literal("repair-apply"), planId: id }),
  z.object({
    type: z.literal("upsert"),
    collection: z.enum([
      "departments",
      "faculty",
      "subjects",
      "sections",
      "rooms",
      "requirements",
      "members",
    ]),
    records: z.array(z.unknown()).min(1).max(500),
  }),
  z.object({ type: z.literal("settings"), settings: settingsSchema }),
  z.object({
    type: z.literal("availability"),
    unavailable: z.array(slot),
    preferred: z.array(slot),
  }),
  z.object({
    type: z.literal("absence"),
    facultyId: id,
    date,
    periods: z.array(z.number().int().min(0).max(23)),
    reason: z.string().trim().min(1).max(1000),
    urgent: z.boolean().default(false),
  }),
  z.object({ type: z.literal("absence-decision"), id, approve: z.boolean() }),
  z.object({
    type: z.literal("offer"),
    coverageId: id,
    facultyId: id,
    expiresAt: z.iso.datetime().optional(),
  }),
  z.object({
    type: z.literal("offer-response"),
    id,
    decision: z.enum(["accepted", "declined", "withdrawn"]),
  }),
  z.object({ type: z.literal("reopen-coverage"), coverageId: id }),
  z.object({ type: z.literal("publish"), versionId: id, effectiveDate: date }),
  z.object({
    type: z.literal("edit-entry"),
    versionId: id,
    entry: entrySchema,
  }),
  z.object({ type: z.literal("clone"), versionId: id }),
  z.object({
    type: z.literal("generate"),
    key: z.uuid(),
    versionId: id.optional(),
  }),
  z.object({ type: z.literal("read-notifications") }),
]);
export type Action = z.infer<typeof actionSchema>;
