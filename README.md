# AI Learning Lab

A small, **complete** AI application built to be read. It's a real Next.js app with a real database, and it deliberately implements every building block of production AI systems from scratch — RAG, embeddings, tool calling, long-term memory, observability, and evals — with teaching comments in every file.

The stack: **TypeScript · React · Next.js · Postgres (pgvector) · Drizzle ORM · Vercel AI SDK · Tailwind**.

```
Browser (React, useChat)
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
Postgres (+pgvector): documents · chunks · memories · messages · traces · spans · eval_runs
```

---

## Quickstart

Prerequisites: **Node 20+** and **Docker** (for Postgres), plus an API key from any OpenAI-compatible provider.

```bash
# 1. Start Postgres with the pgvector extension
npm run docker:up

# 2. Configure — copy the example and fill in your key
cp .env.example .env
#    then edit .env → OPENAI_API_KEY=...   (see "Providers" below for alternatives)

# 3. Install, create tables, load the knowledge base
npm install
npm run db:setup        # = db:push (schema → SQL) + db:seed (chunk + embed 7 docs)

# 4. Run it
npm run dev             # → http://localhost:3000
```

No key yet? The app still boots: Documents, Memory and Traces work against the database, and every LLM-touching page shows a friendly "not configured" error instead of a stack trace.

## Providers

The app talks to **one OpenAI-compatible endpoint** for chat and embeddings — set these in `.env`:

| Provider  | `OPENAI_BASE_URL`                          | Chat model         | Embedding model            | `EMBEDDING_DIMENSIONS` |
|-----------|--------------------------------------------|--------------------|----------------------------|------------------------|
| OpenAI    | *(leave empty)*                            | `gpt-4o-mini`      | `text-embedding-3-small`   | `1536` (default)       |
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4`     | `glm-4.6`          | `embedding-3`              | `2048`                 |
| DeepSeek  | `https://api.deepseek.com`                 | `deepseek-chat`    | ⚠️ none — pair with another provider for embeddings | *(as chosen)* |
| Ollama    | `http://localhost:11434/v1`                | `qwen2.5:7b` …     | `nomic-embed-text`         | `768`                  |

`EMBEDDING_DIMENSIONS` **must** match the embedding model's output size *and* the vector columns in the schema. If you change it: `npm run db:push`, then `npm run db:seed` to re-embed everything. (The code double-checks at runtime and tells you exactly this if they disagree.)

---

## The learning path

Read the source in this order — each step builds on the previous. The [home page](http://localhost:3000) mirrors this list with links.

| # | Concept | Read this | See it live |
|---|---------|-----------|-------------|
| 1 | **Streaming chat** — the skeleton everything hangs on | `src/app/api/chat/route.ts` · `src/ai/provider.ts` · `src/components/chat-message.tsx` | `/chat` |
| 2 | **The schema** — 8 tables, one per feature; the app's table of contents | `src/db/schema.ts` | every page |
| 3 | **Embeddings & chunking** — text → vectors; why chunks and overlap exist | `src/ai/embeddings.ts` · `src/ai/chunking.ts` | `/documents`, `/retrieval` |
| 4 | **RAG** — chunk → embed → cosine search → prompt | `src/ai/rag.ts` | `/retrieval`, then ask `/chat` "what is RAG?" |
| 5 | **Tool calling** — model emits calls, app executes, SDK loops | `src/ai/tools.ts` | `/chat` — expand the tool panels |
| 6 | **Memory** — two write paths, one similarity-based read path | `src/ai/memory.ts` · `src/ai/prompts.ts` | `/memory` |
| 7 | **Observability** — every request = trace; every step = timed span | `src/ai/tracing.ts` | `/traces` after any chat message |
| 8 | **Evals** — dataset + 3 check kinds + judge = regression tests for prompts | `src/ai/evals/runner.ts` · `src/ai/evals/judge.ts` | `/evals` or `npm run eval` |

Also worth reading early: `src/lib/config.ts` (every knob, explained) and `src/ai/prompts.ts` (the actual system prompt, assembled from parts).

## What each feature actually does

**Streaming chat** — `useChat()` posts to `/api/chat`; the route streams back the AI SDK's UI-message stream (text deltas + tool-call events). Messages are part-based, so tool calls render *inside* the answer as they happen. Every turn is persisted to the `messages` table.

**RAG** — Agentic flavor: instead of stuffing retrieved text into every prompt, the model gets a `searchKnowledgeBase` tool and decides when to search. Chunks are stored with pgvector vectors; retrieval is `ORDER BY embedding <=> query LIMIT k` (cosine distance), with a similarity floor. The Retrieval playground runs the same function without the model, so you can study raw retrieval.

**Tool calling** — Zod schemas give type-safe tool inputs; descriptions are the prompt engineering that decides *when* tools fire. Tools are injected per-request with an optional tracer (dependency injection), and tool *errors are returned as results* so the model can recover.

**Memory** — Write path 1: after each exchange, a cheap model extracts durable facts (`memory.extract` span). Write path 2: the `rememberFact` tool for explicit "remember that…". Read path: top-3 memories by cosine similarity to the user's message, injected into the system prompt.

**Observability** — One trace per chat turn; spans for memory retrieval, each tool call, the LLM call (with token usage) and memory extraction. All writes are fail-safe: observability can never break chat. The `/traces` page renders spans with input/output JSON.

**Evals** — `src/ai/evals/datasets/learning-basics.json` holds questions about the seeded docs. Each case checks: retrieval hit (did vector search find the right doc?), must-contain substrings, and an LLM-judge rubric score. Results persist to `eval_runs` — the `/evals` page compares runs over time.

## Things to try (the real curriculum)

Each of these is a one-or-two-file change that teaches something real:

1. **Chunk size** — set `chunkMaxTokens: 100` in `src/lib/config.ts`, `npm run db:seed`, then re-run evals and compare the retrieval-hit rate. Now try `1000`.
2. **The similarity floor** — set `retrievalMinSimilarity: 0` and watch junk enter the context; raise it to 0.4 and watch the knowledge base go silent.
3. **Break a tool description** — make `searchKnowledgeBase`'s description vague ("Search documents"). Watch the model stop using it. This is what prompt engineering *is*.
4. **Add a tool** — e.g. `diceRoll({ sides })`. Copy the calculator's shape; the UI renders it automatically from its part type.
5. **Memory extraction rules** — make the extraction prompt stricter or looser in `src/ai/memory.ts` and watch what lands on `/memory`.
6. **Prompt surgery** — change one line of `buildSystemPrompt`, run `npm run eval` before and after. Congratulations, you're doing prompt regression testing.
7. **Span trees** — spans have a `parentSpanId` column that's currently unused. Thread it through `Tracer.span()` and render the tree on `/traces`.
8. **Conversation history** — the `messages` table already has everything; build a conversations list page and load old chats via `initialMessages`.
9. **Real token counts** — replace the chars÷4 estimate in `chunking.ts` with `js-tiktoken`.
10. **Classic RAG** — bypass the tool: call `retrieveContext()` in the chat route and inject results into the system prompt instead. Compare behavior with evals. (Now you understand both RAG architectures.)

## Going further

- **Migrations**: this project uses `drizzle-kit push` (diff-and-apply). For team workflows, switch to `drizzle-kit generate` + checked-in SQL migration files.
- **Real tracing**: the `traces`/`spans` tables map 1:1 onto OpenTelemetry; swap `Tracer` for the AI SDK's `experimental_telemetry` + a Langfuse/OpenTelemetry exporter without changing any call sites' shape.
- **Auth & multi-tenancy**: every table is global right now. Adding `userId` columns + row scoping is the classic next step — and makes memory scoping a real problem to solve.
- **Rate limiting / streaming aborts** — send a message and hit Stop; notice what the server still finishes. Handling `req.signal` aborts properly is a great exercise.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `relation "documents" does not exist` | Run `npm run db:push` (schema wasn't applied). |
| `function hnsw` / `type "vector" does not exist` | The pgvector extension isn't loaded — the docker-compose image has it; for an external DB run `CREATE EXTENSION vector;`. |
| `Embedding model returned N dimensions but the database columns expect M` | Set `EMBEDDING_DIMENSIONS=N` in `.env`, then `npm run db:push` + `npm run db:seed`. |
| `401` / `model not found` from the provider | Wrong key or model name for that provider — check the Providers table above. |
| Chat says "No LLM API key configured" | `.env` missing or empty `OPENAI_API_KEY`; restart `npm run dev` after editing. |
| Everything fails with `ECONNREFUSED` on 5433 | Postgres isn't running — `npm run docker:up`. |
