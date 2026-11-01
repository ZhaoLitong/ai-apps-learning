// ─────────────────────────────────────────────────────────────────────────────
// MODEL PROVIDER — the single place that knows how to talk to an LLM.
//
// The AI SDK uses "provider" objects that hand out typed model instances.
// `createOpenAI` is a slight misnomer: it creates a client for ANY endpoint
// that speaks the OpenAI HTTP protocol — OpenAI, Zhipu GLM, DeepSeek, Ollama,
// OpenRouter, vLLM... That one abstraction is why this app has no
// provider-specific code anywhere else.
//
// Why `.chat()` instead of just `openai(model)`? The official OpenAI provider
// now defaults to OpenAI's newer "Responses API", which most compatible
// providers do NOT implement — they only speak classic Chat Completions.
// `.chat()` pins the wire format every provider supports. Embeddings always
// use the /embeddings endpoint, which everyone implements.
// ─────────────────────────────────────────────────────────────────────────────
import { createOpenAI } from '@ai-sdk/openai';
import { config, assertConfigured } from '@/lib/config';

// Memoized so repeated calls (every route handler invocation) reuse one client.
let cached: ReturnType<typeof createOpenAI> | null = null;

function provider() {
  assertConfigured(); // throws a helpful message if OPENAI_API_KEY is missing
  if (!cached) {
    cached = createOpenAI({
      apiKey: config.apiKey,
      // Empty string means "use the official endpoint". Passing undefined
      // lets the SDK default apply.
      baseURL: config.baseUrl || undefined,
    });
  }
  return cached;
}

/** The main model: chat replies, tool calling, eval answers. */
export function getChatModel() {
  return provider().chat(config.chatModel);
}

/** The utility model: memory extraction + eval judging (cheaper). */
export function getSmallModel() {
  return provider().chat(config.smallModel);
}

/**
 * The embedding model: turns text into a fixed-length vector (see embeddings.ts).
 *
 * NOTE: the vector length is NOT set here. In the current AI SDK it's a
 * per-call `providerOptions: { openai: { dimensions } }` setting — see
 * embedText/embedTexts in embeddings.ts, which is where the DB column width
 * is actually enforced.
 */
export function getEmbeddingModel() {
  return provider().embedding(config.embeddingModel);
}
