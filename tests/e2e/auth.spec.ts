import { test, expect } from "@playwright/test";

test("password recovery validates confirmation and handles expired codes", async ({
  page,
}) => {
  let resets = 0;
  await page.route("**/api/auth/forget-password/email-otp", (route) =>
    route.fulfill({ json: { success: true } }),
  );
  await page.route("**/api/auth/email-otp/reset-password", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      email: "reset@facultyflow.invalid",
      otp: "123456",
      password: "NewFixturePassword123!",
    });
    resets++;
    await route.fulfill(
      resets === 1
        ? {
            status: 400,
            json: {
              code: "OTP_EXPIRED",
              message: "Code expired. Request another code.",
            },
          }
        : { json: { success: true } },
    );
  });
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Set or reset password", exact: true })
    .click();
  await page.getByLabel("College email").fill("reset@facultyflow.invalid");
  await page
    .getByRole("button", { name: "Send password reset code", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose your password" }),
  ).toBeVisible();
  await page.getByLabel("Verification code").fill("123456");
  await page
    .getByLabel("Password", { exact: true })
    .fill("NewFixturePassword123!");
  await page.getByLabel("Confirm password").fill("DifferentPassword123!");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Passwords must match",
  );
  expect(resets).toBe(0);
  await page.getByLabel("Confirm password").fill("NewFixturePassword123!");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Code expired",
  );
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Password saved");
  expect(resets).toBe(2);
});

test("signup requests an email code and permits retry after a delivery failure", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/auth/sign-up/email", (route) =>
    route.fulfill({ json: { user: { id: "verification-fixture" } } }),
  );
  await page.route(
    "**/api/auth/email-otp/send-verification-otp",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        email: "verification@facultyflow.invalid",
        type: "email-verification",
      });
      requests++;
      await route.fulfill(
        requests === 1
          ? {
              status: 429,
              json: { code: "RATE_LIMITED", message: "Try again shortly" },
            }
          : { json: { success: true } },
      );
    },
  );
  await page.goto("/login");
  await page
    .getByRole("button", {
      name: "Invited for the first time? Create an account",
    })
    .click();
  await page.getByLabel("Full name").fill("Verification Fixture");
  await page
    .getByLabel("College email")
    .fill("verification@facultyflow.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("FixturePassword123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Try again shortly",
  );
  await expect(page.getByLabel("College email")).toHaveValue(
    "verification@facultyflow.invalid",
  );
  await page
    .getByRole("button", { name: "Send another verification code" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "A verification code has been sent",
  );
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  expect(requests).toBe(2);
});
