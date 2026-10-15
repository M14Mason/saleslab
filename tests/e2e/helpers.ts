import type { Page, Route } from "@playwright/test";

export type Reply = string | { status: number } | { delayMs: number; text: string } | { thinkingOnly: true };

/** Mock Anthropic API: scripted buyer replies (in order) and grading responses. Counts every request. */
export class MockClaude {
  buyer: Reply[] = [];
  grades: (object | { status: number })[] = [];
  calls = { buyer: 0, grade: 0, key: 0, scenario: 0 };
  bodies: Record<string, unknown>[] = [];

  async install(page: Page) {
    await page.route("https://api.anthropic.com/**", (route) => this.handle(route));
    await page.route(/huggingface|hf\.co|cdn\.jsdelivr/, (r) => r.abort());
  }

  private sse(text: string, stop = "end_turn") {
    const ev = (o: unknown) => `event: e\ndata: ${JSON.stringify(o)}\n\n`;
    const parts = text.match(/.{1,12}/gs) ?? [];
    return [
      ev({ type: "message_start", message: {} }),
      ...parts.map((p) => ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } })),
      ev({ type: "message_delta", delta: { stop_reason: stop } }),
      ev({ type: "message_stop" }),
    ].join("");
  }

  private async handle(route: Route) {
    const body = route.request().postDataJSON() as Record<string, unknown> & { output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } }; max_tokens: number };
    this.bodies.push(body);
    const headers = { "content-type": "text/event-stream", "access-control-allow-origin": "*" };
    if (body.max_tokens === 5) { this.calls.key++; return route.fulfill({ contentType: "application/json", headers, body: JSON.stringify({ content: [{ type: "text", text: "Hi" }] }) }); }
    const schema = body.output_config?.format?.schema?.properties ?? {};
    if ("overall_score" in schema) {
      this.calls.grade++;
      const g = this.grades.shift() ?? REPORT;
      if ("status" in g) return route.fulfill({ status: (g as { status: number }).status, headers, body: "{}" });
      return route.fulfill({ status: 200, headers, body: this.sse(JSON.stringify(g)) });
    }
    if ("persona" in schema) {
      this.calls.scenario++;
      return route.fulfill({ contentType: "application/json", headers, body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify(GEN) }] }) });
    }
    this.calls.buyer++;
    const r = this.buyer.shift() ?? "Go on.";
    if (typeof r === "object" && "status" in r) return route.fulfill({ status: r.status, headers, body: "{}" });
    if (typeof r === "object" && "thinkingOnly" in r) return route.fulfill({ status: 200, headers, body: `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "max_tokens" } })}\n\n` });
    if (typeof r === "object" && "delayMs" in r) { await new Promise((res) => setTimeout(res, r.delayMs)); return route.fulfill({ status: 200, headers, body: this.sse(r.text) }).catch(() => {}); }
    return route.fulfill({ status: 200, headers, body: this.sse(r) });
  }
}

/** Fake mic + speaker. Lines in window.__mic are "spoken" one per listening turn. */
export async function fakeVoice(page: Page, opts: { lines?: string[]; noRecognition?: boolean } = {}) {
  await page.addInitScript(({ lines, noRecognition }) => {
    const w = window as unknown as Record<string, unknown>;
    w.__mic = [...lines];
    w.__spoken = [] as { text: string; t: number }[];
    w.__recStarts = 0;
    class FakeRec {
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
      private timer: ReturnType<typeof setTimeout> | null = null;
      start() {
        (w.__recStarts as number)++;
        const mic = w.__mic as string[];
        if (!mic.length) return;
        const line = mic.shift()!;
        const words = line.split(" ");
        let i = 0;
        const step = () => {
          i = Math.min(words.length, i + 3);
          const done = i >= words.length;
          const res = [Object.assign([{ transcript: words.slice(0, i).join(" ") }], { isFinal: done })];
          this.onresult?.({ resultIndex: 0, results: res });
          if (!done) this.timer = setTimeout(step, 120);
        };
        this.timer = setTimeout(step, 150);
      }
      stop() { if (this.timer) clearTimeout(this.timer); this.onend?.(); }
      abort() { if (this.timer) clearTimeout(this.timer); }
    }
    if (noRecognition) { delete w.SpeechRecognition; delete w.webkitSpeechRecognition; Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true }); }
    else { w.SpeechRecognition = FakeRec; w.webkitSpeechRecognition = FakeRec; }
    const synth = {
      speaking: false,
      speak(u: SpeechSynthesisUtterance) {
        if (u.text.trim()) (w.__spoken as { text: string; t: number }[]).push({ text: u.text, t: performance.now() });
        setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), Math.min(300, u.text.length * 6));
      },
      cancel() {}, getVoices: () => [], addEventListener() {}, pause() {}, resume() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    // Fake getUserMedia so the level meter has a stream to analyze.
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        osc.connect(dst); osc.start();
        return dst.stream;
      };
    }
  }, { lines: opts.lines ?? [], noRecognition: opts.noRecognition ?? false });
}

/** Skip onboarding: saved key, fast pause, system voice. */
export async function signedIn(page: Page, settings: Record<string, unknown> = {}, key = "sk-ant-test") {
  await page.addInitScript(({ settings, key }) => {
    if (sessionStorage.getItem("__seeded")) return; // seed once per test, survive reloads
    sessionStorage.setItem("__seeded", "1");
    localStorage.setItem("saleslab.apiKey", key);
    localStorage.setItem("saleslab.v2", JSON.stringify({
      version: 2, sessions: [], customScenarios: [], achievements: {},
      settings: { voiceEngine: "system", pauseMs: 700, autoListen: true, onboarded: true, theme: "dark", reducedMotion: "on", ...settings },
    }));
  }, { settings, key });
}

export const REPORT = {
  overall_score: 72, summary: "Good discovery, weak close.", outcome: "deal", top_strength: "You asked about his need first.",
  top_weakness: "You hesitated on the close.",
  skills: [
    { name: "opening", score: 70, explanation: "Direct opener." }, { name: "discovery", score: 80, explanation: "Asked about the dead pen." },
    { name: "questioning", score: 75, explanation: "Open question." }, { name: "listening", score: 70, explanation: "Followed up." },
    { name: "empathy", score: null, explanation: "Did not come up." }, { name: "value", score: 68, explanation: "Tied to contract." },
    { name: "objections", score: 60, explanation: "OK." }, { name: "negotiation", score: null, explanation: "Did not come up." },
    { name: "closing", score: 65, explanation: "Asked once." }, { name: "clarity", score: 80, explanation: "Concise." },
    { name: "confidence", score: 70, explanation: "Assertive." }, { name: "next_steps", score: 60, explanation: "Vague." },
  ],
  top_improvements: ["Close with certainty", "Ask a second question", "Summarize the need"],
  key_moments: [{ turn: 1, kind: "strength", quote: "When did you last sign something important", analysis: "Great discovery." }],
  alternatives: [{ turn: 3, original: "So do you want it", problem: "Weak close.", better: "Let's get you set before two o'clock. Cash or card?", why: "Assumes the sale." }],
  objections: [{ turn: 2, objection: "I already have pens", handled: true, note: "Redirected to need." }],
  compliance_flags: [], practice_plan: ["Drill 3 closes", "Ask 2 questions first", "Summarize needs"], next_objective: "Close twice.",
};

const GEN = {
  title: "Meal kit for a busy student", industry: "Food", objective: "Find the need and close a trial.", product: "Meal kits, $30/week",
  opener: "Yeah? I've got class in ten minutes.", winCondition: "Seller ties it to time savings and asks for a trial.",
  tips: ["Ask about their schedule", "Talk about time", "Offer a trial"],
  persona: { name: "Sam Rivera", title: "Student", company: "State University", personality: "Rushed", style: "Short answers",
    painPoints: ["No time to cook"], goals: ["Eat better"], budget: "$25 a week", timeline: "Now", hiddenMotivation: "Parents nag about diet",
    objections: ["Too expensive", "I can just eat ramen"] },
};
