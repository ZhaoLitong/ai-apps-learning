// ─────────────────────────────────────────────────────────────────────────────
// LLM-AS-JUDGE — grading answers with a second LLM call.
//
// Deterministic checks (must-contain, retrieval hits) are cheap and reliable
// but shallow: an answer can include every keyword and still be wrong or
// unreadable. A judge model scores free-form quality against a natural-
// language rubric instead.
//
// Known biases to respect (see README "Going further"):
//  - verbosity bias (longer answers score higher),
//  - self-preference (a model rates its own style higher),
//  - score drift between runs → never trust ONE run, compare runs over time.
// Serious setups add anchored rubrics ("9 = ...", "5 = ..."), pairwise
// comparisons, and human spot-checks.
// ─────────────────────────────────────────────────────────────────────────────
import { generateText } from 'ai';
import { getSmallModel } from '../provider';

export interface JudgeVerdict {
  /** 0..10, or null when the judge's output couldn't be parsed. */
  score: number | null;
  rationale: string;
}

const JUDGE_SYSTEM = `You are a strict but fair grader of AI assistant answers.

Score the ANSWER against the CRITERIA for the QUESTION:
- 9-10: excellent — accurate, complete for the criteria, clearly explained
- 7-8:  good — correct and useful, minor gaps in clarity or completeness
- 5-6:  mixed — partially correct, notable gaps or vagueness
- 1-4:  poor — mostly wrong, off-topic, or fails the criteria
- 0:    no answer / completely wrong

Judge ONLY what the criteria ask for. Do not penalize brevity.

Respond with ONLY this JSON, nothing else:
{"score": <integer 0-10>, "rationale": "<one or two sentences>"} `;

export async function judgeAnswer(input: {
  question: string;
  answer: string;
  criteria: string;
}): Promise<JudgeVerdict> {
  const { text } = await generateText({
    model: getSmallModel(),
    system: JUDGE_SYSTEM,
    prompt: `QUESTION:\n${input.question}\n\nCRITERIA:\n${input.criteria}\n\nANSWER:\n${input.answer}`,
  });

  // Models occasionally wrap JSON in prose or code fences — extract the
  // outermost {...} block and parse that. A judge that fails to parse is
  // recorded as score=null (excluded from averages) rather than a 0, so a
  // parsing hiccup doesn't masquerade as a bad answer.
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { score?: unknown; rationale?: unknown };
      const score = Number(parsed.score);
      if (Number.isFinite(score)) {
        return {
          score: Math.min(10, Math.max(0, score)) / 10,
          rationale: String(parsed.rationale ?? ''),
        };
      }
    } catch {
      // fall through to the failure verdict below
    }
  }
  return { score: null, rationale: `Judge output could not be parsed: ${text.slice(0, 200)}` };
}
