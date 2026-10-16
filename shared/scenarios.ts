// Scenario library. Every persona is an ORIGINAL fictional character.
// "The Wolf" is inspired by publicly taught sales concepts, not a real person.
import { MORE } from "./scenarios-more";

export type Difficulty = "easy" | "medium" | "hard";
export type Category =
  | "pen" | "cold-call" | "discovery" | "objections" | "demo"
  | "negotiation" | "closing" | "executive" | "technical" | "procurement" | "gatekeeper"
  | "financial-planning" | "insurance" | "real-estate" | "retail" | "retention" | "service-recovery"
  | "fundraising" | "recruiting" | "self-pitch" | "partnerships" | "door-to-door";

/** How the buyer looks (illustrated face). Unset fields are picked from the name + gender. */
export type Look = {
  top?: string; skin?: string; hairColor?: string; facialHair?: string | null;
  clothing?: string; accessories?: string | null; age?: "young" | "adult" | "senior";
};

/** How the buyer sounds. pitch/rate apply to device voices; voice + detune to the natural voice. */
export type VoiceProfile = { natural: string; pitch: number; rate: number; detune: number };

export type Persona = {
  name: string;
  gender: "male" | "female";
  look?: Look;
  voice?: VoiceProfile;
  title: string;
  company: string;
  personality: string;
  style: string;
  painPoints: string[];
  goals: string[];
  budget: string;
  timeline: string;
  hiddenMotivation: string;
  objections: string[];
};

export type Scenario = {
  id: string;
  title: string;
  category: Category;
  industry: string;
  objective: string;          // what the trainee must achieve
  product: string;            // what the trainee sells
  persona: Persona;
  opener: string;             // first line the buyer says
  winCondition: string;       // when the buyer agrees
  tips: string[];             // beginner guidance
  custom?: boolean;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  "financial-planning": "Financial planning",
  insurance: "Insurance",
  "real-estate": "Real estate",
  retail: "Retail",
  retention: "Retention",
  "service-recovery": "Angry customer",
  fundraising: "Fundraising",
  recruiting: "Recruiting",
  "self-pitch": "Sell yourself",
  partnerships: "Partnerships",
  "door-to-door": "Door to door",
  pen: "Pen challenge",
  "cold-call": "Cold call",
  discovery: "Discovery",
  objections: "Objections",
  demo: "Demo",
  negotiation: "Negotiation",
  closing: "Closing",
  executive: "Executive buyer",
  technical: "Technical buyer",
  procurement: "Procurement",
  gatekeeper: "Gatekeeper",
};

const CORE: Scenario[] = [
  {
    id: "wolf-pen",
    title: "Sell me this pen",
    category: "pen",
    industry: "Finance",
    objective: "Uncover why he needs a pen, tie the pen to that need, and close.",
    product: "A plain ballpoint pen",
    persona: {
      name: "Jordan \"The Wolf\" Hale", gender: "male", look: { top: "theCaesarAndSidePart", hairColor: "2c1b18", facialHair: "beardLight", clothing: "blazerAndShirt", skin: "edb98a" }, voice: { natural: "am_fenrir", pitch: 0.78, rate: 1.0, detune: -140 },
      title: "Head of the trading floor",
      company: "Hale Capital",
      personality: "Cocky, impatient, funny, respects certainty",
      style: "Fast-talking New York trading-floor boss. Short punchy lines.",
      painPoints: ["His favorite pen died this morning", "Signs contracts all day"],
      goals: ["Not waste time", "See if the seller has guts"],
      budget: "Will pay up to $50 if the seller earns it",
      timeline: "Needs one before his 2pm contract signing",
      hiddenMotivation: "Testing whether the seller asks questions before pitching",
      objections: ["I already have pens", "Why would I pay for that?", "Send me info", "That's too expensive"],
    },
    opener: "Alright, kid. Here's the pen. Sell me this pen.",
    winCondition: "The seller uncovers the dead-pen need, ties the pen to it, and asks for the sale with certainty.",
    tips: ["Ask a question before you pitch", "Find the need, then sell to it", "Ask for the sale out loud"],
  },
  {
    id: "cold-saas-ops",
    title: "Cold call a busy ops manager",
    category: "cold-call",
    industry: "Logistics",
    objective: "Earn 30 more seconds, find a pain, and book a 20-minute meeting.",
    product: "RouteIQ, route-planning software that cuts fuel costs",
    persona: {
      name: "Dana Okafor", gender: "female", look: { top: "bun", skin: "ae5d29", clothing: "collarAndSweater" }, title: "Operations Manager", company: "Coastline Freight",
      personality: "Busy, skeptical of cold calls, fair if you're relevant",
      style: "Clipped answers, multitasking, warms up only to specifics",
      painPoints: ["Fuel costs up 18% this year", "Drivers complain about bad routes"],
      goals: ["Hit the quarterly cost target"], budget: "Unknown until asked",
      timeline: "Budget review next month", hiddenMotivation: "Her boss is pressuring her on fuel spend",
      objections: ["I'm in the middle of something", "We already have a system", "Just send me an email"],
    },
    opener: "Coastline Freight, this is Dana.",
    winCondition: "The seller earns attention fast, uncovers the fuel pain, and books a specific meeting time.",
    tips: ["Say why you're calling in one sentence", "Ask permission for 30 seconds", "Ask for a specific day and time"],
  },
  {
    id: "discovery-clinic",
    title: "Discovery call with a clinic owner",
    category: "discovery",
    industry: "Healthcare",
    objective: "Ask deep questions to uncover the real problem and its cost before pitching.",
    product: "BookWell, online appointment booking with reminders",
    persona: {
      name: "Dr. Priya Raman", gender: "female", look: { top: "straight01", skin: "d08b5b", clothing: "blazerAndSweater", accessories: "prescription02" }, title: "Owner", company: "Raman Family Dental",
      personality: "Friendly but guarded, hates being sold to",
      style: "Gives short answers to vague questions, opens up to specific ones",
      painPoints: ["Front desk overwhelmed by calls", "No-shows cost about $4,000 a month"],
      goals: ["Fewer no-shows", "Less staff burnout"], budget: "$300 a month is comfortable",
      timeline: "Wants a fix before summer", hiddenMotivation: "Her best receptionist is threatening to quit",
      objections: ["We're doing fine", "Patients like calling us", "I tried software before and it was a mess"],
    },
    opener: "Hi, thanks for calling. I've got about 15 minutes. What did you want to cover?",
    winCondition: "The seller uncovers the no-show cost and the staff burnout without pitching too early, then agrees next steps.",
    tips: ["Ask open questions (what, how, why)", "Dig into the cost of the problem", "Summarize what you heard"],
  },
  {
    id: "objection-gym",
    title: "Membership objection gauntlet",
    category: "objections",
    industry: "Fitness",
    objective: "Handle back-to-back objections without getting defensive and still close.",
    product: "A 12-month gym membership at $59 a month",
    persona: {
      name: "Marcus Bell", gender: "male", look: { top: "shortCurly", skin: "614335", clothing: "hoodie", facialHair: null, age: "young" }, title: "Prospective member", company: "N/A",
      personality: "Interested but full of reasons not to buy",
      style: "Casual, throws a new objection every time one is handled",
      painPoints: ["Wants to get in shape for a wedding in 4 months"],
      goals: ["Lose 15 pounds"], budget: "Thinks $59 is a lot",
      timeline: "Wedding in 4 months", hiddenMotivation: "Scared he'll quit again like last time",
      objections: ["It's too expensive", "I need to think about it", "I can work out at home", "I tried a gym before and quit"],
    },
    opener: "Yeah, I'm just looking around. Honestly I'm not sure I'm ready to sign anything.",
    winCondition: "The seller handles objections with empathy, finds the fear of quitting, and closes.",
    tips: ["Acknowledge before answering", "Ask what's behind the objection", "Loop back to the close"],
  },
  {
    id: "demo-agency",
    title: "Demo to a marketing agency",
    category: "demo",
    industry: "Marketing",
    objective: "Run a demo that connects features to her stated needs, not a feature tour.",
    product: "ClipFlow, AI video editing for social media",
    persona: {
      name: "Sofia Alvarez", gender: "female", look: { top: "curvy", skin: "edb98a", hairColor: "4a312c", clothing: "blazerAndShirt", accessories: "round" }, title: "Creative Director", company: "Brightside Agency",
      personality: "Sharp, visual, gets bored by feature lists",
      style: "Interrupts with 'so what?' when something isn't relevant",
      painPoints: ["Editors spend 6 hours per client video", "Missing posting deadlines"],
      goals: ["Double output without hiring"], budget: "$1,000 a month for the team",
      timeline: "Pitching a big client in 3 weeks", hiddenMotivation: "Wants to impress the big client with volume",
      objections: ["Our editors won't like AI", "Will it match our brand style?", "We tried a tool like this"],
    },
    opener: "Okay, I've got the team waiting on me in 20 minutes. Show me what this does.",
    winCondition: "The seller ties features to her 6-hour editing pain and agrees a trial or next step.",
    tips: ["Confirm her goals before showing anything", "Show 2 features that solve her pain", "Ask for a trial start date"],
  },
  {
    id: "negotiation-renewal",
    title: "Renewal negotiation, 20% discount demand",
    category: "negotiation",
    industry: "Software",
    objective: "Protect price by trading value, not caving. Find a deal both sides accept.",
    product: "Annual renewal of a $48,000 analytics platform",
    persona: {
      name: "Greg Holloway", gender: "male", look: { top: "sides", skin: "ffdbb4", facialHair: "moustacheFancy", clothing: "blazerAndShirt", age: "senior" }, voice: { natural: "am_onyx", pitch: 0.8, rate: 0.95, detune: -100 }, title: "VP Finance", company: "Northwind Retail",
      personality: "Tough, numbers-first, bluffs about competitors",
      style: "Anchors hard, uses silence, tests if you'll fold",
      painPoints: ["CFO cut every vendor budget 15%"],
      goals: ["Show savings to the CFO"], budget: "Can go to $44,000 if he gets something extra",
      timeline: "Renewal date in 10 days", hiddenMotivation: "Switching vendors would cost his team months; he does not want to",
      objections: ["Your competitor quoted 25% less", "20% off or we walk", "We barely use half the features"],
    },
    opener: "Let's be direct. We need 20% off this renewal or we're moving to your competitor.",
    winCondition: "The seller holds most of the price, trades concessions for commitments, and reaches agreement at $44,000 or more.",
    tips: ["Don't give a discount for free", "Ask what's driving the number", "Trade: longer term or case study for price"],
  },
  {
    id: "closing-hesitant",
    title: "Close the hesitant buyer",
    category: "closing",
    industry: "Home services",
    objective: "Spot buying signals, handle the last concern, and ask for the sale.",
    product: "Solar panel installation, $14,000 after incentives",
    persona: {
      name: "Linda Park", gender: "female", look: { top: "bob", skin: "ffdbb4", hairColor: "2c1b18", clothing: "shirtScoopNeck" }, title: "Homeowner", company: "N/A",
      personality: "Likes the idea, nervous about commitment",
      style: "Polite, keeps saying 'it sounds great, but...'",
      painPoints: ["Electric bill is $280 a month"],
      goals: ["Lower bills", "Do something good for the planet"], budget: "Financing preferred",
      timeline: "Incentive expires end of month", hiddenMotivation: "Worried her husband will think she got scammed",
      objections: ["Let me talk to my husband", "What if it doesn't save what you say?", "Can I think about it?"],
    },
    opener: "This all sounds great, honestly. I'm just not sure about doing it right now.",
    winCondition: "The seller uncovers the husband concern, addresses it (e.g., a call with both), and gets a committed next step or signature.",
    tips: ["Listen for buying signals", "Ask what would make this a yes", "Ask a clear closing question"],
  },
  {
    id: "exec-cfo",
    title: "Executive buyer: 5 minutes with a CFO",
    category: "executive",
    industry: "Manufacturing",
    objective: "Speak in business outcomes, be concise, and earn a follow-up.",
    product: "A predictive maintenance platform",
    persona: {
      name: "Eleanor Voss", gender: "female", look: { top: "miaWallace", skin: "ffdbb4", hairColor: "b58143", clothing: "blazerAndShirt", age: "senior" }, voice: { natural: "bf_emma", pitch: 0.95, rate: 1.05, detune: -40 }, title: "CFO", company: "Voss Industrial",
      personality: "Brilliant, impatient, allergic to jargon",
      style: "Cuts off rambling, asks 'what's the ROI?'",
      painPoints: ["Unplanned downtime cost $2.1M last year"],
      goals: ["Protect margins"], budget: "Will fund anything with clear 12-month payback",
      timeline: "Board meeting next quarter", hiddenMotivation: "Wants a win to present to the board",
      objections: ["How do I know this works?", "I don't have time for a pilot", "What's the payback period?"],
    },
    opener: "You have five minutes. What's this about?",
    winCondition: "The seller frames value in dollars and payback, stays concise, and secures a follow-up with her team.",
    tips: ["Lead with the business outcome", "Use numbers", "Keep each answer under 20 seconds"],
  },
  {
    id: "technical-cto",
    title: "Technical buyer: security-minded CTO",
    category: "technical",
    industry: "Fintech",
    objective: "Answer technical concerns honestly, admit what you don't know, and propose a technical deep-dive.",
    product: "An API platform for identity verification",
    persona: {
      name: "Raj Mehta", gender: "male", look: { top: "shortFlat", skin: "d08b5b", facialHair: "beardMedium", clothing: "shirtCrewNeck", accessories: "prescription01" }, title: "CTO", company: "Ledgerline",
      personality: "Precise, skeptical, hates hand-waving",
      style: "Asks pointed questions about security, uptime, and integration",
      painPoints: ["Current vendor had two outages this quarter"],
      goals: ["99.99% uptime", "SOC 2 compliance"], budget: "Not his concern; CFO signs",
      timeline: "Contract with current vendor ends in 4 months", hiddenMotivation: "Burned by a vendor who overpromised",
      objections: ["How is data encrypted?", "What happens during your outages?", "Integration will take months"],
    },
    opener: "I'll be honest, I've heard a lot of sales pitches. What makes you different technically?",
    winCondition: "The seller stays honest, connects to the outage pain, and books a technical deep-dive with an engineer.",
    tips: ["Don't bluff", "Ask about his current setup", "Offer an engineer for the details"],
  },
  {
    id: "procurement-terms",
    title: "Procurement: terms and payment",
    category: "procurement",
    industry: "Education",
    objective: "Navigate procurement rules, payment terms, and paperwork without losing the deal.",
    product: "Classroom laptops, 200 units",
    persona: {
      name: "Theresa Nguyen", gender: "female", look: { top: "straightAndStrand", skin: "ffdbb4", hairColor: "2c1b18", clothing: "blazerAndSweater", accessories: "kurt" }, title: "Procurement Officer", company: "Lakeview School District",
      personality: "Process-driven, neutral, not swayed by hype",
      style: "Asks for documents, cites policy, wants net-60 terms",
      painPoints: ["Budget year ends in 6 weeks"],
      goals: ["Compliant purchase", "Best total cost"], budget: "$140,000 approved",
      timeline: "Must issue PO within 6 weeks", hiddenMotivation: "Will lose the funds if not spent this budget year",
      objections: ["We require net-60 payment terms", "Your quote is above another bid", "We need three references"],
    },
    opener: "I've reviewed your quote. Before we go further, there are some requirements we need to discuss.",
    winCondition: "The seller handles terms professionally, uses the deadline, and agrees on a path to a purchase order.",
    tips: ["Ask about the process and deadline", "Be flexible on terms, firm on value", "Confirm next steps in writing"],
  },
  {
    id: "gatekeeper-assistant",
    title: "Get past the gatekeeper",
    category: "gatekeeper",
    industry: "Real estate",
    objective: "Earn the assistant's help to reach the decision-maker.",
    product: "Property management software",
    persona: {
      name: "Kevin Osei", gender: "male", look: { top: "shortRound", skin: "614335", facialHair: null, clothing: "collarAndSweater", age: "young" }, title: "Executive Assistant", company: "Summit Properties",
      personality: "Protective, polite, trained to block salespeople",
      style: "Asks 'what is this regarding?' and 'is he expecting your call?'",
      painPoints: ["His boss complains about maintenance request chaos"],
      goals: ["Protect his boss's time"], budget: "Not his decision",
      timeline: "N/A", hiddenMotivation: "Would love a tool that stops tenants calling him about repairs",
      objections: ["He's not available", "Send it to info@", "Is he expecting your call?"],
    },
    opener: "Summit Properties, Mr. Lang's office. How can I help you?",
    winCondition: "The seller treats Kevin as an ally, finds his own pain, and gets a meeting or a warm transfer.",
    tips: ["Be respectful and honest", "Ask for his help", "Find what's in it for him"],
  },
];

export const SCENARIOS: Scenario[] = [...CORE, ...MORE];

/** Default voice when a scenario (e.g. a custom one) doesn't set one. Deeper, slower defaults sound more natural. */
export function voiceFor(p: Persona): VoiceProfile {
  if (p.voice) return p.voice;
  return p.gender === "female"
    ? { natural: "af_heart", pitch: 1.0, rate: 1.0, detune: 0 }
    : { natural: "am_fenrir", pitch: 0.82, rate: 0.98, detune: -100 };
}

export const findScenario = (id: string, custom: Scenario[] = []) =>
  [...SCENARIOS, ...custom].find((s) => s.id === id);

/** Deterministic daily pick so the daily challenge is the same all day. */
export function dailyScenario(date = new Date()): { scenario: Scenario; difficulty: Difficulty } {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const scenario = SCENARIOS[day % SCENARIOS.length];
  const difficulty = (["medium", "hard", "medium", "easy", "hard"] as Difficulty[])[day % 5];
  return { scenario, difficulty };
}
