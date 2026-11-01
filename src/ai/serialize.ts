// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE SHAPES, TRANSLATED.
//
// The AI SDK uses three message dialects and this app touches all of them:
//
//   UIMessage      — client ↔ API route. Typed `parts` (text, tool-*, ...) so
//                    React can render streaming pieces as they arrive.
//   ModelMessage   — what the model sees. Also part-based, but flattened and
//                    tool results come back as separate 'tool' role messages.
//   DB rows        — one row per chat turn: text content + ToolCallSummary[].
//
// These helpers convert between them at the boundaries.
// ─────────────────────────────────────────────────────────────────────────────
import type { ModelMessage, UIMessage } from 'ai';
import type { ToolCallSummary } from '@/lib/types';

/** All text inside a UIMessage (its parts may also include tool calls etc.). */
export function textOfUIMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> =>
      part.type === 'text',
    )
    .map((part) => part.text)
    .join('\n')
    .trim();
}

/**
 * Flatten the model messages from a finished generation into one
 * assistant-turn record: the final text plus every tool call paired with its
 * result. `response.messages` (from streamText/generateText onFinish) contains
 * the assistant's tool-call messages AND the 'tool' role messages with results.
 */
export function summarizeAssistantTurn(modelMessages: ModelMessage[]): {
  text: string;
  toolCalls: ToolCallSummary[];
} {
  const textParts: string[] = [];
  const calls = new Map<string, ToolCallSummary>();

  for (const message of modelMessages) {
    if (!Array.isArray(message.content)) continue; // plain-string content

    for (const part of message.content) {
      if (message.role === 'assistant') {
        if (part.type === 'text') {
          textParts.push(part.text);
        } else if (part.type === 'tool-call') {
          calls.set(part.toolCallId, { tool: part.toolName, input: part.input });
        }
      } else if (message.role === 'tool' && part.type === 'tool-result') {
        const call = calls.get(part.toolCallId);
        if (call) {
          if (part.output != null && typeof part.output === 'object' && 'error' in part.output) {
            // The AI SDK wraps thrown tool errors as { error: ... }.
            call.error = String((part.output as { error: unknown }).error);
          } else {
            call.output = part.output;
          }
        }
      }
    }
  }

  return { text: textParts.join('\n').trim(), toolCalls: [...calls.values()] };
}
