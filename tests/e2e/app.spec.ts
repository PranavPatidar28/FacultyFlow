import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/api/demo");
  await expect(
    page.getByRole("heading", { name: "Campus overview." }),
  ).toBeVisible();
});
test("dashboard and responsive navigation", async ({ page }) => {
  await expect(
    page.getByText("Faculty members", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Timetable", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.screenshot({
    path: "test-results/timetable-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Campus overview." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("link", { name: "Faculty directory" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
});
test("coordinator offers qualified cover and faculty accepts", async ({
  page,
}) => {
  await page
    .getByRole("link", { name: /Daily Change Desk/ })
    .first()
    .click();
  await page.getByRole("button", { name: "View suggestions" }).first().click();
  await expect(
    page.getByText("Approved subject qualification").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send offer" }).first().click();
  await expect(
    page.getByText("Awaiting acceptance", { exact: true }),
  ).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  const offer = state.offers.find(
    (o: { status: string }) => o.status === "pending",
  );
  await page.getByLabel("Demo role").selectOption(`m-${offer.facultyId}`);
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.getByRole("button", { name: "Accept offer" }).click();
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();
  const confirmed = await (await page.request.get("/api/state")).json();
  expect(
    confirmed.coverage.find((c: { id: string }) => c.id === offer.coverageId)
      .status,
  ).toBe("covered");
});
test("concurrent offers serialize and stale revisions fail", async ({
  page,
}) => {
  const state = await (await page.request.get("/api/state")).json();
  const c = state.coverage[0],
    f = state.candidates[c.id][0];
  const payload = {
    revision: state.revision,
    action: { type: "offer", coverageId: c.id, facultyId: f.facultyId },
  };
  const responses = await Promise.all([
    page.request.post("/api/actions", { data: payload }),
    page.request.post("/api/actions", { data: payload }),
  ]);
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
});
test("real solver generation creates a validated draft and publishes", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Generate timetable", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate a draft" }).click();
  await expect(page.getByRole("heading", { name: "Timetable." })).toBeVisible({
    timeout: 165000,
  });
  await expect(page.getByText(/^(optimal|feasible)$/)).toBeVisible();
  await page.getByRole("button", { name: "Publish timetable" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Publish timetable" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("published", { exact: true })).toBeVisible();
});
test("invalid CSV stays in preview without saving", async ({ page }) => {
  await page.getByRole("link", { name: "Faculty directory" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("CSV file").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,email\nMissing limits,not-an-email"),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Row 2",
  );
  await expect(
    page.getByRole("button", { name: /Import 0 records/ }),
  ).toBeDisabled();
});

test("faculty requests an absence and coordinator approves coverage", async ({
  page,
}) => {
  const initial = await (await page.request.get("/api/state")).json();
  const occurrence = initial.occurrences.find(
    (o: { facultyId: string; date: string }) =>
      o.facultyId === "f1" &&
      o.date > initial.settings.start &&
      !initial.absences.some(
        (a: { facultyId: string; date: string }) =>
          a.facultyId === "f1" && a.date === o.date,
      ),
  );
  await page.getByLabel("Demo role").selectOption("m-f1");
  await page.getByRole("link", { name: "My availability" }).click();
  await page.getByRole("button", { name: "Request absence" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Date", { exact: true })
    .fill(occurrence.date);
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("Personal appointment");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();
  await page.getByLabel("Demo role").selectOption("coordinator");
  await page
    .getByRole("link", { name: /Daily Change Desk/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Absence requests/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const state = await (await page.request.get("/api/state")).json();
  const absence = state.absences.find(
    (a: { reason: string }) => a.reason === "Personal appointment",
  );
  expect(absence.status).toBe("approved");
  expect(
    state.coverage.some(
      (c: { absenceId: string }) => c.absenceId === absence.id,
    ),
  ).toBe(true);
});
