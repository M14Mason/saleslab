// Browser smoke test: real built app, mocked Supabase + API, fake microphone.
// Run: VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=anon npx vite build && node tests/e2e.mjs
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 4173;
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const SID = "11111111-1111-4111-8111-111111111111";
const user = { id: "u1", email: "mason@test.dev", aud: "authenticated", role: "authenticated" };
const sessionBlob = {
  access_token: "tok", refresh_token: "ref", token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user,
};
const report = {
  overall_score: 38, summary: "You pitched features first.", outcome: "no_deal",
  top_strength: "Strong opener", top_weakness: "No discovery questions",
  categories: [{ name: "discovery", score: 20, note: "None asked" }, { name: "objections", score: null, note: "N/A" }],
  key_moments: [{ quote: "It writes smooth", analysis: "Feature dump" }],
  alternatives: [{ original: "It writes smooth", problem: "Feature", better: "When did you last sign something?", why: "Finds need" }],
  delivery: { filler_words: ["um"], talk_ratio_note: "You talked 70%", basis: "transcript" },
  next_objective: "Ask two questions first.",
};

const errors = [];
const results = [];
const check = (name, ok) => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}`); };

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
for (const vp of [{ name: "desktop", width: 1280, height: 800 }, { name: "iphone", width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|huggingface|net::/.test(m.text())) errors.push(`${vp.name} console: ${m.text()}`); });

  let converseCalls = 0, coachCalls = 0;
  const messages = [];
  await page.route(/huggingface|hf\.co/, (r) => r.abort());
  await page.route("https://test.supabase.co/**", async (r) => {
    const u = new URL(r.request().url()); const m = r.request().method();
    const json = (b, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname.startsWith("/auth/")) return json(user);
    if (u.pathname === "/rest/v1/sessions" && m === "POST") return json({ id: SID });
    if (u.pathname === "/rest/v1/sessions" && m === "PATCH") return json([]);
    if (u.pathname === "/rest/v1/sessions" && u.searchParams.get("status") === "eq.active") return json(null, 406);
    if (u.pathname === "/rest/v1/sessions") return json([{ id: SID, difficulty: "hard", status: "coached", outcome: "no_deal", score: 38, started_at: new Date().toISOString(), duration_sec: 90 }]);
    if (u.pathname === "/rest/v1/messages") return json(messages);
    if (u.pathname === "/rest/v1/reports") return u.searchParams.get("session_id") ? json(null, 406) : json([{ report }]);
    return json([]);
  });
  await page.route("**/api/converse", async (r) => {
    converseCalls++;
    const b = r.request().postDataJSON();
    messages.push({ role: "seller", text: b.text });
    const reply = converseCalls >= 2 ? "Not buying it, kid. [NO_DEAL]" : "Why would I need a pen?";
    messages.push({ role: "buyer", text: reply });
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ reply: reply.replace(" [NO_DEAL]", ""), outcome: converseCalls >= 2 ? "no_deal" : null }) });
  });
  await page.route("**/api/coach", (r) => { coachCalls++; r.fulfill({ contentType: "application/json", body: JSON.stringify({ report, cached: false }) }); });

  // Fake mic: SpeechRecognition that "hears" a line. Fast fake TTS.
  await page.addInitScript(({ blob }) => {
    localStorage.setItem("sb-test-auth-token", JSON.stringify(blob));
    const lines = ["It writes really smooth", "It's only five bucks"];
    let n = 0;
    class FakeRec {
      start() { const t = lines[n++ % lines.length]; setTimeout(() => { this.onresult?.({ results: [Object.assign([{ transcript: t }], { isFinal: true })] }); this.onend?.(); }, 150); }
      stop() { this.onend?.(); } abort() {}
    }
    window.webkitSpeechRecognition = FakeRec;
    window.SpeechRecognition = FakeRec;
    const ss = { speak: (u) => setTimeout(() => u.onend?.(), 50), cancel() {}, getVoices: () => [] };
    Object.defineProperty(window, "speechSynthesis", { value: ss });
  }, { blob: sessionBlob });

  const base = `http://localhost:${PORT}`;
  await page.goto(base + "/");
  check(`${vp.name}: landing renders`, await page.getByText("Sell me this pen.").first().isVisible());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(`${vp.name}: no horizontal scroll`, !overflow);

  await page.goto(base + "/practice");
  await page.getByText("Hard", { exact: true }).click();
  await page.getByRole("button", { name: "Start the call" }).click();
  await page.getByText("The Wolf is talking").or(page.getByText("Listening...")).or(page.getByText("Tap the mic to talk")).first().waitFor({ timeout: 130000 });
  // auto-listen should kick in after opener; otherwise tap Talk
  await page.waitForTimeout(800);
  if (converseCalls === 0) await page.getByRole("button", { name: "Talk" }).click().catch(() => {});
  await page.getByText("He walked. No deal.").waitFor({ timeout: 20000 }).catch(() => {});
  check(`${vp.name}: 2 voice turns sent`, converseCalls === 2);
  check(`${vp.name}: transcript shows Wolf reply`, await page.getByText("Why would I need a pen?").isVisible());
  check(`${vp.name}: no-deal outcome shown`, await page.getByText("He walked. No deal.").isVisible());

  if (process.env.DEBUG) { console.log(results.join("\n")); console.log("converse:", converseCalls, "\n", (await page.locator("main").innerText()).slice(0, 1500)); console.log(errors); await page.screenshot({ path: "/tmp/claude-0/dbg.png" }); process.exit(1); }
  await page.getByRole("button", { name: "Get coached" }).click();
  await page.getByText("Biggest weakness").waitFor({ timeout: 15000 }).catch(() => {});
  check(`${vp.name}: coaching report renders`, await page.getByText("No discovery questions").isVisible());
  check(`${vp.name}: N/A category shown`, await page.locator("span", { hasText: /^N\/A$/ }).first().isVisible());
  check(`${vp.name}: coach called exactly once`, coachCalls === 1);

  await page.goto(base + "/home");
  check(`${vp.name}: dashboard renders`, await page.getByText("Avg score").waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.goto(base + "/history");
  check(`${vp.name}: history renders`, await page.getByRole("link", { name: /38/ }).waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.screenshot({ path: `/tmp/claude-0/e2e-${vp.name}.png`, fullPage: false });
  await ctx.close();
}

// PWA manifest
const man = await (await fetch(`http://localhost:${PORT}/manifest.webmanifest`)).json();
check("PWA manifest valid", man.display === "standalone" && man.icons.length >= 2);
const sw = await fetch(`http://localhost:${PORT}/sw.js`);
check("Service worker served", sw.ok);

await browser.close();
server.kill();
console.log(results.join("\n"));
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "No console/page errors");
process.exit(results.some((r) => r.startsWith("FAIL")) || errors.length ? 1 : 0);
