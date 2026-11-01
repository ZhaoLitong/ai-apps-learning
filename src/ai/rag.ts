// ─────────────────────────────────────────────────────────────────────────────
// RAG — Retrieval-Augmented Generation, the core loop of this app:
//
//   ingest:   document → chunkText() → embedTexts() → Postgres (chunks table)
//   retrieve: query → embed → ORDER BY embedding <=> query_vec LIMIT k
//
// `<=>` is pgvector's COSINE DISTANCE: 0 = identical direction, 2 = opposite.
// Similarity (what we show humans) is just 1 − distance. The ORDER BY + LIMIT
// does an exact nearest-neighbor scan; with the HNSW index (created in the
// seed script) Postgres uses approximate search that stays fast at millions
// of chunks.
//
// Notice this file contains no LLM calls — retrieval is pure database work.
// The model only sees the results, injected by tools.ts / prompts.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { chunks, documents } from '@/db/schema';
import { embedTexts } from './embeddings';
import { chunkText } from './chunking';
import { config } from '@/lib/config';
import type { RetrievedChunk } from '@/lib/types';

/** How many texts to embed per provider request during ingestion. */
const EMBED_BATCH = 64;

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

/**
 * Store a document: chunk it, embed every chunk, insert everything.
 * One document → N chunk rows, all pointing back at the original.
 */
export async function ingestDocument(input: {
  title: string;
  content: string;
  source?: string;
}): Promise<IngestResult> {
  const pieces = chunkText(input.content);
  if (pieces.length === 0) {
    throw new Error('Document is empty after chunking — nothing to store.');
  }

  const [doc] = await db
    .insert(documents)
    .values({ title: input.title, content: input.content, source: input.source ?? 'manual' })
    .returning({ id: documents.id });

  // Embed in batches, inserting each batch as it completes. For bigger
  // corpora you'd wrap doc+chunks in a transaction so a failure can't leave
  // a half-ingested document behind.
  for (let i = 0; i < pieces.length; i += EMBED_BATCH) {
    const batch = pieces.slice(i, i + EMBED_BATCH);
    const embeddings = await embedTexts(batch.map((p) => p.content));
    await db.insert(chunks).values(
      batch.map((piece, j) => ({
        documentId: doc.id,
        chunkIndex: piece.index,
        content: piece.content,
        tokenEstimate: piece.tokenEstimate,
        embedding: embeddings[j],
      })),
    );
  }

  return { documentId: doc.id, chunkCount: pieces.length };
}

export interface RetrieveOptions {
  topK?: number;
  minSimilarity?: number;
}

/**
 * The retrieval half of RAG: embed the query, find the nearest chunks.
 * Returns chunks sorted best-first, with similarity for the UI and evals.
 */
export async function retrieveContext(
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? config.retrievalTopK;
  const minSimilarity = options.minSimilarity ?? config.retrievalMinSimilarity;

  const [queryEmbedding] = await embedTexts([query]);
  // pgvector accepts a textual vector literal like '[0.1,0.2,...]'. The value
  // is still parameterized ($1) — drizzle's sql template does that — the
  // ::vector cast tells Postgres how to parse it.
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const result = await db.execute(sql`
    SELECT c.id           AS chunk_id,
           c.content,
           c.chunk_index,
           d.id           AS document_id,
           d.title        AS document_title,
           c.embedding <=> ${vectorLiteral}::vector AS distance
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `);

  const rows = result.rows as unknown as {
    chunk_id: string;
    content: string;
    chunk_index: number;
    document_id: string;
    document_title: string;
    distance: string | number;
  }[];

  return rows
    .map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      documentTitle: r.document_title,
      chunkIndex: Number(r.chunk_index),
      content: r.content,
      similarity: 1 - Number(r.distance),
    }))
    // Drop anything the model would find irrelevant anyway. This trades
    // "always exactly topK results" for "never show junk" — usually right,
    // but if your corpus is tiny you might lower the floor.
    .filter((r) => r.similarity >= minSimilarity);
}

/** Deleting the document cascades to its chunks (FK onDelete: 'cascade'). */
export async function deleteDocument(id: string): Promise<void> {
  await db.delete(documents).where(eq(documents.id, id));
}

/**
 * Everything the /documents page shows: documents with their chunks inline.
 * Two queries + a JS group-by (not N+1 per-document queries). At learning
 * scale this is fine; at real scale you'd paginate.
 */
export async function listDocumentsWithChunks() {
  const docs = await db.select().from(documents).orderBy(desc(documents.createdAt));
  const allChunks = await db
    .select({
      id: chunks.id,
      documentId: chunks.documentId,
      chunkIndex: chunks.chunkIndex,
      content: chunks.content,
      tokenEstimate: chunks.tokenEstimate,
    })
    .from(chunks)
    .orderBy(asc(chunks.chunkIndex));

  return docs.map((doc) => ({
    ...doc,
    chunks: allChunks.filter((c) => c.documentId === doc.id),
  }));
}
