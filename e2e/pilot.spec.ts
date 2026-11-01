import { expect, test } from "@playwright/test";

test("the queue lists the claims and a claim opens", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(25);
  await page.getByRole("link", { name: "CLM-1013" }).click();
  await expect(page.getByRole("heading", { name: "CLM-1013" })).toBeVisible();
  await expect(page.getByText("No decision yet.")).toBeVisible();
});

test("the agent runs on a waiting claim and its steps appear", async ({
  page,
}) => {
  await page.goto("/#/claims/CLM-1013");
  await page.getByRole("button", { name: "Run agent" }).click();
  await expect(
    page.locator("dd", { hasText: "Declined by the stand-in model." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Run agent" })).toHaveCount(0);
  await expect(page.locator("ol.steps li").last()).toContainText(
    "Declined CLM-1013.",
  );
});

test("a payout over the limit waits for a handler's sign-off", async ({
  page,
  request,
}) => {
  await request.post("/api/claims/CLM-1003/start");
  await request.post("/api/claims/CLM-1003/decision", {
    data: {
      decision: "approve",
      payout: 3000,
      reason: "The treatment is covered.",
      policy_section: "7. Emergency Medical",
    },
  });
  const blocked = await request.post("/api/claims/CLM-1003/payment", {
    data: { amount: 3000 },
  });
  expect(blocked.status()).toBe(409);

  await page.goto("/#/claims/CLM-1003");
  await expect(page.getByText("Waiting for sign-off")).toBeVisible();
  await page
    .getByRole("button", { name: "Sign off and pay $3,000.00" })
    .click();
  await expect(
    page.getByRole("button", { name: /Sign off and pay/ }),
  ).toHaveCount(0);
  await expect(page.locator("dd", { hasText: "$3,000.00" })).toHaveCount(2);
});

test("the agent runs on every waiting claim from the queue", async ({
  page,
}) => {
  await page.goto("/");
  const runAll = page.getByRole("button", {
    name: /Run agent on all waiting claims/,
  });
  await runAll.click();
  await expect(page.locator(".badge-waiting")).toHaveCount(0, {
    timeout: 120000,
  });
  await expect(runAll).toBeDisabled();
});
