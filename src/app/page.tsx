// The home page is the curriculum map: each card is one AI-app concept,
// pointing at the UI page that demos it and the source files that implement
// it. force-dynamic because it reads env config at request time (to show the
// setup banner) — a static page would bake the build-time value in forever.
import Link from 'next/link';
import { config, isConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

const PATH = [
  {
    n: 1,
    title: 'Streaming chat',
    blurb:
      'The skeleton: a React chat UI wired to /api/chat, tokens streaming back over a UIMessage stream. Every other feature hangs off this loop.',
    files: ['src/app/api/chat/route.ts', 'src/ai/provider.ts', 'src/components/chat-message.tsx'],
    href: '/chat',
    try: 'Ask anything and watch tokens arrive one piece at a time.',
  },
  {
    n: 2,
    title: 'Postgres schema',
    blurb:
      'Eight tables power everything: documents, chunks (with vector columns), memories, messages, traces, spans, eval_runs. The schema is the app\'s table of contents.',
    files: ['src/db/schema.ts'],
    href: undefined,
    try: 'Read schema.ts top to bottom — it\'s written to be read.',
  },
  {
    n: 3,
    title: 'Embeddings',
    blurb:
      'Text → vector. Store a document and watch it split into chunks with embeddings; then query the raw similarity scores in the retrieval playground.',
    files: ['src/ai/embeddings.ts', 'src/ai/chunking.ts'],
    href: '/documents',
    try: 'Search "password reset" vs "can\'t log in" — different words, similar vectors.',
  },
  {
    n: 4,
    title: 'RAG',
    blurb:
      'Chunk → embed → store → cosine search → inject into the prompt. This app does it AGENTICALLY: the model calls a search tool when it needs context.',
    files: ['src/ai/rag.ts', 'src/ai/tools.ts'],
    href: '/retrieval',
    try: 'Ask the chat "what is RAG?" and watch the search tool fire mid-answer.',
  },
  {
    n: 5,
    title: 'Tool calling',
    blurb:
      'The model emits "call calculator with {...}"; your code executes it and feeds the result back. Schemas make inputs type-safe; descriptions decide when tools fire.',
    files: ['src/ai/tools.ts'],
    href: '/chat',
    try: 'Ask "(3841 * 27) / 9" — then expand the tool panel to see its input & output.',
  },
  {
    n: 6,
    title: 'Memory',
    blurb:
      'Two write paths: auto-extraction after each exchange, and the rememberFact tool. One read path: top-k similar memories injected into every system prompt.',
    files: ['src/ai/memory.ts', 'src/ai/prompts.ts'],
    href: '/memory',
    try: 'Tell the chat "remember that I\'m learning AI engineering" — then ask it in a NEW conversation.',
  },
  {
    n: 7,
    title: 'Observability',
    blurb:
      'Every request becomes a trace; every embedding, retrieval, tool call and LLM call becomes a timed span with input/output. This is how you debug non-determinism.',
    files: ['src/ai/tracing.ts'],
    href: '/traces',
    try: 'Send one chat message, then open Traces and follow the spans in order.',
  },
  {
    n: 8,
    title: 'Evals',
    blurb:
      'A dataset of questions, three kinds of checks (retrieval hits, must-contain, LLM-as-judge), scores persisted per run. Regression testing for prompts.',
    files: ['src/ai/evals/runner.ts', 'src/ai/evals/judge.ts'],
    href: '/evals',
    try: 'Run the eval suite, then change the system prompt and run again — compare scores.',
  },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-100">
          A complete AI app, built to be <span className="text-indigo-400">read</span>.
        </h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-neutral-400">
          This project is a working AI application — Next.js + React + Postgres/pgvector —
          that deliberately implements each building block of production AI systems from
          scratch, with teaching comments everywhere. The recommended path is the numbered
          cards below: build up one concept at a time, in the order they compose.
        </p>
        {!isConfigured() && (
          <div className="mt-5 rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            <strong>No LLM API key detected.</strong> Copy{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">.env.example</code> →{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">.env</code>, set{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">OPENAI_API_KEY</code>{' '}
            (any OpenAI-compatible provider works — see README), then restart{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">npm run dev</code>.
            Until then, only the database-backed pages (Documents, Memory) will work.
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {PATH.map((step) => (
          <div
            key={step.n}
            className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 transition-colors hover:border-neutral-700"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/15 font-mono text-sm text-indigo-300">
                {step.n}
              </span>
              <h2 className="font-semibold text-neutral-100">{step.title}</h2>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-400">{step.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {step.files.map((file) => (
                <code
                  key={file}
                  className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300/90"
                >
                  {file}
                </code>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              <span className="font-medium text-neutral-400">Try:</span> {step.try}
            </p>
            {step.href && (
              <Link
                href={step.href}
                className="mt-4 inline-flex w-fit items-center rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Open the page →
              </Link>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-200">One request, end to end</h2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-400">
          Every feature above participates in a single chat turn. This is the whole flow —
          implemented in <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-indigo-300">src/app/api/chat/route.ts</code>:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-neutral-800 bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-neutral-400">
{`Browser (React, useChat)
  │  POST /api/chat  { messages }
  ▼
Next.js route handler ────────► start TRACE (traces table)
  │
  ├─► retrieve memories ──────► span: memory.retrieve   (pgvector search)
  ├─► build system prompt      (identity + memories + tool rules)
  ├─► streamText(model, tools) ─────────────────────────► LLM provider
  │      │  model decides to call:
  │      ├─► searchKnowledgeBase ─► span: tool.*        (pgvector search)
  │      ├─► rememberFact        ─► span: memory.*      (embed + insert)
  │      └─► calculator / getCurrentTime
  │      … loops until final answer, streaming tokens to the browser
  └─► onFinish: persist assistant turn, record LLM span + usage,
                extract new memories (span: memory.extract)
  ▼
Postgres (+pgvector): documents · chunks · memories · messages · traces · spans · eval_runs`}
        </pre>
      </section>
    </div>
  );
}
