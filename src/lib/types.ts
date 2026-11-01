// Types shared across server and client code — mostly the shapes of rows we
// stash in JSONB columns and return from API routes. Keeping them here avoids
// circular imports (e.g. schema.ts ↔ evals/runner.ts).

/** A tool call (with its result) persisted on an assistant message row. */
export interface ToolCallSummary {
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

/** One chunk returned by vector search. `similarity` is 0..1 (higher = closer). */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

/**
 * What the `searchKnowledgeBase` tool returns to the model. `index` is 1-based
 * so the model can cite sources in its answer as [1], [2]...
 */
export type SearchResult = RetrievedChunk & { index: number };

// ── Evals ────────────────────────────────────────────────────────────────────

export interface EvalCase {
  id: string;
  question: string;
  /** If set, the eval asserts this doc title appears in retrieved chunks. */
  expectedDocument?: string;
  /** Case-insensitive substrings the final answer must include. */
  mustContain?: string[];
  /** Natural-language rubric handed to the LLM judge. */
  criteria: string;
}

export interface EvalDataset {
  name: string;
  description: string;
  cases: EvalCase[];
}

export interface EvalCaseResult {
  id: string;
  question: string;
  /** null when the case has no expectedDocument (nothing to check). */
  retrievalHit: boolean | null;
  mustContainPassed: number;
  mustContainTotal: number;
  /** 0..1 (judge score/10). null when judging failed. */
  judgeScore: number | null;
  judgeRationale: string;
  answer: string;
  sources: { title: string; similarity: number }[];
  latencyMs: number;
  error?: string;
}

export interface EvalSummary {
  caseCount: number;
  avgJudgeScore: number | null;
  retrievalHitRate: number | null;
  mustContainRate: number | null;
  durationMs: number;
}
