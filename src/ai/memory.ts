// ─────────────────────────────────────────────────────────────────────────────
// MEMORY — how the assistant "remembers" across conversations.
//
// Chat models are amnesiacs: every request starts from a blank slate, and
// "memory" is just state you re-inject into the prompt. This app implements
// long-term semantic memory with TWO write paths, which is itself the lesson:
//
//   1. AUTO-EXTRACTION (below, extractMemoriesFromExchange): after each
//      exchange a cheap LLM call asks "any durable facts here?" — passive,
//      catches things users never think to save, but can extract junk.
//
//   2. EXPLICIT TOOL (the `rememberFact` tool in tools.ts): the model writes
//      memory when the user says "remember that..." — precise, user-intended,
//      but only fires when the user thinks of it.
//
// The READ path is the same for both: embed the user's new message, take the
// top-k most similar memories (retrieveRelevantMemories), and inject them
// into the system prompt (prompts.ts). Memory retrieval IS vector search —
// identical machinery to RAG, different table.
//
// Production systems add: recency/importance scoring, forgetting/decay,
// consolidation (merging duplicates), and user-facing memory editing.
// ─────────────────────────────────────────────────────────────────────────────
import { desc, eq, sql } from 'drizzle-orm';
import { generateText } from 'ai';
import { db } from '@/db';
import { memories } from '@/db/schema';
import { embedText, embedTexts } from './embeddings';
import { getSmallModel } from './provider';
import { config } from '@/lib/config';

export type MemorySource = 'auto' | 'tool' | 'manual';

/** Write one memory (deduplicated on exact text). Used by all three sources. */
export async function rememberFact(fact: string, source: MemorySource = 'manual') {
  const content = fact.trim().slice(0, 500);
  if (!content) throw new Error('Memory content is empty');

  // Exact-match dedupe. Cheaper than vector dedupe; near-duplicates are left
  // as an exercise (embed + cosine threshold on insert).
  const existing = await db
    .select({ id: memories.id })
    .from(memories)
    .where(eq(memories.content, content))
    .limit(1);
  if (existing.length > 0) return { id: existing[0].id, duplicate: true as const };

  const embedding = await embedText(content);
  const [row] = await db
    .insert(memories)
    .values({ content, source, embedding })
    .returning({ id: memories.id });
  return { id: row.id, duplicate: false as const };
}

export interface RetrievedMemory {
  id: string;
  content: string;
  source: string;
  similarity: number;
}

/** Top-k memories similar to the query — the read path for the system prompt. */
export async function retrieveRelevantMemories(
  query: string,
  options: { topK?: number; minSimilarity?: number } = {},
): Promise<RetrievedMemory[]> {
  const topK = options.topK ?? config.memoryTopK;
  const minSimilarity = options.minSimilarity ?? 0.25;

  const [queryEmbedding] = await embedTexts([query]);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const result = await db.execute(sql`
    SELECT id, content, source,
           embedding <=> ${vectorLiteral}::vector AS distance
    FROM memories
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `);

  const rows = result.rows as unknown as {
    id: string;
    content: string;
    source: string;
    distance: string | number;
  }[];

  return rows
    .map((r) => ({
      id: r.id,
      content: r.content,
      source: r.source,
      similarity: 1 - Number(r.distance),
    }))
    .filter((m) => m.similarity >= minSimilarity);
}

// The extraction prompt is where memory quality is won or lost. The rules
// ("durable", "not transient") exist to keep the table from filling with
// restatements of whatever was just said.
const EXTRACTION_SYSTEM = `You extract durable memories from a conversation exchange.

Return a JSON array of short memory strings (max 20 words each, max 3 items).
Include ONLY stable, reusable facts: who the user is, their goals, preferences,
or standing project constraints. Do NOT include transient details, questions,
answer content, or anything only relevant to this conversation.
If there is nothing worth remembering, return [].`;

/**
 * Post-exchange extraction (write path #1). Runs after every assistant turn —
 * failures are caught by the caller so chat never breaks because memory did.
 */
export async function extractMemoriesFromExchange(
  userText: string,
  assistantText: string,
): Promise<string[]> {
  const { text } = await generateText({
    model: getSmallModel(),
    system: EXTRACTION_SYSTEM,
    prompt: `User said:\n${userText.slice(0, 2000)}\n\nAssistant replied:\n${assistantText.slice(0, 2000)}`,
  });

  const facts = parseStringArray(text).slice(0, 3);
  for (const fact of facts) {
    await rememberFact(fact, 'auto');
  }
  return facts;
}

/** Tolerant JSON parsing: models wrap arrays in prose or code fences. */
function parseStringArray(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export async function listMemories() {
  return db.select().from(memories).orderBy(desc(memories.createdAt)).limit(200);
}

export async function deleteMemory(id: string) {
  await db.delete(memories).where(eq(memories.id, id));
}

export async function clearMemories() {
  await db.delete(memories);
}
