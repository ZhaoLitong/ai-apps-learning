// ─────────────────────────────────────────────────────────────────────────────
// THE EVAL RUNNER — the app's regression test suite.
//
// For every case in a dataset it runs the SAME pipeline a real user hits
// (retrieval, memories, tools, generation) and then checks the result three
// complementary ways:
//
//   1. RETRIEVAL HIT — did vector search surface the right document?
//      (measures the retriever, independent of the model)
//   2. MUST-CONTAIN  — deterministic substrings the answer must include.
//      (cheap, stable, but shallow)
//   3. LLM JUDGE     — rubric-based quality score. (deep, but noisy —
//      trust trends across runs, not single scores)
//
// Everything is persisted to eval_runs so the /evals page can graph regressions.
// Run it with `npm run eval` or POST /api/evals.
// ─────────────────────────────────────────────────────────────────────────────
import { generateText, stepCountIs } from 'ai';
import { db } from '@/db';
import { evalRuns } from '@/db/schema';
import { retrieveContext } from '@/ai/rag';
import { retrieveRelevantMemories } from '@/ai/memory';
import { createTools } from '@/ai/tools';
import { buildSystemPrompt } from '@/ai/prompts';
import { getChatModel } from '@/ai/provider';
import { judgeAnswer } from './judge';
import learningBasics from './datasets/learning-basics.json';
import { isConfigured } from '@/lib/config';
import type { EvalCaseResult, EvalDataset, EvalSummary } from '@/lib/types';

// Register datasets here; adding one = a new JSON file + one import.
export const DATASETS: Record<string, EvalDataset> = {
  'learning-basics': learningBasics as unknown as EvalDataset,
};

export async function runEvals(datasetName = 'learning-basics') {
  const dataset = DATASETS[datasetName];
  if (!dataset) {
    throw new Error(`Unknown dataset "${datasetName}". Available: ${Object.keys(DATASETS).join(', ')}`);
  }
  if (!isConfigured()) {
    // Fail fast: every case would error anyway, and recording a run of all
    // failures would pollute the run history with meaningless zeros.
    throw new Error('No LLM API key configured — set OPENAI_API_KEY in .env first.');
  }

  const startedAtMs = Date.now();
  const caseResults: EvalCaseResult[] = [];

  for (const evalCase of dataset.cases) {
    const caseStartedAt = Date.now();
    process.stdout.write(`  · ${evalCase.id} … `);
    try {
      // Check 1: does the RETRIEVER find the expected document on its own?
      let retrievalHit: boolean | null = null;
      let sources: { title: string; similarity: number }[] = [];
      if (evalCase.expectedDocument) {
        const chunks = await retrieveContext(evalCase.question, { topK: 5 });
        sources = chunks.map((c) => ({ title: c.documentTitle, similarity: c.similarity }));
        retrievalHit = chunks.some((c) =>
          c.documentTitle.toLowerCase().includes(evalCase.expectedDocument!.toLowerCase()),
        );
      }

      // Generate an answer through the same pipeline as /chat — memories
      // included, tools enabled — because we're evaluating production
      // behavior, not a special eval-only mode.
      const memories = await retrieveRelevantMemories(evalCase.question).catch(() => []);
      const { text } = await generateText({
        model: getChatModel(),
        system: buildSystemPrompt({ memories: memories.map((m) => m.content) }),
        prompt: evalCase.question,
        tools: createTools(), // no tracer — evals record themselves in eval_runs
        stopWhen: stepCountIs(6),
      });

      // Check 2: deterministic must-contain substrings (case-insensitive).
      const lowerAnswer = text.toLowerCase();
      const required = evalCase.mustContain ?? [];
      const mustContainPassed = required.filter((needle) =>
        lowerAnswer.includes(needle.toLowerCase()),
      ).length;

      // Check 3: the judge.
      const judge = await judgeAnswer({
        question: evalCase.question,
        answer: text,
        criteria: evalCase.criteria,
      });

      caseResults.push({
        id: evalCase.id,
        question: evalCase.question,
        retrievalHit,
        mustContainPassed,
        mustContainTotal: required.length,
        judgeScore: judge.score,
        judgeRationale: judge.rationale,
        answer: text,
        sources,
        latencyMs: Date.now() - caseStartedAt,
      });
      console.log(
        `judge=${judge.score != null ? (judge.score * 10).toFixed(1) : 'n/a'}` +
          `${retrievalHit != null ? ` retrieval=${retrievalHit ? '✓' : '✗'}` : ''}` +
          ` (${Date.now() - caseStartedAt}ms)`,
      );
    } catch (error) {
      // One broken case shouldn't kill the run — record and continue.
      const message = error instanceof Error ? error.message : String(error);
      caseResults.push({
        id: evalCase.id,
        question: evalCase.question,
        retrievalHit: null,
        mustContainPassed: 0,
        mustContainTotal: evalCase.mustContain?.length ?? 0,
        judgeScore: null,
        judgeRationale: '',
        answer: '',
        sources: [],
        latencyMs: Date.now() - caseStartedAt,
        error: message,
      });
      console.log(`ERROR: ${message}`);
    }
  }

  // Aggregate. Each rate only averages over the cases where the check applied
  // (null judge scores and non-applicable retrieval checks are excluded).
  const judged = caseResults.filter((c) => c.judgeScore != null);
  const retrievalCases = caseResults.filter((c) => c.retrievalHit !== null);
  const containCases = caseResults.filter((c) => c.mustContainTotal > 0);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const summary: EvalSummary = {
    caseCount: caseResults.length,
    avgJudgeScore: avg(judged.map((c) => c.judgeScore!)),
    retrievalHitRate: avg(retrievalCases.map((c) => (c.retrievalHit ? 1 : 0))),
    mustContainRate: avg(containCases.map((c) => c.mustContainPassed / c.mustContainTotal)),
    durationMs: Date.now() - startedAtMs,
  };

  const [run] = await db
    .insert(evalRuns)
    .values({
      datasetName,
      durationMs: summary.durationMs,
      summary,
      cases: caseResults,
      startedAt: new Date(startedAtMs),
    })
    .returning({ id: evalRuns.id });

  return { id: run.id, datasetName, summary, cases: caseResults };
}
