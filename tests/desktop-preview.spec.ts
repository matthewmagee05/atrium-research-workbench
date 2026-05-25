import { expect, test } from "@playwright/test";

test.describe("Atrium desktop renderer", () => {
  test("shows first-run welcome with templates", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Welcome to Atrium/ })).toBeVisible();
    await expect(page.getByText("Systematic Review")).toBeVisible();
    await expect(page.getByText("Bibliometric Analysis")).toBeVisible();
    await expect(page.getByText("Hypothesis-Driven Research")).toBeVisible();
    await expect(page.getByRole("button", { name: /Blank Canvas/ })).toBeVisible();
  });

  test("template selection advances to credentials wizard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Blank Canvas/ }).click();
    await expect(page.getByRole("heading", { name: /Configure API Credentials/ })).toBeVisible();
    await expect(page.getByPlaceholder(/sk-ant-api/)).toBeVisible();
    await expect(page.getByPlaceholder("sk-...")).toBeVisible();
    await expect(page.getByPlaceholder(/localhost:11434/)).toBeVisible();
  });

  test("credentials wizard exposes test-connection buttons", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Blank Canvas/ }).click();
    await expect(page.getByRole("heading", { name: /Configure API Credentials/ })).toBeVisible();
    const testButtons = page.getByRole("button", { name: /Test/ });
    await expect(testButtons.first()).toBeVisible();
    expect(await testButtons.count()).toBeGreaterThanOrEqual(3);
  });

  test("skip setup reveals main workbench with modules and topbar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Skip setup/ }).click();
    await expect(page.getByText("Atrium", { exact: false })).toBeVisible();
    await expect(page.getByText(/Fixture Source|Record Normalizer|Bibliometrix/i).first()).toBeVisible();
    await expect(page.getByTitle("Open project")).toBeVisible();
    await expect(page.getByTitle("Run")).toBeVisible();
    await expect(page.getByTitle("Export bundle")).toBeVisible();
    await expect(page.getByTitle("Import bundle")).toBeVisible();
    await expect(page.getByTitle("Verify bundle")).toBeVisible();
    await expect(page.getByTitle("Diff artifacts")).toBeVisible();
  });

  test("mode selector toggles run mode buttons", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Skip setup/ }).click();
    await expect(page.getByRole("button", { name: "Execute" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Deterministic re-run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Full re-run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Variance audit" })).toBeVisible();
    await page.getByRole("button", { name: "Variance audit" }).click();
    await expect(page.getByRole("button", { name: "Variance audit" })).toHaveClass(/selected/);
  });

  test("bundle import dialog opens from topbar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Skip setup/ }).click();
    await page.getByTitle("Import bundle").click();
    await expect(page.getByRole("heading", { name: /Import bundle/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Choose bundle & destination/ })).toBeVisible();
  });

  test("bundle verify dialog accepts bundle path input", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Skip setup/ }).click();
    await page.getByTitle("Verify bundle").click();
    await expect(page.getByRole("heading", { name: /Verify bundle/ })).toBeVisible();
    await expect(page.getByPlaceholder(/path\/to\/bundle/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Inspect trust/ })).toBeVisible();
  });
});
