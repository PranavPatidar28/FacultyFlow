import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/db";
import { campus, tables, occupancy } from "../src/db/schema";
import { demoState, emptyState } from "../src/lib/seed";
import { occupied } from "../src/lib/time";
const database = db();
const existing = await database.select().from(campus);
if (existing.length) throw new Error("Seed refused: campus already exists");
const state = process.env.SEED_DEMO === "true" ? demoState() : emptyState();
if (process.env.SEED_DEMO === "true" && process.env.BOOTSTRAP_ADMIN_EMAIL) {
  const admin = state.members.find((m) => m.role === "admin");
  if (admin) admin.email = process.env.BOOTSTRAP_ADMIN_EMAIL;
}
if (!state.members.length) {
  if (!process.env.BOOTSTRAP_ADMIN_EMAIL)
    throw new Error("Set BOOTSTRAP_ADMIN_EMAIL");
  state.members.push({
    id: crypto.randomUUID(),
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    name: process.env.BOOTSTRAP_ADMIN_NAME || "Administrator",
    role: "admin",
    departmentId: "",
  });
}
await database.transaction(async (tx) => {
  await tx
    .insert(campus)
    .values({ id: "main", revision: state.revision, settings: state.settings });
  for (const [key, table] of Object.entries(tables)) {
    const values = (state[key as keyof typeof tables] as { id: string }[]).map(
      (row) => ({ id: row.id, data: row as never }),
    );
    for (let i = 0; i < values.length; i += 300)
      await tx.insert(table).values(values.slice(i, i + 300));
  }
  const claims = state.occurrences.flatMap((o) =>
    occupied(o.period, o.duration).map((period) => ({
      occurrenceId: o.id,
      date: o.date,
      period,
      facultyId: state.coverage.some(
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
});
console.log("Campus initialized.");
process.exit(0);
