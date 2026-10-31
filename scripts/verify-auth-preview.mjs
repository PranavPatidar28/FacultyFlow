/** Synthetic, local-only integration check against an explicitly isolated Neon database.
 * Email delivery is not exercised: only @facultyflow.invalid fixtures are marked verified.
 */
import { chromium, request } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const baseURL = process.env.PREVIEW_BASE_URL || "http://localhost:3001";
if (
  process.env.PREVIEW_QA_ALLOW !== "true" ||
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
)
  throw new Error("Explicit local preview QA opt-in is required");
const sql = neon(process.env.DATABASE_URL);
const [db] = await sql.query("select current_database() as name");
if (db.name !== "facultyflow_preview")
  throw new Error("Preview database guard failed");
await mkdir(".local", { recursive: true });
let credentials;
try {
  credentials = JSON.parse(
    await readFile(".local/auth-qa-credentials.json", "utf8"),
  );
} catch {
  credentials = {
    email: "preview-admin@facultyflow.invalid",
    password: randomBytes(24).toString("base64url") + "Aa1!",
    suffix: randomBytes(4).toString("hex"),
  };
  await writeFile(
    ".local/auth-qa-credentials.json",
    JSON.stringify(credentials),
    { mode: 0o600 },
  );
}
async function account(email, password) {
  if (!email.endsWith("@facultyflow.invalid"))
    throw new Error("Only synthetic fixture emails are allowed");
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const response = await api.post("/api/auth/sign-up/email", {
    data: { name: "Synthetic Preview QA", email, password },
  });
  if (!response.ok() && response.status() !== 400 && response.status() !== 422)
    throw new Error(`Fixture sign-up returned ${response.status()}`);
  const changed = await sql.query(
    'UPDATE neon_auth."user" SET "emailVerified"=true WHERE email=$1 RETURNING id',
    [email],
  );
  if (changed.length !== 1)
    throw new Error(
      `Fixture account not available after sign-up (${response.status()})`,
    );
  await api.dispose();
}
await account(credentials.email, credentials.password);
const browser = await chromium.launch();
const contexts = [];
async function login(email, password) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("College email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Campus overview." })
    .waitFor({ timeout: 30000 });
  if (await page.getByLabel("Demo role").count())
    throw new Error("Authenticated check unexpectedly entered demo mode");
  return page;
}
async function state(page) {
  const response = await page.request.get("/api/state");
  if (!response.ok())
    throw new Error(`Authenticated state returned ${response.status()}`);
  return response.json();
}
async function act(page, action) {
  const current = await state(page);
  const response = await page.request.post("/api/actions", {
    data: { action, revision: current.revision },
  });
  const result = await response.json();
  if (!response.ok())
    throw new Error(
      `Action ${action.type} returned ${response.status()}: ${result.error}`,
    );
  return result;
}
const results = [];
try {
  const admin = await login(credentials.email, credentials.password);
  results.push(
    "Managed Auth sign-in through the browser and invited admin access",
  );
  const initial = await state(admin);
  const coverage = initial.coverage.find((c) => c.status === "uncovered");
  if (!coverage)
    throw new Error("Preview needs one synthetic uncovered absence");
  const absence = initial.absences.find((a) => a.id === coverage.absenceId);
  const o = initial.occurrences.find((o) => o.id === coverage.occurrenceId);
  const result = await act(admin, {
    type: "repair-request",
    key: crypto.randomUUID(),
    trigger: "absence",
    triggerId: absence.id,
    departmentIds: [
      initial.sections.find((s) => s.id === o.sectionId).departmentId,
    ],
  });
  let ready;
  for (let n = 0; n < 50; n++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ready = await state(admin);
    const status = ready.repairPlans.find(
      (p) => p.id === result.planId,
    )?.status;
    if (!["queued", "running"].includes(status)) break;
  }
  const plan = ready.repairPlans.find((p) => p.id === result.planId);
  if (plan.status !== "awaiting-consent")
    throw new Error(
      `Workflow returned ${plan.status}: ${plan.error || plan.diagnostics.join(" ")}`,
    );
  results.push(
    "Durable Workflow generated a real solver proposal against isolated Neon records",
  );
  for (const consent of ready.repairConsents.filter(
    (c) => c.planId === plan.id,
  )) {
    const email = `repair-${credentials.suffix}-${consent.facultyId}@facultyflow.invalid`,
      password = credentials.password;
    await account(email, password);
    const f = ready.faculty.find((f) => f.id === consent.facultyId);
    await act(admin, {
      type: "upsert",
      collection: "members",
      records: [
        {
          id: `qa-${credentials.suffix}-${f.id}`,
          name: "Synthetic Preview Faculty",
          email,
          role: "faculty",
          departmentId: f.departmentId,
          facultyId: f.id,
        },
      ],
    });
    const faculty = await login(email, password);
    const forbidden = await faculty.request.post("/api/actions", {
      data: {
        revision: (await state(faculty)).revision,
        action: {
          type: "closure-create",
          roomId: ready.rooms[0].id,
          date: o.date,
          periods: [0],
          reason: "Permission test",
        },
      },
    });
    if (forbidden.status() !== 403)
      throw new Error("Faculty administration permission was not rejected");
    await act(faculty, {
      type: "repair-consent",
      planId: plan.id,
      decision: "accepted",
    });
  }
  const accepted = await state(admin);
  if (accepted.occurrences.find((x) => x.id === o.id).period !== o.period)
    throw new Error("Consent changed bookings before application");
  await act(admin, { type: "repair-apply", planId: plan.id });
  const end = await state(admin);
  if (end.repairPlans.find((p) => p.id === plan.id).status !== "applied")
    throw new Error("Repair was not applied");
  results.push(
    "Faculty access boundaries, consent, and coordinator application persisted through Neon transactions",
  );
  for (const change of plan.changes) {
    const claims = await sql.query(
      'SELECT period,"roomId","facultyId" FROM occupancy WHERE "occurrenceId"=$1',
      [change.occurrenceId],
    );
    if (
      !claims.some(
        (c) =>
          c.period === change.after.period &&
          c.roomId === change.after.roomId &&
          c.facultyId === change.after.facultyId,
      )
    )
      throw new Error("Dated agenda and occupancy disagree");
  }
  results.push("Dated agenda and database occupancy agree after application");
  await admin.getByRole("button", { name: "Sign out", exact: true }).click();
  await admin
    .getByRole("heading", { name: "Welcome back" })
    .waitFor({ timeout: 15000 });
  if ((await admin.request.get("/api/state")).status() !== 401)
    throw new Error("Signed-out state was not protected");
  results.push("Sign-out revokes app access");
  await writeFile(
    ".local/auth-preview-verification.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        database: db.name,
        results,
        emailDeliveryVerified: false,
        cloudDeploymentVerified: false,
      },
      null,
      2,
    ),
  );
  for (const result of results) console.log(`PASS: ${result}`);
  console.log(
    "Email delivery and Vercel hosting were not verified by this local-only check.",
  );
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
