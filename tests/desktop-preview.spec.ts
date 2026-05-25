import { expect, test } from "@playwright/test";

async function dismissIntro(page: import("@playwright/test").Page) {
  // The intro screen shows first; click through to template picker.
  const pickTemplateBtn = page.getByRole("button", { name: /Pick a starting template/ });
  if (await pickTemplateBtn.isVisible().catch(() => false)) {
    await pickTemplateBtn.click();
  }
}

async function skipToWorkbench(page: import("@playwright/test").Page) {
  await dismissIntro(page);
  const skipBtn = page.getByRole("button", { name: /Skip setup entirely/ });
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  }
}

test.describe("Atrium desktop renderer", () => {
  test("shows the welcome intro screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Welcome to Atrium/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pick a starting template/ })).toBeVisible();
  });

  test("intro advances to template picker with all four templates", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Pick a starting template/ }).click();
    await expect(page.getByRole("heading", { name: /Pick a starting template/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Systematic Review/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bibliometric Analysis/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hypothesis-Driven/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Blank Canvas/ })).toBeVisible();
  });

  test("selecting a template reveals pipeline steps and Use button", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Pick a starting template/ }).click();
    await page.getByRole("button", { name: /Bibliometric Analysis/ }).click();
    await expect(page.getByRole("heading", { name: /Bibliometric Analysis/ })).toBeVisible();
    await expect(page.getByText(/Pipeline steps/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Use this template/ })).toBeVisible();
  });

  test("credentials wizard exposes test-connection buttons", async ({ page }) => {
    await page.goto("/");
    await dismissIntro(page);
    await page.getByRole("button", { name: /Skip to credentials setup/ }).click();
    await expect(page.getByRole("heading", { name: /Configure API Credentials/ })).toBeVisible();
    const testButtons = page.getByRole("button", { name: /Test/ });
    await expect(testButtons.first()).toBeVisible();
    expect(await testButtons.count()).toBeGreaterThanOrEqual(3);
  });

  test("skip setup reveals main workbench with topbar actions", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await expect(page.getByTitle("Open project")).toBeVisible();
    await expect(page.getByTitle("Run")).toBeVisible();
    await expect(page.getByTitle("Export bundle")).toBeVisible();
    await expect(page.getByTitle("Import bundle")).toBeVisible();
    await expect(page.getByTitle("Verify bundle")).toBeVisible();
    await expect(page.getByTitle("Diff artifacts")).toBeVisible();
  });

  test("module library shows stage groups and a search box", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await expect(page.getByPlaceholder(/Search modules/)).toBeVisible();
    await expect(page.getByText("Find papers")).toBeVisible();
    await expect(page.getByText("Normalize", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Deduplicate", { exact: true }).first()).toBeVisible();
  });

  test("canvas shows empty-state guidance before any nodes are added", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await expect(page.getByText(/Your pipeline is empty/)).toBeVisible();
  });

  test("mode selector toggles run mode buttons", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await page.getByRole("button", { name: "Variance audit" }).click();
    await expect(page.getByRole("button", { name: "Variance audit" })).toHaveClass(/selected/);
  });

  test("bundle import dialog opens from topbar", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await page.getByTitle("Import bundle").click();
    await expect(page.getByRole("heading", { name: /Import bundle/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Choose bundle & destination/ })).toBeVisible();
  });

  test("bundle verify dialog accepts bundle path input", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await page.getByTitle("Verify bundle").click();
    await expect(page.getByRole("heading", { name: /Verify bundle/ })).toBeVisible();
    await expect(page.getByPlaceholder(/path\/to\/bundle/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Inspect trust/ })).toBeVisible();
  });
});
