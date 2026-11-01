// ─────────────────────────────────────────────────────────────────────────────
// /api/chat — THE HEART OF THE APP. One POST = one fully-instrumented turn:
//
//   1. persist the user message                       (messages table)
//   2. start a trace                                  (traces table)
//   3. retrieve long-term memories                    (span: memory.retrieve)
//   4. build the system prompt (identity + memories)
//   5. streamText with tools — the model may call searchKnowledgeBase
//      (→ vector search span), calculator, rememberFact, ... and keep
//      generating until it produces a final answer, streaming tokens
//      to the browser the whole time
//   6. onFinish: persist the assistant turn, record the LLM span + usage,
//      close the trace, and run memory extraction
//
// The response body is the AI SDK's "UI message stream": a lightweight
// protocol that streams text deltas, tool-call inputs/outputs, and errors —
// the useChat() hook on the client reassembles it into UIMessage.parts.
// ─────────────────────────────────────────────────────────────────────────────
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from 'ai';
import { db } from '@/db';
import { messages as messagesTable } from '@/db/schema';
import { getChatModel } from '@/ai/provider';
import { createTools } from '@/ai/tools';
import { buildSystemPrompt } from '@/ai/prompts';
import { retrieveRelevantMemories, extractMemoriesFromExchange } from '@/ai/memory';
import { Tracer } from '@/ai/tracing';
import { summarizeAssistantTurn, textOfUIMessage } from '@/ai/serialize';
import { apiError } from '@/lib/http';

export async function POST(req: Request) {
  try {
    // ── 1. Parse & validate the request ────────────────────────────────────
    const body = (await req.json().catch(() => null)) as
      | { id?: string; messages?: UIMessage[] }
      | null;

    const uiMessages = body?.messages;
    if (!uiMessages?.length) {
      return Response.json({ error: 'Request must include messages.' }, { status: 400 });
    }
    const latest = uiMessages[uiMessages.length - 1];
    if (latest.role !== 'user') {
      return Response.json({ error: 'Last message must be from the user.' }, { status: 400 });
    }

    // The browser generates one id per session (useChat({ id })) so every
    // turn of a conversation shares a key for history + traces.
    const conversationId = body?.id ?? crypto.randomUUID();
    const userText = textOfUIMessage(latest);

    // ── 2. Persist the user message (best-effort: history must not block chat)
    try {
      await db.insert(messagesTable).values({ conversationId, role: 'user', content: userText });
    } catch (error) {
      console.error('[chat] failed to persist user message', error);
    }

    // ── 3. Start the observability trace for this whole turn ───────────────
    const traceStartedAt = Date.now();
    const tracer = await Tracer.start(conversationId, {
      messageCount: uiMessages.length,
      userTextLength: userText.length,
    });

    // ── 4. Retrieve long-term memories for this specific message ───────────
    // Failures degrade gracefully: no memories ≠ broken chat.
    const memoryBullets = await tracer
      .span('memory.retrieve', 'retrieval', { query: userText }, async () => {
        const relevant = await retrieveRelevantMemories(userText);
        return relevant.map((m) => m.content);
      })
      .catch((error) => {
        console.error('[chat] memory retrieval failed', error);
        return [] as string[];
      });

    // ── 5. Build the prompt and stream the model's answer ──────────────────
    const system = buildSystemPrompt({ memories: memoryBullets });
    const model = getChatModel(); // throws a friendly error if no API key
    const tools = createTools({ tracer });

    const result = streamText({
      model,
      system,
      tools,
      // UIMessages → ModelMessages (tool parts the model understands).
      messages: convertToModelMessages(uiMessages),
      // THE multi-step switch: without this the turn ends after the first
      // tool call ("step"). 6 steps allows search → read → maybe search
      // again → answer.
      stopWhen: stepCountIs(6),
      onError: ({ error }) => {
        console.error('[chat] model error', error);
      },
      // Fires when the MODEL finishes generating (stream may still be
      // flushing to the client). All persistence happens here.
      onFinish: async ({ usage, finishReason, response }) => {
        try {
          const latencyMs = Date.now() - traceStartedAt;
          const { text, toolCalls } = summarizeAssistantTurn(response.messages);

          await tracer.record({
            name: 'llm.chat',
            kind: 'llm',
            input: { model: model.modelId, memories: memoryBullets.length },
            output: { text, toolCalls },
            startedAtMs: traceStartedAt,
            durationMs: latencyMs,
          });
          await tracer.finish({
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            },
            finishReason,
            startedAtMs: traceStartedAt,
          });

          await db.insert(messagesTable).values({
            conversationId,
            role: 'assistant',
            content: text,
            toolCalls: toolCalls.length > 0 ? toolCalls : null,
          });

          // Memory write path #1: passively extract durable facts. Wrapped
          // as a span + try/catch — memory must never break chat.
          if (text) {
            await tracer
              .span('memory.extract', 'memory', { userText }, () =>
                extractMemoriesFromExchange(userText, text),
              )
              .catch((error) => console.error('[chat] memory extraction failed', error));
          }
        } catch (error) {
          console.error('[chat] post-stream persistence failed', error);
        }
      },
    });

    // Return the streaming response. Nothing after this line — the stream
    // owns the connection now.
    return result.toUIMessageStreamResponse();
  } catch (error) {
    // Catches config errors (no API key) and malformed requests, which fire
    // BEFORE streaming starts. Mid-stream errors are handled by onError.
    return apiError(error);
  }
}
