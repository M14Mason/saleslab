// Question detection that works on raw speech-to-text (no punctuation, greetings in front).

const LEAD = /^(hey|hi|hello|so|and|but|okay|ok|well|um|uh|alright|right|now|also|yeah|sir|ma'?am|real quick|quick question)[,\s]+/i;
const STARTS = /^(what|what's|whats|how|how's|hows|why|when|where|who|which|tell me|walk me|describe|explain|help me understand|is|are|was|were|do|does|did|can|could|would|will|have|has|should|may|might|any|got)\b/i;
const INSIDE = /\b(how (is|are|was|did|do|does|would|about)|how's|what (is|are|do|does|did|would|if|about|kind)|what's|do you|are you|have you|can you|could you|would you|will you|did you|is it|is there|tell me|mind if|wondering)\b/i;

/** True if a sentence (from speech, maybe without "?") is a question. */
export function isQuestion(sentence: string): boolean {
  let s = sentence.trim();
  if (!s) return false;
  if (s.endsWith("?")) return true;
  for (let i = 0; i < 3 && LEAD.test(s); i++) s = s.replace(LEAD, "");
  return STARTS.test(s) || INSIDE.test(s);
}

/** Splits a turn into sentences and returns the questions (capped at 160 chars each). */
export function questionsIn(text: string): string[] {
  return text.split(/(?<=[?.!])\s+/).map((x) => x.trim()).filter(isQuestion).map((x) => x.slice(0, 160));
}
