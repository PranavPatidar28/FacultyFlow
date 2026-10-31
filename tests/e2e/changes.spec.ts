import { test, expect, type Page } from "@playwright/test";
import type { AppData } from "../../src/lib/types";
import type { Action } from "../../src/lib/validation";
async function state(page: Page): Promise<AppData> {
  return (await page.request.get("/api/state")).json();
}
async function act(page: Page, action: Action) {
  const s = await state(page);
  const response = await page.request.post("/api/actions", {
    data: { revision: s.revision, action },
  });
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body;
}
test.beforeEach(async ({ page }) => {
  await page.goto("/api/demo");
  await expect(
    page.getByRole("heading", { name: "Campus overview." }),
  ).toBeVisible();
});
test("room closure report, minimal room repair, atomic application and mobile review", async ({
  page,
}) => {
  const initial = await state(page);
  const o = initial.occurrences.find(
    (o) =>
      o.date > initial.settings.start &&
      initial.sections.find((s) => s.id === o.sectionId)?.departmentId ===
        "cse" &&
      !initial.coverage.some((c) => c.occurrenceId === o.id),
  )!;
  await page.getByLabel("Demo role").selectOption("coordinator");
  await page.getByRole("link", { name: /Daily Change Desk/ }).click();
  await page.getByRole("button", { name: "Report room closure" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Room", { exact: true }).selectOption(o.roomId);
  await dialog.getByLabel("Date", { exact: true }).fill(o.date);
  await dialog
    .getByRole("checkbox")
    .nth(
      initial.settings.periods
        .filter((p) => !p.break)
        .findIndex((p) => p.id === o.period),
    )
    .check();
  await dialog.getByLabel("Reason").fill("Synthetic maintenance scenario");
  await dialog.getByRole("button", { name: "Submit report" }).click();
  await expect(
    page.getByText("Awaiting campus administrator confirmation"),
  ).toBeVisible();
  await page.getByLabel("Demo role").selectOption("admin");
  await page.getByRole("link", { name: /Daily Change Desk/ }).click();
  await page
    .getByRole("button", { name: "Confirm closure", exact: true })
    .click();
  const closure = (await state(page)).roomClosures.find(
    (c) => c.reason === "Synthetic maintenance scenario",
  )!;
  const result = await act(page, {
    type: "repair-request",
    key: crypto.randomUUID(),
    trigger: "closure",
    triggerId: closure.id,
    departmentIds: ["cse"],
  });
  await page.reload();
  await page.getByRole("button", { name: "Review repair" }).first().click();
  await expect(
    page.getByRole("dialog").getByText("Ready to apply", { exact: true }),
  ).toBeVisible();
  const ready = await state(page);
  const plan = ready.repairPlans.find((p) => p.id === result.planId)!;
  expect(plan.impact.timeChanges).toBe(0);
  const before = structuredClone(ready.versions);
  await page.getByRole("button", { name: "Apply repair" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const after = await state(page);
  expect(after.repairPlans.find((p) => p.id === result.planId)?.status).toBe(
    "applied",
  );
  expect(after.versions).toEqual(before);
  for (const c of plan.changes)
    expect(after.occurrences.find((o) => o.id === c.occurrenceId)?.roomId).toBe(
      c.after.roomId,
    );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/change-desk-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("partial absence repair needs faculty acceptance and coordinator application", async ({
  page,
}) => {
  const initial = await state(page),
    coverage = initial.coverage[0],
    absence = initial.absences.find((a) => a.id === coverage.absenceId)!,
    o = initial.occurrences.find((o) => o.id === coverage.occurrenceId)!;
  const dep = initial.sections.find((s) => s.id === o.sectionId)!.departmentId;
  await page.getByRole("link", { name: /Daily Change Desk/ }).click();
  await page.getByRole("button", { name: "Find a repair" }).first().click();
  await page.getByRole("button", { name: "Generate repair proposal" }).click();
  await expect(
    page.getByRole("dialog").getByText("Awaiting faculty", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  const proposed = await state(page),
    plan = proposed.repairPlans.at(-1)!;
  expect(proposed.occurrences.find((x) => x.id === o.id)?.period).toBe(
    o.period,
  );
  const originalVersion = structuredClone(proposed.versions);
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const consent of proposed.repairConsents.filter(
    (c) => c.planId === plan.id,
  )) {
    await page.getByLabel("Demo role").selectOption(`m-${consent.facultyId}`);
    await page.getByRole("link", { name: "Inbox", exact: true }).click();
    await page.getByRole("button", { name: "Review repair" }).click();
    await page.getByRole("button", { name: "Accept time changes" }).click();
    await expect(
      page.getByRole("dialog").getByText("accepted", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
  const accepted = await state(page);
  expect(accepted.occurrences.find((x) => x.id === o.id)?.period).toBe(
    o.period,
  );
  await page.getByLabel("Demo role").selectOption("admin");
  await page.getByRole("link", { name: /Daily Change Desk/ }).click();
  await page.getByRole("button", { name: "Review repair" }).click();
  await page.getByRole("button", { name: "Apply repair" }).click();
  const applied = await state(page);
  expect(applied.repairPlans.find((p) => p.id === plan.id)?.status).toBe(
    "applied",
  );
  expect(applied.versions).toEqual(originalVersion);
  expect(
    applied.coverage.some(
      (c) => c.absenceId === absence.id && c.occurrenceId === o.id,
    ),
  ).toBe(false);
  expect(
    applied.repairRequests.find((r) => r.id === plan.requestId)?.departmentIds,
  ).toContain(dep);
  await page.screenshot({
    path: "test-results/change-desk-desktop.png",
    fullPage: true,
  });
});
test("simultaneous repair applications apply once", async ({ page }) => {
  const initial = await state(page);
  const o = initial.occurrences.find(
    (o) =>
      o.date > initial.settings.start &&
      !initial.coverage.some((c) => c.occurrenceId === o.id),
  )!;
  const c = await act(page, {
    type: "closure-create",
    roomId: o.roomId,
    date: o.date,
    periods: [o.period],
    reason: "Concurrency fixture",
  });
  const result = await act(page, {
    type: "repair-request",
    key: crypto.randomUUID(),
    trigger: "closure",
    triggerId: c.closureId,
    departmentIds: [
      initial.sections.find((s) => s.id === o.sectionId)!.departmentId,
    ],
  });
  const ready = await state(page);
  expect(ready.repairPlans.find((p) => p.id === result.planId)?.status).toBe(
    "ready",
  );
  const payload = {
    revision: ready.revision,
    action: { type: "repair-apply", planId: result.planId },
  };
  const responses = await Promise.all([
    page.request.post("/api/actions", { data: payload }),
    page.request.post("/api/actions", { data: payload }),
  ]);
  expect(responses.every((r) => r.ok())).toBe(true);
  const end = await state(page);
  const plan = end.repairPlans.find((p) => p.id === result.planId)!;
  expect(plan.status).toBe("applied");
  expect(
    end.notifications
      .filter((n) => n.id.startsWith(`${plan.id}-applied`))
      .map((n) => n.id).length,
  ).toBe(
    new Set(
      end.notifications
        .filter((n) => n.id.startsWith(`${plan.id}-applied`))
        .map((n) => n.id),
    ).size,
  );
});
