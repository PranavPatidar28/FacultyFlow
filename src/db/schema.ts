import {
  integer,
  jsonb,
  pgTable,
  text,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Settings, State } from "@/lib/types";
export const campus = pgTable("campus", {
  id: text().primaryKey(),
  revision: integer().notNull().default(0),
  settings: jsonb().$type<Settings>().notNull(),
});
// Each domain collection has its own table; JSON payloads keep solver snapshots and
// rich preference structures versionable. Cross-record validation lives in services.
function records<T>(name: string) {
  return pgTable(name, {
    id: text().primaryKey(),
    data: jsonb().$type<T>().notNull(),
  });
}
export const members = pgTable(
  "members",
  {
    id: text().primaryKey(),
    data: jsonb().$type<State["members"][number]>().notNull(),
  },
  (t) => [
    uniqueIndex("member_email").on(sql`lower(${t.data}->>'email')`),
    uniqueIndex("member_identity").on(sql`(${t.data}->>'authId')`),
  ],
);
export const departments = records<State["departments"][number]>("departments");
export const faculty = records<State["faculty"][number]>("faculty");
export const subjects = records<State["subjects"][number]>("subjects");
export const sections = records<State["sections"][number]>("sections");
export const rooms = records<State["rooms"][number]>("rooms");
export const requirements =
  records<State["requirements"][number]>("requirements");
export const versions = records<State["versions"][number]>("versions");
export const occurrences = records<State["occurrences"][number]>("occurrences");
export const absences = records<State["absences"][number]>("absences");
export const coverage = pgTable(
  "coverage",
  {
    id: text().primaryKey(),
    data: jsonb().$type<State["coverage"][number]>().notNull(),
  },
  (t) => [
    uniqueIndex("coverage_occurrence").on(sql`(${t.data}->>'occurrenceId')`),
  ],
);
export const offers = pgTable(
  "offers",
  {
    id: text().primaryKey(),
    data: jsonb().$type<State["offers"][number]>().notNull(),
  },
  (t) => [
    uniqueIndex("one_pending_offer")
      .on(sql`(${t.data}->>'coverageId')`)
      .where(sql`${t.data}->>'status' = 'pending'`),
  ],
);
export const notifications =
  records<State["notifications"][number]>("notifications");
export const jobs = pgTable(
  "jobs",
  {
    id: text().primaryKey(),
    data: jsonb().$type<State["jobs"][number]>().notNull(),
  },
  (t) => [uniqueIndex("generation_idempotency").on(sql`(${t.data}->>'key')`)],
);
export const audit = records<State["audit"][number]>("audit");
export const roomClosures =
  records<State["roomClosures"][number]>("room_closures");
export const repairRequests =
  records<State["repairRequests"][number]>("repair_requests");
export const repairPlans = pgTable(
  "repair_plans",
  {
    id: text().primaryKey(),
    data: jsonb().$type<State["repairPlans"][number]>().notNull(),
  },
  (t) => [uniqueIndex("repair_key").on(sql`(${t.data}->>'key')`)],
);
export const repairConsents = pgTable(
  "repair_consents",
  {
    id: text().primaryKey(),
    data: jsonb().$type<State["repairConsents"][number]>().notNull(),
  },
  (t) => [
    uniqueIndex("repair_faculty_consent").on(
      sql`(${t.data}->>'planId')`,
      sql`(${t.data}->>'facultyId')`,
    ),
  ],
);
export const tables = {
  members,
  departments,
  faculty,
  subjects,
  sections,
  rooms,
  requirements,
  versions,
  occurrences,
  absences,
  coverage,
  offers,
  notifications,
  jobs,
  audit,
  roomClosures,
  repairRequests,
  repairPlans,
  repairConsents,
};
export const occupancy = pgTable(
  "occupancy",
  {
    occurrenceId: text()
      .notNull()
      .references(() => occurrences.id, { onDelete: "cascade" }),
    date: text().notNull(),
    period: integer().notNull(),
    facultyId: text(),
    sectionId: text().notNull(),
    roomId: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.occurrenceId, t.period] }),
    uniqueIndex("faculty_slot").on(t.date, t.period, t.facultyId),
    uniqueIndex("section_slot").on(t.date, t.period, t.sectionId),
    uniqueIndex("room_slot").on(t.date, t.period, t.roomId),
  ],
);
