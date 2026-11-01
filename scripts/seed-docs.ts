// The knowledge base the app ships with: short reference docs about the very
// concepts the app implements. Self-referential on purpose — asking the chat
// "why do chunks overlap?" makes it retrieve a document that explains
// chunking, which lives in this file, which you can read. The docs are sized
// so each one becomes 2-3 chunks at the default settings.

export interface SeedDoc {
  title: string;
  content: string;
}

export const SEED_DOCS: SeedDoc[] = [
  {
    title: 'Retrieval-Augmented Generation (RAG)',
    content: `# What problem RAG solves

Language models only know what was in their training data, and their weights cannot be updated per user. Ask a model about your private documents and it will either refuse or, worse, confabulate a plausible-sounding answer. RAG (Retrieval-Augmented Generation) fixes this by grounding the model: before answering, the system retrieves relevant text from a corpus you control and hands it to the model as context.

The benefits compound. Answers are grounded in real text (less hallucination), knowledge stays fresh (update the corpus, not the model), the model can cite sources (auditable answers), and different users can share one model while seeing only their own data.

# The pipeline stages

Every RAG system, including this one, has two phases.

**Ingestion (write path):** take a document, split it into chunks, embed every chunk into a vector, and store chunk text plus vector in a database with similarity search support — this app uses Postgres with the pgvector extension.

**Query (read path):** embed the user's question, retrieve the chunks whose vectors are closest to the question vector (cosine similarity), and generate an answer with those chunks injected into the prompt.

# Retrieval-first, generation-second

The crucial design decision in RAG is that the model never answers from memory about your data — it answers from retrieved text. If retrieval returns nothing relevant, a good system says so rather than improvising. That is why retrieval quality (chunking, embedding model, top-k, similarity thresholds) usually matters more than prompt phrasing.

# Two ways to wire retrieval

Classic RAG retrieves BEFORE the model is called, every time, unconditionally. Agentic RAG gives the model a search tool and lets it decide when to search, with what query, and how many times. Agentic RAG wastes less on small talk and allows multi-step research ("search, notice a gap, search again"), at the cost of an extra model round-trip and the risk the model forgets to search. This app implements the agentic variant; the Retrieval playground page shows the classic variant's inner loop in isolation.`,
  },
  {
    title: 'Embeddings and Vector Search',
    content: `# Text as geometry

An embedding model is a neural network that maps a piece of text to a vector — a list of a few hundred to a few thousand numbers — chosen so that texts with similar MEANING get similar vectors. "How do I reset my password?" and "I can't log into my account" share almost no keywords, but their vectors land close together. Keyword search cannot see that equivalence; vector search is built on it.

The vector's length is the model's DIMENSION (text-embedding-3-small: 1536). The dimension is a hard constraint: the database column that stores vectors must be declared with the same length, which is why changing embedding models in this app requires re-pushing the schema and re-embedding everything.

# Measuring similarity

The standard similarity measure for embeddings is cosine similarity: the cosine of the angle between two vectors, from 1 (same direction, same meaning) through 0 (unrelated) to -1 (opposite). Most embedding models produce unit vectors, for which cosine similarity is just the dot product.

pgvector stores vectors and offers three distance operators: L2 (<->), inner product (<#>) and cosine distance (<=>). Cosine distance equals 1 minus cosine similarity, so SMALLER distance means MORE similar. This app always sorts by <=> ascending and converts to human-friendly similarity with 1 - distance.

# What similarity is good for — and what it isn't

Vector search finds text that MEANS something like the query. It is fuzzy: it will happily return topically adjacent text that doesn't contain the literal answer. That's usually the point (the model synthesizes), but it's also why production systems combine techniques: a similarity floor to drop junk, keyword filters or hybrid BM25+vector search for exact identifiers, and re-ranking models that re-score the top candidates with a stronger, slower model.

# Embeddings everywhere

Once you have an embed() function you get several features for free, all built on the same machinery: document search (RAG), deduplication ("is this new memory nearly identical to an old one?"), clustering and topic discovery, recommendations, and classification by nearest labeled example. This app uses the same embed() for two features: RAG chunks and long-term memories.`,
  },
  {
    title: 'Chunking Strategies',
    content: `# Why chunk at all

Embedding an entire document compresses everything it says into a single vector, so a ten-page document about many topics becomes one blurry point in space — you can retrieve "the document probably mentions this" but not "the paragraph that answers this." Chunking defines the unit of retrieval: what gets embedded is what comes back, so chunk shape decides answer quality more than almost any other RAG setting.

# Fixed vs structural splitting

The naive approach is a fixed-size sliding window (every 500 characters, say). It's simple and uniform, but it cuts mid-sentence and mid-idea. Structure-aware chunking does better: split on natural boundaries first (markdown headers, paragraphs, sentences, code blocks) and only hard-split when a single unit is bigger than the budget. This app splits on blank lines, packs paragraphs greedily into ~400-token chunks, and falls back to sentence splitting (with CJK punctuation support) for monster paragraphs.

# Why chunks overlap

Consecutive chunks share a small tail of text — the overlap. Consider an answer whose two halves live at a chunk boundary: without overlap, neither chunk contains both halves, and retrieval can only ever surface half the evidence. Overlap guarantees the seam region appears fully inside at least one chunk. Typical overlap is 10-20% of chunk size (this app: 80 tokens on 400).

The tradeoff: overlap duplicates content, which inflates storage and can return the same sentence in several retrieved chunks (dedupe or merge overlapping chunks if that annoys your context window).

# Sizing rules of thumb

Small chunks (a few hundred tokens) retrieve precisely but may lack surrounding context; large chunks carry context but dilute the vector and eat prompt budget. Common production choices land between 200 and 800 tokens with 10-20% overlap. The right answer depends on your content's natural paragraph size and how much context the downstream model needs — which is why chunk size is the FIRST knob to turn when RAG answers feel off, and why the README's exercise list tells you to change it and re-run evals.`,
  },
  {
    title: 'Tool Calling',
    content: `# What tool calling is

A model is text in, text out. It cannot know today's date, read your database, or multiply two large numbers reliably. Tool calling (also called function calling) is the protocol that changes this: you describe available tools — name, description, input schema — and the model may respond to a prompt not with an answer but with a structured REQUEST: "call searchKnowledgeBase with { query: 'why overlap chunks' }". Your application executes the request and returns the result to the model, which then continues generating.

The model NEVER executes code. It only emits calls; your application owns execution, permissions, and error handling. That separation is the security boundary.

# Anatomy of a tool

Every tool has three parts. The NAME identifies it. The DESCRIPTION is prompt engineering: the model reads it to decide when the tool applies — a vague description means the tool never fires, an over-broad one means it fires constantly. The INPUT SCHEMA (this app uses Zod) formally constrains the arguments; the SDK validates the model's emitted arguments against it, so your execute function receives typed, checked inputs.

# The loop

Tool use is multi-step. One "step" is one model turn; it may end with tool calls instead of a final answer. The application executes those calls, appends the results to the conversation, and invokes the model again. This repeats — search, read, search again with refined terms, calculate, finally answer — until the model produces a final response or a step limit is hit. The limit matters: the default in the AI SDK is a single step, which ends the turn immediately after the first tool call. This app allows six.

# Handling failure

Tools fail: network errors, bad inputs, division by zero. Two patterns exist. Throwing aborts the step and surfaces the error to the application (right for unrecoverable situations). Returning an error OBJECT as the tool's result feeds the failure back to the model, which can apologize, correct its arguments, or try another tool — often recovering without user-visible failure. This app's calculator returns { error: 'Division by zero' } for the zero case precisely so the model can handle it gracefully.

# When NOT to use tools

Direct answers are cheaper and faster. Use tools when the model needs facts it doesn't have (fresh, private, or per-user data), exact guarantees (arithmetic, lookups), or side effects (writing a memory, sending a message). Don't use tools for what the model already knows — every tool call is an extra model round-trip in latency and tokens.`,
  },
  {
    title: 'Memory in AI Apps',
    content: `# Models are amnesiacs

An LLM has no memory between requests. Each call starts fresh; anything the model should "remember" must be re-presented in the prompt. All AI-app memory is therefore a state management problem: write memory somewhere durable, read the right pieces back into context at the right time.

# Short-term vs long-term

Short-term memory is the conversation transcript itself — you send the last N messages with every request, trimmed by turns or tokens. It is trivial to implement and works, but it evaporates when the conversation ends and bloats the prompt as it grows.

Long-term memory persists across conversations. This app stores memory rows in Postgres, each a short factual sentence with its embedding. On every user message, the app embeds the message, retrieves the top-k most similar memories, and injects them into the system prompt. It is the same vector-search machinery as RAG — different table, different purpose.

# Two write paths, one read path

**Automatic extraction:** after each exchange, a cheap model call examines the transcript and extracts durable facts (role, goals, preferences, standing constraints) while discarding transient chatter. Passive and thorough — it catches things users never think to save — but noisy: it can store junk, near-duplicates, or wrong inferences, and it costs an extra LLM call per turn.

**Explicit tool:** the model exposes a rememberFact tool and writes memory when the user says "remember that...". Precise and user-intended, but only fires when the user thinks of it.

Most production systems combine both, plus a third source: explicit user-facing memory management (view and edit what the assistant knows — this app's Memory page).

# Hard problems to know about

Real memory systems must handle: contradiction ("I used to live in Berlin" → "I moved to Vienna"), decay and forgetting (recency or importance weighting), consolidation (merging near-duplicate memories), and scoping (per-user, per-workspace). This app keeps exact-match dedupe and leaves the rest as exercises — deliberately, because implementing each one teaches more than any library abstracting it away.`,
  },
  {
    title: 'Observability: Traces, Spans, and Tokens',
    content: `# Why LLM apps need observability

LLM applications are non-deterministic, multi-step, and metered per token. The same question can take one model call or five; a bad answer could come from empty retrieval, a wrong tool input, or the model itself. You cannot fix what you cannot see, so production AI apps instrument every request.

# The vocabulary: traces and spans

A TRACE is one request's entire journey through the system. A SPAN is one timed unit of work inside that journey: an embedding call, a database search, a tool execution, the main model call. Spans nest under traces (in distributed-tracing systems like OpenTelemetry, via parent span ids) and carry structured input and output, a status, and a duration.

This app writes one trace per chat turn and a span for every step: memory.retrieve, each tool.* call, llm.chat with token usage, memory.extract. The same shape maps 1:1 onto hosted platforms (Langfuse, LangSmith, Braintrust, Arize) — the concepts matter more than the storage.

# What to look at when debugging

When an answer is wrong, work backwards through the trace. Was there a retrieval span with zero results, or low similarities? (Retrieval problem: check chunking, embeddings, or the query.) Did a tool receive strange input or return an error? (Tool problem: tighten the description or schema.) Did the model see good context and still answer poorly? (Model/prompt problem: tune the system prompt — and re-run evals.)

# Token usage, latency, cost

Every LLM span should record input and output tokens; multiply by your provider's per-token prices and a feature's true cost falls out of its traces. Latency per span shows where time goes — usually the model call, but in agentic systems tool loops multiply round-trips fast. Common optimizations that traces justify: smaller models for easy steps, caching identical requests, trimming prompt context that retrieval scores show is never used, and parallelizing independent calls.

# The golden rule

Instrumentation must never break the app. Every tracing write in this codebase is wrapped in try/catch: if observability fails, the user still gets their answer. Log what you need to debug, sample or truncate what you don't (this app truncates long strings in span payloads), and keep secrets out of span inputs.`,
  },
  {
    title: 'Evals and LLM-as-Judge',
    content: `# Evals are regression tests for prompts

Everything in an AI app — the system prompt, the chunk size, the model, the tool descriptions — is a knob that changes behavior in ways unit tests cannot capture, because outputs are free-form text. Evals fill that gap: a fixed dataset of inputs, run through the real pipeline, scored automatically, and compared across runs. Change a prompt, run evals, compare scores. That loop is how you iterate AI features with confidence instead of vibes.

# Three kinds of checks, one dataset

**Deterministic checks** are exact and cheap: required substrings, regexes, JSON validity, or "did retrieval return the expected document" (a pure retriever metric that says nothing about the model). Use them for everything that CAN be checked deterministically.

**LLM-as-judge** scores what determinism can't: clarity, completeness, tone, correctness of free-form explanations. A second model call grades the answer against a natural-language rubric and returns a number plus a rationale. It is noisy and biased — judges favor longer answers and their own style — so treat single scores skeptically and trust TRENDS across many cases and runs. Anchored rubrics ("9 means...", "5 means..."), pairwise comparisons, and periodic human spot-checks all tighten it.

**Human review** remains the ground truth for tricky cases; evals are how you minimize how often you need it.

# Anatomy of a good eval set

Start small: 10-50 cases covering the capabilities you actually ship, including a few adversarial ones (questions with no answer in the knowledge base, ambiguous phrasing, prompts that should NOT trigger tools). Each case needs the input and a rubric — "answers accurately per the docs and cites sources" beats "good answer." The dataset is code: version it, review changes to it, grow it every time something breaks in production ("write the failing case first").

# Running and reading results

This app persists every run to the database with a summary (average judge score, retrieval hit rate, must-contain rate) plus per-case detail, so the /evals page can show regressions between runs. When a score drops, the per-case view tells you which kind of check failed — and combined with the Traces page, why.`,
  },
];
