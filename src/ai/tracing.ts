// ─────────────────────────────────────────────────────────────────────────────
// TRACING — observability for LLM apps.
//
// You cannot debug what you cannot see, and LLM requests are non-deterministic,
// multi-step, and cost money per step. The vocabulary (borrowed from
// OpenTelemetry / LangSmith / Langfuse):
//
//   TRACE  = one request's entire journey       → `traces` row
//   SPAN   = one timed unit of work within it   → `spans` row
//            (embedding, memory lookup, tool call, the LLM call itself)
//
// Every span records: name, kind, structured input/output, status, duration.
// The /traces page renders this. Production systems export the same shape to
// OpenTelemetry collectors or Langfuse; the concepts transfer 1:1.
//
// THE GOLDEN RULE implemented here: instrumentation must never break the
// app. Every DB write in this file is wrapped so a tracing failure can't
// take down a chat response.
// ─────────────────────────────────────────────────────────────────────────────
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { spans, traces } from '@/db/schema';
import { config } from '@/lib/config';

export type SpanKind = 'llm' | 'retrieval' | 'tool' | 'memory';

export interface RecordSpanInput {
  name: string;
  kind: SpanKind;
  input: unknown;
  output: unknown;
  startedAtMs: number;
  durationMs: number;
  status?: 'ok' | 'error';
  error?: string;
}

/** Keep JSONB payloads sane: truncate long strings, cap giant arrays. */
function truncateDeep(value: unknown, maxStringLength = 2000, depth = 0): unknown {
  if (depth > 6) return '[max depth]';
  if (typeof value === 'string') {
    return value.length <= maxStringLength
      ? value
      : `${value.slice(0, maxStringLength)}… (+${value.length - maxStringLength} chars)`;
  }
  if (Array.isArray(value)) {
    const mapped = value.slice(0, 50).map((v) => truncateDeep(v, maxStringLength, depth + 1));
    return value.length > 50 ? [...mapped, `… (+${value.length - 50} items)`] : mapped;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, truncateDeep(v, maxStringLength, depth + 1)]),
    );
  }
  return value;
}

export class Tracer {
  private constructor(readonly traceId: string) {}

  /** Creates the trace row for one chat request. */
  static async start(conversationId: string, meta: Record<string, unknown>): Promise<Tracer> {
    try {
      const [row] = await db
        .insert(traces)
        .values({ conversationId, model: config.chatModel, usage: null })
        .returning({ id: traces.id });
      const tracer = new Tracer(row.id);
      await tracer.record({
        name: 'chat.request',
        kind: 'llm',
        input: meta,
        output: null,
        startedAtMs: Date.now(),
        durationMs: 0,
      });
      return tracer;
    } catch (error) {
      // Observability failing to START must not fail the request either.
      console.error('[tracer] failed to start trace', error);
      // A tracer with an empty id still works — every write is no-op'd.
      return new Tracer('');
    }
  }

  /**
   * Time an async unit of work and record it as a span. Usage:
   *   const result = await tracer.span('memory.retrieve', 'retrieval', { query }, () => retrieve(query));
   */
  async span<T>(
    name: string,
    kind: SpanKind,
    input: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startedAtMs = Date.now();
    try {
      const output = await fn();
      await this.record({
        name,
        kind,
        input,
        output,
        startedAtMs,
        durationMs: Date.now() - startedAtMs,
        status: 'ok',
      });
      return output;
    } catch (error) {
      await this.record({
        name,
        kind,
        input,
        output: null,
        startedAtMs,
        durationMs: Date.now() - startedAtMs,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // rethrow — tracing observes failures, it doesn't swallow them
    }
  }

  /** Record a span for work that already happened (e.g. the streamed LLM call). */
  async record(input: RecordSpanInput): Promise<void> {
    if (!this.traceId) return; // no-op tracer (trace failed to start)
    try {
      await db.insert(spans).values({
        traceId: this.traceId,
        name: input.name,
        kind: input.kind,
        status: input.status ?? 'ok',
        input: truncateDeep(input.input) as never,
        output: truncateDeep(input.output) as never,
        error: input.error,
        startedAt: new Date(input.startedAtMs),
        durationMs: Math.max(0, Math.round(input.durationMs)),
      });
    } catch (error) {
      console.error('[tracer] failed to record span', error);
    }
  }

  /** Close the trace with totals. */
  async finish(data: {
    usage?: { inputTokens: number; outputTokens: number } | null;
    finishReason?: string | null;
    error?: string | null;
    startedAtMs: number;
  }): Promise<void> {
    if (!this.traceId) return;
    try {
      await db
        .update(traces)
        .set({
          durationMs: Math.max(0, Date.now() - data.startedAtMs),
          usage: data.usage ?? null,
          finishReason: data.finishReason ?? null,
          error: data.error ?? null,
        })
        .where(eq(traces.id, this.traceId));
    } catch (error) {
      console.error('[tracer] failed to finish trace', error);
    }
  }
}
