import { expect, test } from "@playwright/test";

async function dismissIntro(page: import("@playwright/test").Page) {
  const pickBtn = page.getByRole("button", { name: /Pick a starting template/ });
  if (await pickBtn.isVisible().catch(() => false)) {
    await pickBtn.click();
  }
}

async function skipToWorkbench(page: import("@playwright/test").Page) {
  // From the intro, click "Start with a blank canvas" to skip to workbench
  const blankBtn = page.getByRole("button", { name: /Start with a blank canvas/ });
  if (await blankBtn.isVisible().catch(() => false)) {
    await blankBtn.click();
    return;
  }
  // Already past intro — try the picker's skip button
  await dismissIntro(page);
  const skipBtn = page.getByRole("button", { name: /Skip — start blank/ });
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  }
}

test.describe("Atrium desktop renderer", () => {
  test("shows the welcome intro screen with three pillars", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Welcome to Atrium/ })).toBeVisible();
    await expect(page.getByText("1. Compose")).toBeVisible();
    await expect(page.getByText("2. Run")).toBeVisible();
    await expect(page.getByText("3. Verify")).toBeVisible();
  });

  test("intro advances to template picker with all templates", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Pick a starting template/ }).click();
    await expect(page.getByRole("heading", { name: /Pick a starting template/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Full Research Project/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Systematic Review/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bibliometric Analysis/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Blank Canvas/ })).toBeVisible();
  });

  test("Full Research Project is preselected and shows its 10-step plan", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Pick a starting template/ }).click();
    await expect(page.getByRole("heading", { name: /Full Research Project/ })).toBeVisible();
    await expect(page.getByText(/Pipeline steps/i)).toBeVisible();
    await expect(page.getByText(/Generate candidate research questions/)).toBeVisible();
    await expect(page.getByText(/Draft a narrative report/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Use this template/ })).toBeVisible();
  });

  test("skip to workbench shows topbar with credentials indicator and settings", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await expect(page.locator(".credentialsIndicator")).toBeVisible();
    await expect(page.getByTitle("Settings")).toBeVisible();
    await expect(page.getByTitle("Open project")).toBeVisible();
    await expect(page.getByTitle("Run")).toBeVisible();
    await expect(page.getByTitle("Export bundle")).toBeVisible();
    await expect(page.getByTitle("Import bundle")).toBeVisible();
    await expect(page.getByTitle("Verify bundle")).toBeVisible();
  });

  test("settings dialog opens from credentials indicator and shows provider rows", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await page.locator(".credentialsIndicator").click();
    await expect(page.getByRole("heading", { name: /API credentials/ })).toBeVisible();
    await expect(page.getByText(/Anthropic \(Claude\)/)).toBeVisible();
    await expect(page.getByText(/OpenAI/, { exact: false })).toBeVisible();
    await expect(page.getByText(/Ollama \(local\)/)).toBeVisible();
  });

  test("module library shows stage groups and a search box", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await expect(page.getByPlaceholder(/Search modules/)).toBeVisible();
    await expect(page.getByText("Find papers")).toBeVisible();
    await expect(page.getByText("Normalize", { exact: true }).first()).toBeVisible();
  });

  test("canvas shows empty-state guidance before any nodes are added", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await expect(page.getByText(/Your pipeline is empty/)).toBeVisible();
  });

  test("next-steps panel appears after skipping to workbench", async ({ page }) => {
    await page.goto("/");
    await skipToWorkbench(page);
    await expect(page.getByText(/Next steps/)).toBeVisible();
    await expect(page.getByText(/Pick a template or drag modules/)).toBeVisible();
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
