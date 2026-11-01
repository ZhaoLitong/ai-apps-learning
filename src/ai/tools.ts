// ─────────────────────────────────────────────────────────────────────────────
// TOOLS — how a model reaches outside its own weights.
//
// A tool is: a NAME + DESCRIPTION the model reads, an input SCHEMA it must
// fill, and an EXECUTE function the app runs. The model never runs code — it
// only emits "call searchKnowledgeBase with {query: ...}". The AI SDK:
//   1. sends the tool specs with the request,
//   2. parses the model's tool call against the schema (type-safe inputs!),
//   3. runs your execute function,
//   4. feeds the result back so the model can continue
// — looping up to `stopWhen` steps (set in the chat route; the default is ONE
// step, which would end the turn right after the first tool call).
//
// The DESCRIPTION is prompt engineering: it's how the model decides WHEN to
// use the tool. Vague descriptions cause missed calls; over-broad ones cause
// the model to call tools instead of answering. Tweak one and watch behavior
// change — that's the exercise.
// ─────────────────────────────────────────────────────────────────────────────
import { tool } from 'ai';
import { z } from 'zod';
import { retrieveContext } from './rag';
import { rememberFact } from './memory';
import type { Tracer } from './tracing';
import type { SearchResult } from '@/lib/types';

/**
 * Tools are built per-request so they can record spans into that request's
 * trace (dependency injection — also makes them easy to test without a DB).
 * Call with no args anywhere tracing isn't needed (the eval runner).
 */
export function createTools(deps: { tracer?: Tracer } = {}) {
  // Runs fn directly when there's no tracer; otherwise wraps it in a span.
  const withSpan = async <T>(
    name: string,
    kind: 'tool' | 'memory',
    input: unknown,
    fn: () => Promise<T>,
  ): Promise<T> => (deps.tracer ? deps.tracer.span(name, kind, input, fn) : fn());

  return {
    // ── AGENTIC RAG ────────────────────────────────────────────────────────
    // Instead of always stuffing retrieved text into the prompt, the MODEL
    // decides when to search. Upside: no wasted retrieval on small talk, and
    // it can search multiple times with refined queries. Downside: it can
    // forget to search — hence the forceful description.
    searchKnowledgeBase: tool({
      description:
        'Search the knowledge base of AI-engineering reference documents (RAG, embeddings, ' +
        'chunking, tool calling, memory, observability, evals). You MUST use this tool ' +
        'before answering any question about AI engineering concepts. Returns the most ' +
        'similar chunks, numbered so you can cite them like [1].',
      inputSchema: z.object({
        query: z
          .string()
          .describe('A focused search phrase, e.g. "why do chunks overlap"'),
      }),
      execute: ({ query }) =>
        withSpan('tool.searchKnowledgeBase', 'tool', { query }, async () => {
          const results = await retrieveContext(query, { topK: 4 });
          // index is 1-based: the system prompt tells the model to cite [1], [2]...
          const numbered: SearchResult[] = results.map((r, i) => ({ index: i + 1, ...r }));
          return numbered;
        }),
    }),

    // ── MEMORY, WRITE PATH #2 ──────────────────────────────────────────────
    // The model saves a fact when the user explicitly asks. The output is
    // tiny on purpose — the model just needs confirmation.
    rememberFact: tool({
      description:
        'Save a durable fact the user explicitly asks you to remember for future ' +
        'conversations (e.g. "remember that I prefer TypeScript examples"). ' +
        'Do not use it for transient chat content.',
      inputSchema: z.object({
        fact: z.string().describe('The fact to remember, as one short sentence'),
      }),
      execute: ({ fact }) =>
        withSpan('tool.rememberFact', 'memory', { fact }, () => rememberFact(fact, 'tool')),
    }),

    // ── CLASSIC DETERMINISTIC TOOL ─────────────────────────────────────────
    // LLMs are unreliable at arithmetic; delegating to real code is the
    // canonical "why tools exist" example. Note the ERROR HANDLING: returning
    // an error object (not throwing) lets the model read the problem and
    // recover — e.g. apologize and ask for different input.
    calculator: tool({
      description: 'Perform exact arithmetic on two numbers.',
      inputSchema: z.object({
        a: z.number().describe('First operand'),
        b: z.number().describe('Second operand'),
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      }),
      execute: ({ a, b, operation }) => {
        switch (operation) {
          case 'add':
            return { result: a + b };
          case 'subtract':
            return { result: a - b };
          case 'multiply':
            return { result: a * b };
          case 'divide':
            return b === 0 ? { error: 'Division by zero is undefined' } : { result: a / b };
        }
      },
    }),

    // A zero-argument tool — the simplest possible shape, useful for testing
    // that tool calling works at all before debugging anything else.
    getCurrentTime: tool({
      description: 'Get the current date and time on the server.',
      inputSchema: z.object({}),
      execute: async () => ({ now: new Date().toISOString() }),
    }),
  };
}

export type AppTools = ReturnType<typeof createTools>;
