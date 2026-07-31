import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Journey A - shipment booking draft restore and submit", async ({ page }) => {
  await page.getByLabel("Customer").selectOption("acme");
  await page.getByLabel("Booking reference").fill("BK-1234");
  await page.getByRole("button", { name: "Route" }).click();
  await page.getByLabel("Port of loading").selectOption("CNSHA");
  await page.getByLabel("Port of discharge").selectOption("IRBND");
  await expect(page.getByLabel("Voyage")).toContainText("VOY-881");
  await page.getByLabel("Voyage").selectOption("VOY-881");
  await page.getByRole("button", { name: "Cargo" }).click();
  await page.getByLabel("Cargo type").selectOption("dangerous-goods");
  await expect(page.getByLabel("UN number")).toBeVisible();
  await page.getByLabel("UN number").fill("UN 1203");
  await page.getByRole("button", { name: "Add item" }).click();
  const item = page.locator(".af-repeat-item").first();
  await item.locator("label").filter({ hasText: "Type" }).locator("input").fill("40HC");
  await item.locator("label").filter({ hasText: "Quantity" }).locator("input").fill("1");
  await item.locator("label").filter({ hasText: "Weight" }).locator("input").fill("1200");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Booking reference")).toHaveValue("BK-1234");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Submission: succeeded")).toBeVisible();
});

test("Journey B - conflict preserves user values", async ({ page }) => {
  await page.getByLabel("Customer").selectOption("acme");
  await page.getByLabel("Booking reference").fill("BK-4090");
  await page.getByRole("button", { name: "Route" }).click();
  await page.getByLabel("Port of loading").selectOption("CNSHA");
  await page.getByLabel("Port of discharge").selectOption("IRBND");
  await expect(page.getByLabel("Voyage")).toContainText("VOY-881");
  await page.getByLabel("Voyage").selectOption("VOY-881");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Server changes need review")).toBeVisible();
  await expect(page.getByText("Server value: 170")).toBeVisible();
  await expect(page.getByLabel("Booking reference")).toHaveValue("BK-4090");
  await page.getByRole("button", { name: "Review and resubmit" }).click();
  await expect(page.getByText("Submission: succeeded")).toBeVisible();
});
