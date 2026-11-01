// ─────────────────────────────────────────────────────────────────────────────
// THE DATABASE SCHEMA — read this file before any other.
//
// Every feature of the app maps to tables here:
//
//   documents / chunks   → RAG: source docs, split into embedded chunks
//   memories             → long-term memory, also vector-embedded
//   messages             → chat history (survives page reloads; the UI is
//                          session-scoped, so this is the durable record)
//   traces / spans       → observability: one trace per chat request, one span
//                          per step inside it (retrieval, tool call, LLM call...)
//   eval_runs            → output of `npm run eval`, viewable in the /evals UI
//
// Drizzle ORM gives us typed tables (schema-as-TypeScript) and a query builder.
// `npm run db:push` turns this file into real SQL DDL.
//
// NOTE: this file imports config with a RELATIVE path (not `@/lib/config`)
// because drizzle-kit's loader is not guaranteed to resolve tsconfig paths.
// ─────────────────────────────────────────────────────────────────────────────
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import type { EvalCaseResult, EvalSummary, ToolCallSummary } from '../lib/types';
import { config } from '../lib/config';

// ── RAG: documents and their chunks ──────────────────────────────────────────
// We keep the ORIGINAL full text in documents (for display + re-chunking) and
// the retrievable pieces in chunks. The embedding lives on the chunk, because
// "what gets embedded" and "what gets retrieved" must be the same granularity.

export const documents = pgTable('documents', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  // Where the doc came from: 'seed', 'manual' (pasted), or a filename.
  source: text().notNull().default('manual'),
  content: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  'chunks',
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    // Position of this chunk within its document (0-based).
    chunkIndex: integer('chunk_index').notNull(),
    content: text().notNull(),
    // Cheap char-based estimate, kept so the UI can show chunk sizes without
    // re-tokenizing. Real token counts come from the provider API.
    tokenEstimate: integer('token_estimate').notNull(),
    // The vector. Dimensions are FROZEN at schema-push time — that's why they
    // come from config and why changing embedding models needs a re-push.
    embedding: vector('embedding', { dimensions: config.embeddingDimensions }).notNull(),
  },
  (t) => [
    index('chunks_document_idx').on(t.documentId),
    // Similarity search below ~100k chunks would still work without this, but
    // an HNSW index keeps it fast at scale. Created in scripts/seed.ts via raw
    // SQL because drizzle-kit's push doesn't create HNSW indexes (yet).
    //   ORDER BY embedding <=> $query  will use it automatically.
  ],
);

// ── Long-term memory ─────────────────────────────────────────────────────────
// Written two ways (see src/ai/memory.ts): automatically extracted after each
// exchange, or explicitly via the `rememberFact` tool. Read one way: top-k by
// cosine similarity to the user's message, injected into the system prompt.

export const memories = pgTable('memories', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull(),
  // 'fact' for now — the column exists so you can add kinds like
  // 'preference' or 'goal' as an exercise.
  kind: text().notNull().default('fact'),
  // 'auto' (extraction) | 'tool' (model called rememberFact) | 'manual' (UI).
  source: text().notNull().default('manual'),
  embedding: vector('embedding', { dimensions: config.embeddingDimensions }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Chat history ─────────────────────────────────────────────────────────────
// conversationId is TEXT (not a FK) on purpose: the browser generates it
// per-session and the server never needs to look conversations up by key for
// this app. Building a conversations list page is a suggested exercise.

export const messages = pgTable(
  'messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: text('conversation_id').notNull(),
    role: text().notNull(), // 'user' | 'assistant'
    content: text().notNull(),
    // Assistant messages carry their tool calls + results for inspection.
    toolCalls: jsonb('tool_calls').$type<ToolCallSummary[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId)],
);

// ── Observability: traces and spans ──────────────────────────────────────────
// The vocabulary comes from distributed tracing (OpenTelemetry):
//   trace = one request's whole journey through the system
//   span  = one timed unit of work inside it, with structured input/output
// We keep a flat list of spans per trace; parentSpanId exists so you can
// upgrade this to a real tree as an exercise.

export const traces = pgTable('traces', {
  id: uuid().primaryKey().defaultRandom(),
  conversationId: text('conversation_id').notNull(),
  model: text().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  durationMs: integer('duration_ms'),
  finishReason: text('finish_reason'), // 'stop' | 'tool-calls' | ...
  usage: jsonb('usage').$type<{ inputTokens: number; outputTokens: number } | null>(),
  error: text(),
});

export const spans = pgTable(
  'spans',
  {
    id: uuid().primaryKey().defaultRandom(),
    traceId: uuid('trace_id')
      .notNull()
      .references(() => traces.id, { onDelete: 'cascade' }),
    parentSpanId: uuid('parent_span_id'),
    // 'llm' | 'retrieval' | 'tool' | 'memory'
    kind: text().notNull(),
    name: text().notNull(),
    status: text().notNull().default('ok'), // 'ok' | 'error'
    input: jsonb('input'),
    output: jsonb('output'),
    error: text(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer('duration_ms').notNull(),
  },
  (t) => [index('spans_trace_idx').on(t.traceId)],
);

// ── Evals ────────────────────────────────────────────────────────────────────
// Each `npm run eval` (or POST /api/evals) writes one row: a summary plus the
// per-case details, so you can compare runs over time — that's regression
// testing for prompts.

export const evalRuns = pgTable('eval_runs', {
  id: uuid().primaryKey().defaultRandom(),
  datasetName: text('dataset_name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  durationMs: integer('duration_ms').notNull(),
  summary: jsonb('summary').$type<EvalSummary>().notNull(),
  cases: jsonb('cases').$type<EvalCaseResult[]>().notNull(),
});

// drizzle-kit needs at least one statement-shaped export to be happy when the
// schema file is scanned; `sql` is imported for exactly this kind of future
// raw-SQL usage. Keep it referenced so linters don't strip it.
void sql;
