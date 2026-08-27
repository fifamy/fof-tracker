const { test, expect } = require("@playwright/test");

test("custodian filter updates board and table consistently", async ({ page }) => {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:8799/");
  await page.locator('#rail-nav [data-tab="custodian"]').click();
  await expect(page.locator("#panel-custodian")).toHaveClass(/is-active/);

  await page.locator('[data-custodian-filter="bank"]').click();
  await expect(page.locator("#custodian-filter-tabs [data-custodian-filter=\"bank\"]")).toHaveClass(/is-active/);
  await expect(page.locator("#custodian-board .custodian-card").first()).toBeVisible();

  const tableTypes = await page.locator("#custodian-table tbody tr td:nth-child(2)").allInnerTexts();
  expect(tableTypes.length).toBeGreaterThan(0);
  expect(tableTypes.every((text) => text.trim() === "银行")).toBeTruthy();

  await page.locator('[data-custodian-filter="broker"]').click();
  await expect(page.locator("#custodian-filter-tabs [data-custodian-filter=\"broker\"]")).toHaveClass(/is-active/);
  const brokerTableTypes = await page.locator("#custodian-table tbody tr td:nth-child(2)").allInnerTexts();
  expect(brokerTableTypes.length).toBeGreaterThan(0);
  expect(brokerTableTypes.every((text) => text.trim() !== "银行")).toBeTruthy();
});
