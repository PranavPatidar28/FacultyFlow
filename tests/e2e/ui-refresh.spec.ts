import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/api/demo");
  await expect(
    page.getByRole("heading", { name: "Campus overview." }),
  ).toBeVisible();
});

test("navigation preserves the shell and does not refetch workspace state", async ({
  page,
}) => {
  await page
    .locator(".sidebar")
    .evaluate((el) => el.setAttribute("data-persistent", "yes"));
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/state")) requests.push(request.url());
  });
  await page
    .getByRole("link", { name: "Timetable", exact: true })
    .first()
    .click();
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveAttribute(
    "data-persistent",
    "yes",
  );
  await page
    .getByRole("link", { name: "Faculty directory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Faculty directory." }),
  ).toBeVisible();
  expect(requests).toHaveLength(0);
});

test("generation dialog has an accessible name and restores focus", async ({
  page,
}) => {
  const trigger = page.getByRole("button", {
    name: "Generate timetable",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("dialog", { name: "Generate timetable" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("all workspace pages fit mobile and tablet with readable text", async ({
  page,
}) => {
  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/",
      "/timetable",
      "/changes",
      "/faculty",
      "/academics",
      "/availability",
      "/inbox",
      "/settings",
    ]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(
        page.getByRole("status", { name: "Loading workspace" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
      expect(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe("16px");
    }
  }
});

test("initial failure can be retried and concurrent refreshes are deduplicated", async ({
  page,
}) => {
  let fail = true;
  let requests = 0;
  await page.route("**/api/state", async (route) => {
    requests++;
    if (fail)
      await route.fulfill({
        status: 503,
        json: { error: "Connection unavailable" },
      });
    else {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue();
    }
  });
  await page.reload();
  await expect(page.locator(".boot-screen [role=alert]")).toHaveText(
    "Connection unavailable",
  );
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("main h1")).toBeVisible();
  expect(requests).toBe(2);
});

test("faculty search updates on the same page and filters remain usable", async ({
  page,
}) => {
  await page
    .getByRole("link", { name: "Faculty directory", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search faculty directory" })
    .fill("Ananya");
  await expect(page.locator(".faculty-table tbody tr")).toHaveCount(1);
  const globalSearch = page.getByRole("textbox", {
    name: "Search faculty",
    exact: true,
  });
  await globalSearch.fill("Rohan");
  await page.locator(".search-results").getByRole("link").first().click();
  await expect(
    page.getByRole("textbox", { name: "Search faculty directory" }),
  ).toHaveValue("Dr. Rohan Mehta");
  await expect(page.locator(".faculty-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit Dr. Rohan Mehta" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit faculty member" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("mobile navigation supports Escape and keeps hidden links out of keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await expect(
    page.getByRole("link", { name: "Faculty directory", exact: true }),
  ).not.toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("link", { name: /Faculty\s*Flow/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("draft assignments can be reviewed and locked", async ({ page }) => {
  await page
    .getByRole("link", { name: "Timetable", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Create revision" }).click();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await page.locator(".class-block").first().click();
  const dialog = page.getByRole("dialog", { name: "Adjust this assignment" });
  await dialog.getByLabel("Lock this assignment during regeneration").check();
  await dialog.getByRole("button", { name: "Save assignment" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator(".class-block").first().click();
  await expect(
    dialog.getByLabel("Lock this assignment during regeneration"),
  ).toBeChecked();
});
