import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const database = new PGlite();
beforeAll(async () => {
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await database.exec(readFileSync(`drizzle/${file}`, "utf8"));
  await database.query(
    "INSERT INTO occurrences(id,data) VALUES ('o1','{}'),('o2','{}'),('o3','{}')",
  );
}, 30000);
afterAll(() => database.close());
describe("Postgres migration invariants", () => {
  it("adds Daily Change Desk tables without rewriting existing occurrences or claims", async () => {
    const legacy = new PGlite();
    try {
      const files = readdirSync("drizzle")
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const file of files.filter((f) => !f.startsWith("0002_")))
        await legacy.exec(readFileSync(`drizzle/${file}`, "utf8"));
      await legacy.query(
        'INSERT INTO occurrences VALUES (\'legacy\', \'{"date":"2030-01-07","period":0}\')',
      );
      await legacy.query(
        "INSERT INTO occupancy VALUES ('legacy','2030-01-07',0,'f1','s1','r1')",
      );
      for (const file of files.filter((f) => f.startsWith("0002_")))
        await legacy.exec(readFileSync(`drizzle/${file}`, "utf8"));
      expect(
        (
          await legacy.query<{ data: { period: number } }>(
            "SELECT data FROM occurrences WHERE id='legacy'",
          )
        ).rows[0].data.period,
      ).toBe(0);
      expect(
        (
          await legacy.query(
            "SELECT * FROM occupancy WHERE \"occurrenceId\"='legacy'",
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (await legacy.query("SELECT * FROM repair_plans")).rows,
      ).toHaveLength(0);
    } finally {
      await legacy.close();
    }
  }, 10000);
  it("releases all old repair claims before a chain swap and rolls back the entire repair on conflict", async () => {
    await database.query(
      "INSERT INTO occurrences VALUES ('swap1','{}'),('swap2','{}')",
    );
    await database.query(
      "INSERT INTO occupancy VALUES ('swap1','2030-01-08',0,'f4','s4','r4'),('swap2','2030-01-08',1,'f4','s4','r4')",
    );
    await database.query(
      'INSERT INTO repair_plans VALUES (\'swap-plan\',\'{"key":"swap","status":"ready"}\')',
    );
    await database.transaction(async (tx) => {
      await tx.query(
        "DELETE FROM occupancy WHERE \"occurrenceId\" IN ('swap1','swap2')",
      );
      await tx.query(
        "INSERT INTO occupancy VALUES ('swap1','2030-01-08',1,'f4','s4','r4'),('swap2','2030-01-08',0,'f4','s4','r4')",
      );
    });
    expect(
      (
        await database.query<{ period: number }>(
          "SELECT period FROM occupancy WHERE \"occurrenceId\"='swap1'",
        )
      ).rows[0].period,
    ).toBe(1);
    await expect(
      database.transaction(async (tx) => {
        await tx.query(
          "UPDATE repair_plans SET data=data || '{\"status\":\"applied\"}'::jsonb WHERE id='swap-plan'",
        );
        await tx.query("DELETE FROM occupancy WHERE \"occurrenceId\"='swap1'");
        await tx.query(
          "UPDATE occurrences SET data='{\"changed\":true}' WHERE id='swap1'",
        );
        await tx.query(
          "INSERT INTO occupancy VALUES ('swap1','2030-01-08',0,'f4','s4','r4')",
        );
      }),
    ).rejects.toThrow();
    expect(
      (
        await database.query<{ data: { status: string } }>(
          "SELECT data FROM repair_plans WHERE id='swap-plan'",
        )
      ).rows[0].data.status,
    ).toBe("ready");
    expect(
      (
        await database.query<{ data: object }>(
          "SELECT data FROM occurrences WHERE id='swap1'",
        )
      ).rows[0].data,
    ).toEqual({});
    expect(
      (
        await database.query<{ period: number }>(
          "SELECT period FROM occupancy WHERE \"occurrenceId\"='swap1'",
        )
      ).rows[0].period,
    ).toBe(1);
  });
  it("rejects overlapping faculty occupancy independently of application logic", async () => {
    await database.query(
      "INSERT INTO occupancy VALUES ('o1','2026-11-02',0,'f1','s1','r1')",
    );
    await expect(
      database.query(
        "INSERT INTO occupancy VALUES ('o2','2026-11-02',0,'f1','s2','r2')",
      ),
    ).rejects.toThrow();
  });
  it("rejects shared room and section clashes", async () => {
    await expect(
      database.query(
        "INSERT INTO occupancy VALUES ('o2','2026-11-02',0,'f2','s2','r1')",
      ),
    ).rejects.toThrow();
    await expect(
      database.query(
        "INSERT INTO occupancy VALUES ('o2','2026-11-02',0,'f2','s1','r2')",
      ),
    ).rejects.toThrow();
  });
  it("permits vacant faculty occupancy while preserving room/section reservations", async () => {
    await database.query(
      "INSERT INTO occupancy VALUES ('o2','2026-11-02',1,NULL,'s2','r2')",
    );
    await database.query(
      "INSERT INTO occupancy VALUES ('o3','2026-11-02',1,NULL,'s3','r3')",
    );
    const result = await database.query(
      'SELECT * FROM occupancy WHERE "facultyId" IS NULL',
    );
    expect(result.rows).toHaveLength(2);
  });
  it("allows only one pending offer per coverage task", async () => {
    await database.query("INSERT INTO offers VALUES ('offer1', $1::jsonb)", [
      JSON.stringify({ coverageId: "cover1", status: "pending" }),
    ]);
    await expect(
      database.query("INSERT INTO offers VALUES ('offer2', $1::jsonb)", [
        JSON.stringify({ coverageId: "cover1", status: "pending" }),
      ]),
    ).rejects.toThrow();
    await database.query(
      "UPDATE offers SET data=data || '{\"status\":\"declined\"}'::jsonb WHERE id='offer1'",
    );
    await database.query("INSERT INTO offers VALUES ('offer2', $1::jsonb)", [
      JSON.stringify({ coverageId: "cover1", status: "pending" }),
    ]);
  });
  it("enforces case-insensitive invitation emails and job idempotency", async () => {
    await database.query("INSERT INTO members VALUES ('m1', $1::jsonb)", [
      JSON.stringify({ email: "Faculty@College.example" }),
    ]);
    await expect(
      database.query("INSERT INTO members VALUES ('m2', $1::jsonb)", [
        JSON.stringify({ email: "faculty@college.example" }),
      ]),
    ).rejects.toThrow();
    await database.query(
      "INSERT INTO jobs VALUES ('j1', '{\"key\":\"repeat\"}')",
    );
    await expect(
      database.query("INSERT INTO jobs VALUES ('j2', '{\"key\":\"repeat\"}')"),
    ).rejects.toThrow();
  });
  it("rolls back all resource changes when an acceptance conflicts", async () => {
    await expect(
      database.transaction(async (tx) => {
        await tx.query(
          "UPDATE occupancy SET \"facultyId\"='f3' WHERE \"occurrenceId\"='o1'",
        );
        await tx.query(
          "INSERT INTO occupancy VALUES ('o3','2026-11-02',0,'f3','s3','r3')",
        );
      }),
    ).rejects.toThrow();
    const result = await database.query<{ facultyId: string }>(
      'SELECT "facultyId" FROM occupancy WHERE "occurrenceId"=\'o1\'',
    );
    expect(result.rows[0].facultyId).toBe("f1");
  });
});
