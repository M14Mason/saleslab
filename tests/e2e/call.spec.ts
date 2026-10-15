import { expect, test, type Page } from "@playwright/test";
import { fakeVoice, MockClaude, signedIn } from "./helpers";

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: { text: string }[] }).__spoken.map((s) => s.text));
const errors = (page: Page) => {
  const list: string[] = [];
  page.on("pageerror", (e) => list.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|fonts\.g/.test(m.text())) list.push(m.text()); });
  return list;
};

async function startCall(page: Page, scenario = "wolf-pen", difficulty = "Medium") {
  await page.goto(`#/practice/${scenario}`);
  await page.getByRole("radio", { name: difficulty }).click();
  await page.getByRole("button", { name: "Start call" }).click();
}

test("full voice call: opener, two turns, deal, single grading, report", async ({ page }) => {
  const errs = errors(page);
  const api = new MockClaude();
  api.buyer = ["My pen died this morning, actually. Why?", "Ha. Alright, you earned it. [DEAL]"];
  await api.install(page);
  await fakeVoice(page, { lines: ["When did you last sign something important?", "So do you want it before your two o'clock signing?"] });
  await signedIn(page);
  await startCall(page);

  await expect(page.getByText("Deal closed!")).toBeVisible({ timeout: 20_000 });
  const said = await spoken(page);
  expect(said.join(" ")).toMatch(/^Alright, kid\. Here's the pen\. Sell me this pen\./);
  expect(said.join(" ")).toContain("My pen died this morning");
  expect(said.filter((s) => /talk to me/i.test(s))).toHaveLength(0);
  expect(api.calls.buyer).toBe(2);

  // The buyer never answers twice per turn.
  const b = api.bodies.filter((x) => x.stream && !(x as { output_config?: { format?: unknown } }).output_config?.format) as { messages: { role: string }[] }[];
  expect(b[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);

  await page.getByRole("button", { name: "Get coached" }).click();
  await expect(page.getByRole("img", { name: /Score 72 out of 100/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Fix these three things")).toBeVisible();
  expect(api.calls.grade).toBe(1);

  // Feedback links to the exact transcript line.
  await page.getByRole("button", { name: "see in transcript" }).first().click();
  await expect(page.locator("#turn-3")).toHaveClass(/outline-brass/);

  // Reopening the report never pays twice.
  await page.reload();
  await expect(page.getByRole("img", { name: /Score 72/ })).toBeVisible();
  expect(api.calls.grade).toBe(1);
  expect(errs).toEqual([]);
});

test("regression: a repeated or empty buyer line is regenerated, never looped", async ({ page }) => {
  const api = new MockClaude();
  api.buyer = ["Why should I care?", "Why should I care?", "Fine, tell me more."];
  await api.install(page);
  await fakeVoice(page, { lines: ["Hi there, quick question for you.", "When do you use a pen the most?"] });
  await signedIn(page);
  await startCall(page, "wolf-pen", "Easy");
  await expect(page.getByText("Fine, tell me more.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Show full transcript/ }).click();
  await expect(page.getByLabel("Transcript").getByText("Why should I care?")).toHaveCount(1);
  expect(api.calls.buyer).toBe(3);
});

test("regression: thinking-only responses surface a retry instead of 'Talk to me.'", async ({ page }) => {
  const api = new MockClaude();
  api.buyer = [{ thinkingOnly: true }, { thinkingOnly: true }, "Okay, now I'm listening."];
  await api.install(page);
  await fakeVoice(page, { lines: ["What do you write with today?"] });
  await signedIn(page);
  await startCall(page);
  await expect(page.getByRole("alert").filter({ hasText: /didn't answer properly/ })).toBeVisible({ timeout: 20_000 });
  expect((await spoken(page)).join(" ")).not.toMatch(/talk to me/i);
  await page.getByRole("alert").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Okay, now I'm listening.")).toBeVisible();
  // The seller's line was sent once, not duplicated by the retry.
  await page.getByRole("button", { name: /Show full transcript/ }).click();
  await expect(page.getByLabel("Transcript").getByText("What do you write with today?")).toHaveCount(1);
});

test("server error then retry keeps one seller turn; slow reply shows a timer", async ({ page }) => {
  const api = new MockClaude();
  api.buyer = [{ status: 529 }, { delayMs: 9500, text: "Sorry, where were we?" }];
  await api.install(page);
  await fakeVoice(page, { lines: ["Can I ask how you sign contracts?"] });
  await signedIn(page);
  await startCall(page);
  await expect(page.getByRole("alert").filter({ hasText: /overloaded/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("alert").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText(/is thinking/)).toBeVisible();
  await expect(page.getByText("Taking longer than usual")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Sorry, where were we?")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Show full transcript/ }).click();
  await expect(page.getByLabel("Transcript").getByText("Can I ask how you sign contracts?")).toHaveCount(1);
});

test("interrupting the buyer stops them and gives you the floor", async ({ page }) => {
  const api = new MockClaude();
  api.buyer = [{ delayMs: 4000, text: "Let me tell you a long story about pens." }, "Okay, you have my attention."];
  await api.install(page);
  await fakeVoice(page, { lines: ["Here's the thing about this pen.", "Sorry to cut in, when's your next signing?"] });
  await signedIn(page);
  await startCall(page);
  await expect(page.getByText(/is thinking/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Interrupt" }).click();
  await expect(page.getByText("Okay, you have my attention.")).toBeVisible({ timeout: 15_000 });
  expect(api.calls.buyer).toBe(2);
});

test("text fallback when the browser can't transcribe", async ({ page }) => {
  const api = new MockClaude();
  api.buyer = ["Typing, huh? Fine. What do you want?"];
  await api.install(page);
  await fakeVoice(page, { noRecognition: true });
  await signedIn(page);
  await startCall(page);
  const box = page.getByLabel("Type your line");
  await expect(box).toBeVisible();
  await box.fill("When did you last need a pen?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Typing, huh? Fine. What do you want?")).toBeVisible({ timeout: 15_000 });
});

test("grading failure shows a retry and never double-charges", async ({ page }) => {
  const api = new MockClaude();
  api.buyer = ["Not interested. [NO_DEAL]"];
  api.grades = [{ status: 401 }];
  await api.install(page);
  await fakeVoice(page, { lines: ["Buy this pen, it's blue."] });
  await signedIn(page);
  await startCall(page);
  await expect(page.getByText(/walked away/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Get coached" }).click();
  await expect(page.getByText(/rejected your API key/)).toBeVisible({ timeout: 15_000 });
  expect(api.calls.grade).toBe(1); // auth errors are not auto-retried
  await page.getByRole("button", { name: "Retry grading" }).click();
  await expect(page.getByRole("img", { name: /Score 72/ })).toBeVisible({ timeout: 15_000 });
  expect(api.calls.grade).toBe(2);
});

test("end call with confirmation; empty calls are discarded", async ({ page }) => {
  const api = new MockClaude();
  await api.install(page);
  await fakeVoice(page, { lines: [] });
  await signedIn(page, { autoListen: false });
  await startCall(page);
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "End the call?" })).toBeVisible();
  await expect(page.getByText("nothing will be saved")).toBeVisible();
  await page.getByRole("button", { name: "End call" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goto("#/history");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
});

test("timing: buyer starts speaking quickly after you stop", async ({ page }) => {
  const api = new MockClaude();
  api.buyer = ["Fair question. I sign contracts all day."];
  await api.install(page);
  await fakeVoice(page, { lines: ["How often do you sign contracts?"] });
  await signedIn(page);
  await startCall(page);
  await expect(page.getByText("Fair question. I sign contracts all day.")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const ms = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("saleslab.v2")!);
    return d.sessions[0].perf.firstAudioMs[0];
  });
  console.log(`time to first audio (mocked API, app overhead only): ${ms}ms`);
  expect(ms).toBeLessThan(1500);
});
