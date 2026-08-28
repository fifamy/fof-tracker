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

test("custodian view uses pure custodian terminology and exposes Huaxia products", async ({ page }) => {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:8799/");
  await page.locator('#rail-nav [data-tab="custodian"]').click();

  await expect(page.locator("#panel-custodian")).toContainText("托管行统计概览");
  await expect(page.locator("#panel-custodian")).not.toContainText("主销渠道");
  await expect(page.locator("#panel-custodian")).not.toContainText("华夏未触达");

  await page.locator('[data-custodian-filter="huaxia"]').click();
  const ccbCard = page.locator("#custodian-board .custodian-card", { hasText: "中国建设银行" });
  const cmbCard = page.locator("#custodian-board .custodian-card", { hasText: "招商银行" });

  await expect(ccbCard).toContainText("华夏托管 6");
  await expect(ccbCard).toContainText("华夏行业配置股票型基金中基金(FOF-LOF)");
  await expect(ccbCard).toContainText("88.9 亿");
  await expect(cmbCard).toContainText("华夏托管 8");
  await expect(cmbCard).toContainText("31.9 亿");
  const cmbProfileScale = cmbCard.locator('[data-custodian-metric="profile-scale"] strong');
  const cmbActiveRaiseScale = cmbCard.locator('[data-custodian-metric="active-raise-scale"] strong');
  await expect(cmbProfileScale).toHaveText("1,030.1 亿");
  await expect(cmbActiveRaiseScale).toHaveText("351.5 亿");
  expect(await cmbProfileScale.textContent()).not.toBe(await cmbActiveRaiseScale.textContent());
  await expect(page.locator("#custodian-table thead")).toContainText("存量规模合计(亿元)");
  await expect(page.locator("#custodian-table thead")).toContainText("今年成立募集规模(亿元)");
});
