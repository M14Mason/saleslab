import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { fakeVoice, MockClaude, signedIn } from "./helpers";

test("onboarding with a key, then mic check, then home", async ({ page }) => {
  const api = new MockClaude();
  await api.install(page);
  await fakeVoice(page);
  await page.goto("");
  await expect(page.getByRole("heading", { name: /Pick up the phone/ })).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).click();
  const save = page.getByRole("button", { name: "Save and continue" });
  await expect(save).toBeDisabled();
  await page.getByPlaceholder("sk-ant-...").fill("sk-ant-abc123");
  await save.click();
  await expect(page.getByRole("heading", { name: "Check your mic" })).toBeVisible();
  expect(api.calls.key).toBe(1);
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByRole("heading", { name: /Ready to sell/ })).toBeVisible();
});

test("demo mode works with no key and shows sample history", async ({ page }) => {
  await fakeVoice(page, { lines: ["When did you last sign something important?", "Want it for your two o'clock?"] });
  await page.goto("");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Try demo mode" }).click();
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByText(/Demo mode/)).toBeVisible();
  await page.goto("#/history");
  await expect(page.getByText("2 of 2 calls")).toBeVisible();
  await page.goto("#/practice/wolf-pen");
  await page.getByRole("radio", { name: "Easy" }).click();
  await page.getByRole("button", { name: "Start call" }).click();
  await expect(page.getByText("Deal closed!")).toBeVisible({ timeout: 20_000 });
});

test("scenario library: filter, search, create with AI, edit, delete", async ({ page }) => {
  const api = new MockClaude();
  await api.install(page);
  await fakeVoice(page);
  await signedIn(page);
  await page.goto("#/practice");
  await page.getByRole("button", { name: "Negotiation", exact: true }).click();
  await expect(page.getByText("Renewal negotiation, 20% discount demand")).toBeVisible();
  await expect(page.getByText("Sell me this pen")).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Search scenarios").fill("dental");
  await expect(page.getByText("Discovery call with a clinic owner")).toBeVisible();

  await page.goto("#/practice/new");
  await page.getByPlaceholder(/meal-kit/).fill("Sell meal kits to a busy student");
  await page.getByRole("button", { name: "Generate with AI" }).click();
  await expect(page.getByLabel("Title *")).toHaveValue("Meal kit for a busy student");
  await page.getByRole("button", { name: "Save scenario" }).click();
  await expect(page.getByRole("heading", { name: "Meal kit for a busy student" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete scenario" }).click();
  await expect(page).toHaveURL(/#\/practice$/);
  await expect(page.getByText("Meal kit for a busy student")).toHaveCount(0);
});

test("settings: theme, motion, pause slider, export, double-confirmed reset", async ({ page }) => {
  await fakeVoice(page);
  await signedIn(page);
  await page.goto("#/settings");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "Reduce motion" }).click();
  await expect(page.locator("html")).toHaveClass(/reduce-motion/);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  expect((await dl).suggestedFilename()).toMatch(/saleslab-backup-.*\.json/);
  await page.getByRole("button", { name: "Reset app" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("dialog", { name: /Are you sure/ })).toBeVisible();
  await page.getByRole("button", { name: "Keep my data" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

const PAGES = ["", "#/practice", "#/practice/wolf-pen", "#/history", "#/progress", "#/settings", "#/practice/new"];

test("every page: no horizontal scroll, no errors, no serious accessibility violations", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await fakeVoice(page);
  await signedIn(page, {}, "demo");
  for (const p of PAGES) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${p || "home"} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${p}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`), `a11y on ${p || "home"}`).toEqual([]);
  }
  expect(errs).toEqual([]);
});

test("light theme passes contrast checks too", async ({ page }) => {
  await fakeVoice(page);
  await signedIn(page, { theme: "light" }, "demo");
  for (const p of ["", "#/practice/wolf-pen", "#/settings"]) {
    await page.goto(p);
    await page.waitForTimeout(300);
    const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2aa"]).analyze();
    const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${p}: ${v.id} ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

test("keyboard: skip link, focusable nav, Esc opens end-call dialog", async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), "keyboard shortcuts are a desktop feature");
  const api = new MockClaude();
  await api.install(page);
  await fakeVoice(page);
  await signedIn(page, { autoListen: false });
  await page.goto("");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.goto("#/practice/wolf-pen");
  await page.getByRole("button", { name: "Start call" }).click();
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "End the call?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("PWA: manifest and service worker", async ({ request }) => {
  const m = await (await request.get("manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect(m.icons.length).toBeGreaterThanOrEqual(2);
  expect((await request.get("sw.js")).ok()).toBe(true);
});

test("offline banner appears and history still works", async ({ page, context }) => {
  await fakeVoice(page);
  await signedIn(page, {}, "demo");
  await page.goto("#/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText(/You're offline/)).toBeVisible();
  await context.setOffline(false);
});

test("round 3: Learn this field tab and random buyer", async ({ page }) => {
  await fakeVoice(page);
  await signedIn(page);
  await page.goto("#/practice/financial-plan-close");
  await expect(page.getByRole("heading", { name: "Close a financial plan" })).toBeVisible();
  await page.getByRole("tab", { name: "Learn this field" }).click();
  await expect(page.getByRole("heading", { name: "What this is used for" })).toBeVisible();
  await expect(page.getByText("Financial advisor / planner (CFP)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lines to try" })).toBeVisible();
  await page.goto("#/practice");
  await page.getByRole("button", { name: "Random buyer" }).click();
  await expect(page).toHaveURL(/#\/practice\/[a-z-]+$/);
  await expect(page.getByRole("tab", { name: "Practice" })).toBeVisible();
});

test("Settings: ElevenLabs key saves locally and can be removed", async ({ page }) => {
  await new MockClaude().install(page);
  await signedIn(page);
  await page.goto("#/settings");
  await page.getByLabel("ElevenLabs API key").fill("sk_abcd1234");
  await page.getByLabel("ElevenLabs Voice ID").fill("NKNZtOg05k03BNkLBjHJ");
  await page.getByRole("button", { name: "Save" }).nth(1).click();
  await expect(page.getByText(/key ending in 1234/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("saleslab.v2") ?? "")).not.toContain("sk_abcd1234");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText(/^Off\./)).toBeVisible();
});
