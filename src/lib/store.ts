import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campus, occupancy, tables } from "@/db/schema";
import { demoState, emptyState } from "./seed";
import { occupied } from "./time";
import { assert } from "./rules";
import type { State } from "./types";
export const demoEnabled = () => process.env.DEMO_MODE === "true";
type DemoSession = { state: State; touched: number };
const globalStore = globalThis as typeof globalThis & {
  facultyDemo?: Map<string, DemoSession>;
  facultyLocks?: Map<string, Promise<unknown>>;
};
const sessions = () => (globalStore.facultyDemo ??= new Map());
async function sessionId() {
  const id = (await cookies()).get("facultyflow-demo")?.value;
  assert(
    id && /^[\da-f-]{36}$/i.test(id),
    "Open the demo workspace first",
    401,
  );
  return id;
}
export async function loadState(): Promise<State> {
  if (demoEnabled()) {
    const id = await sessionId();
    const map = sessions();
    if (map.size > 200)
      for (const [key, value] of map)
        if (Date.now() - value.touched > 3600000) map.delete(key);
    if (!map.has(id)) map.set(id, { state: demoState(), touched: Date.now() });
    map.get(id)!.touched = Date.now();
    return structuredClone(map.get(id)!.state);
  }
  const database = db();
  const [config, ...rows] = await Promise.all([
    database.select().from(campus).where(eq(campus.id, "main")),
    ...Object.values(tables).map((table) => database.select().from(table)),
  ]);
  assert(
    config[0],
    "Database is not initialized. Run db:migrate and db:seed.",
    503,
  );
  const s = emptyState();
  s.settings = config[0].settings;
  s.revision = config[0].revision;
  Object.keys(tables).forEach((key, i) => {
    (s as unknown as Record<string, unknown>)[key] = rows[i].map(
      (row) => row.data,
    );
  });
  return s;
}
export async function mutate<T>(
  fn: (s: State) => T | Promise<T>,
  expected?: number,
): Promise<T> {
  if (demoEnabled()) {
    const id = await sessionId();
    const locks = (globalStore.facultyLocks ??= new Map());
    const prev = locks.get(id) || Promise.resolve();
    const operation = prev
      .catch(() => {})
      .then(async () => {
        const state = await loadState();
        if (expected !== undefined)
          assert(
            state.revision === expected,
            "Workspace changed. Refresh and try again.",
            409,
          );
        const result = await fn(state);
        sessions().set(id, { state, touched: Date.now() });
        return result;
      });
    locks.set(id, operation);
    try {
      return await operation;
    } finally {
      if (locks.get(id) === operation) locks.delete(id);
    }
  }
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(campus)
      .where(eq(campus.id, "main"))
      .for("update");
    assert(row, "Database is not initialized", 503);
    if (expected !== undefined)
      assert(
        row.revision === expected,
        "Workspace changed. Refresh and try again.",
        409,
      );
    const s = emptyState();
    s.settings = row.settings;
    s.revision = row.revision;
    for (const [key, table] of Object.entries(tables)) {
      const rows = await tx.select().from(table);
      (s as unknown as Record<string, unknown>)[key] = rows.map((r) => r.data);
    }
    const before = structuredClone(s);
    const result = await fn(s);
    // Single campus lock serializes publications and acceptances. Database indexes
    // independently reject competing resource claims, even from future writers.
    const occurrenceChanged =
      JSON.stringify(before.occurrences) !== JSON.stringify(s.occurrences) ||
      JSON.stringify(before.coverage) !== JSON.stringify(s.coverage);
    const oldOccurrences = new Map(
      before.occurrences.map((o) => [o.id, JSON.stringify(o)]),
    );
    const newOccurrences = new Map(
      s.occurrences.map((o) => [o.id, JSON.stringify(o)]),
    );
    const coverageByOccurrence = (list: State["coverage"]) => {
      const result = new Map<string, string>();
      for (const c of list)
        result.set(
          c.occurrenceId,
          (result.get(c.occurrenceId) || "") + JSON.stringify(c),
        );
      return result;
    };
    const oldCoverage = coverageByOccurrence(before.coverage),
      newCoverage = coverageByOccurrence(s.coverage);
    const changedIds = new Set(
      occurrenceChanged
        ? [
            ...new Set([...oldOccurrences.keys(), ...newOccurrences.keys()]),
          ].filter(
            (id) =>
              oldOccurrences.get(id) !== newOccurrences.get(id) ||
              oldCoverage.get(id) !== newCoverage.get(id),
          )
        : [],
    );
    if (occurrenceChanged && changedIds.size)
      await tx
        .delete(occupancy)
        .where(inArray(occupancy.occurrenceId, [...changedIds]));
    for (const [key, table] of Object.entries(tables)) {
      const old = before[key as keyof typeof tables] as { id: string }[];
      const current = s[key as keyof typeof tables] as { id: string }[];
      const oldMap = new Map(old.map((x) => [x.id, JSON.stringify(x)]));
      const ids = new Set(current.map((x) => x.id));
      const removed = old.filter((x) => !ids.has(x.id)).map((x) => x.id);
      if (removed.length)
        await tx.delete(table).where(inArray(table.id, removed));
      const changed = current.filter(
        (x) => oldMap.get(x.id) !== JSON.stringify(x),
      );
      for (const item of changed)
        await tx
          .insert(table)
          .values({ id: item.id, data: item as never })
          .onConflictDoUpdate({
            target: table.id,
            set: { data: item as never },
          });
    }
    if (occurrenceChanged) {
      const claims = s.occurrences
        .filter((o) => changedIds.has(o.id))
        .flatMap((o) =>
          occupied(o.period, o.duration).map((period) => ({
            occurrenceId: o.id,
            date: o.date,
            period,
            facultyId: s.coverage.some(
              (c) => c.occurrenceId === o.id && c.status !== "covered",
            )
              ? null
              : o.facultyId,
            sectionId: o.sectionId,
            roomId: o.roomId,
          })),
        );
      for (let i = 0; i < claims.length; i += 1000)
        await tx.insert(occupancy).values(claims.slice(i, i + 1000));
    }
    await tx
      .update(campus)
      .set({ revision: s.revision, settings: s.settings })
      .where(and(eq(campus.id, "main")));
    return result;
  });
}
