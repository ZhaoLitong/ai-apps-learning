// ─────────────────────────────────────────────────────────────────────────────
// EMBEDDINGS — text → vector of numbers.
//
// An embedding model maps text onto a point in high-dimensional space such
// that texts with similar MEANING land near each other. "How do I reset my
// password?" and "I can't log into my account" end up close even though they
// share almost no words. That's the entire magic behind semantic search.
//
// Two properties matter downstream:
//  - DIMENSION: the vector's length. It must match the Postgres column
//    (config.embeddingDimensions) — we verify after every call.
//  - UNIT NORM (for OpenAI models): vectors have length 1, so cosine
//    similarity ≈ dot product ≈ what pgvector's <=> operator computes.
// ─────────────────────────────────────────────────────────────────────────────
import { embed, embedMany } from 'ai';
import { getEmbeddingModel } from './provider';
import { config } from '@/lib/config';

/** Embed one string. Returns a plain number[] ready for pgvector. */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
    ...embeddingOptions(),
  });
  assertDimensions(embedding);
  return embedding;
}

/**
 * Embed many strings in one call. The provider API accepts batches, so we
 * chunk the input — fewer HTTP round-trips than embedding one by one, without
 * hitting request-size limits. Used when ingesting documents.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_SIZE = 64;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const { embeddings } = await embedMany({
      model: getEmbeddingModel(),
      values: texts.slice(i, i + BATCH_SIZE),
      ...embeddingOptions(),
    });
    embeddings.forEach(assertDimensions);
    out.push(...embeddings);
  }
  return out;
}

/**
 * Per-call provider settings: ask OpenAI-style APIs to return vectors of
 * exactly the size our Postgres columns were created with. Providers that
 * don't support the `dimensions` parameter simply ignore it — the
 * assertDimensions check below is what actually enforces consistency.
 */
function embeddingOptions() {
  return {
    providerOptions: {
      openai: { dimensions: config.embeddingDimensions },
    },
  };
}

function assertDimensions(embedding: number[]): void {
  if (embedding.length !== config.embeddingDimensions) {
    throw new Error(
      `Embedding model returned ${embedding.length} dimensions but the database ` +
        `columns expect ${config.embeddingDimensions}. Set EMBEDDING_DIMENSIONS=` +
        `${embedding.length} in .env, then run "npm run db:push" and "npm run db:seed".`,
    );
  }
}
