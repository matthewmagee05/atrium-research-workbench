import path from "node:path";
import { expect, test } from "@playwright/test";

const screenshotDir = path.resolve(__dirname, "..", "test-results", "visual-smoke");

test.describe.configure({ mode: "serial" });

test.describe("Visual smoke checks", () => {
  test("template picker layout — no overlapping buttons", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Pick a starting template/ }).click();
    await expect(page.getByRole("heading", { name: /Pick a starting template/ })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, "template-picker.png"), fullPage: false });

    // Verify each template button is its own rectangle and does not overlap the next
    const buttons = page.locator(".templateChoice");
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(4);
    const rects: Array<{ y: number; h: number }> = [];
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      if (box) rects.push({ y: box.y, h: box.height });
    }
    rects.sort((a, b) => a.y - b.y);
    for (let i = 1; i < rects.length; i++) {
      const prev = rects[i - 1];
      const cur = rects[i];
      expect(cur.y, `button ${i} should start after button ${i - 1} ends`).toBeGreaterThanOrEqual(prev.y + prev.h - 1);
    }
    for (const r of rects) {
      // Multi-line button must be tall enough to fit a title + 2-line description
      expect(r.h, "templateChoice should be tall enough for its content").toBeGreaterThan(40);
    }
  });

  test("intro screen renders all three pillar cards", async ({ page }) => {
    await page.goto("/");
    await page.screenshot({ path: path.join(screenshotDir, "intro.png"), fullPage: false });
    const cards = page.locator(".introCard");
    expect(await cards.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(60);
    }
  });

  test("full research template loads and centers on canvas", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Pick a starting template/ }).click();
    await page.getByRole("button", { name: /Use this template/ }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(screenshotDir, "template-loaded.png"), fullPage: false });
    // Module nodes should be present
    const nodes = page.locator(".moduleNode");
    expect(await nodes.count()).toBeGreaterThan(5);
    // No node should be entirely off-screen
    const viewportW = page.viewportSize()?.width ?? 1280;
    const viewportH = page.viewportSize()?.height ?? 720;
    for (let i = 0; i < await nodes.count(); i++) {
      const box = await nodes.nth(i).boundingBox();
      if (!box) continue;
      expect(box.x + box.width, `node ${i} left edge`).toBeGreaterThan(0);
      expect(box.x, `node ${i} right edge`).toBeLessThan(viewportW);
      expect(box.y + box.height, `node ${i} top edge`).toBeGreaterThan(0);
      expect(box.y, `node ${i} bottom edge`).toBeLessThan(viewportH);
    }
  });

  test("workbench module library does not overflow into the canvas", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Start with a blank canvas/ }).click();
    await page.screenshot({ path: path.join(screenshotDir, "workbench.png"), fullPage: false });
    const library = page.locator(".library");
    const canvas = page.locator(".canvas").first();
    const libBox = await library.boundingBox();
    const canvasBox = await canvas.boundingBox();
    expect(libBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    if (libBox && canvasBox) {
      expect(libBox.x + libBox.width).toBeLessThanOrEqual(canvasBox.x + 2);
    }
  });
});
