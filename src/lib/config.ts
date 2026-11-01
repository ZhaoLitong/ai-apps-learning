// ─────────────────────────────────────────────────────────────────────────────
// Central runtime configuration (a.k.a. "the 12-factor bit").
//
// Every environment variable this app reads is parsed here, ONCE, into a typed
// object. Nothing else in the codebase touches process.env directly. Why?
//  - You can grep one file to see every knob the app has.
//  - Missing/invalid config fails loudly at startup instead of mysteriously
//    mid-request.
//  - Tests and scripts can import `config` without mocking process.env.
// ─────────────────────────────────────────────────────────────────────────────

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  // Any OpenAI-compatible key works (OpenAI, Zhipu GLM, DeepSeek, Ollama...).
  // Leave empty and the app still boots — every LLM call site fails with a
  // friendly message instead (see assertConfigured below).
  apiKey: process.env.OPENAI_API_KEY ?? '',
  // Optional base-URL override so you can point at a compatible provider.
  baseUrl: process.env.OPENAI_BASE_URL ?? '',

  chatModel: process.env.AI_CHAT_MODEL ?? 'gpt-4o-mini',
  // A cheaper/faster model for auxiliary LLM calls (memory extraction, eval
  // judging). Separating "frontier" from "utility" model calls is a real
  // production cost pattern.
  smallModel: process.env.AI_SMALL_MODEL ?? process.env.AI_CHAT_MODEL ?? 'gpt-4o-mini',
  embeddingModel: process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small',

  // Vector length of the embedding model. This MUST agree with the
  // `chunks.embedding` / `memories.embedding` column dimensions in
  // src/db/schema.ts — pgvector enforces it, and changing one side requires
  // re-pushing the schema and re-embedding your data.
  embeddingDimensions: num(process.env.EMBEDDING_DIMENSIONS, 1536),

  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/ai_learning',

  // ── RAG knobs (tune these in the "exercises" and watch quality change) ────
  // Max size of one chunk, in *estimated* tokens (see src/ai/chunking.ts for
  // why "estimated"). 400 tokens ≈ a few solid paragraphs.
  chunkMaxTokens: 400,
  // How much consecutive chunks overlap. Overlap prevents an answer that
  // straddles a chunk boundary from losing its context.
  chunkOverlapTokens: 80,
  // How many chunks to retrieve per search. More = more context but more
  // noise + tokens. 4-8 is the usual sweet spot for small corpora.
  retrievalTopK: 4,
  // Cosine similarity floor (0-1). Below this, a chunk is considered
  // irrelevant and dropped rather than shown to the model.
  retrievalMinSimilarity: 0.2,
  // How many long-term memories to inject into the system prompt per turn.
  memoryTopK: 3,
} as const;

/** True when an LLM provider key is present. Used by the home page banner. */
export function isConfigured(): boolean {
  return config.apiKey.length > 0;
}

/**
 * Call at the edge of every LLM-touching entrypoint. Throws a message that
 * tells the *user of the app* what to do — a 401 from OpenAI saying
 * "Incorrect API key" is much less helpful than this.
 */
export function assertConfigured(): void {
  if (!config.apiKey) {
    throw new Error(
      'No LLM API key configured. Copy .env.example to .env and set OPENAI_API_KEY ' +
        '(any OpenAI-compatible provider works — see the table in README.md). ' +
        'Then restart `npm run dev`.',
    );
  }
}
