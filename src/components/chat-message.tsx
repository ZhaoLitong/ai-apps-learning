'use client';

// ─────────────────────────────────────────────────────────────────────────────
// RENDERS ONE CHAT MESSAGE — and this is where streaming becomes visible.
//
// A UIMessage is not a string; it's an ordered list of PARTS that fill in as
// the stream arrives:
//   { type: 'text' }                    → a chunk of markdown answer
//   { type: 'tool-searchKnowledgeBase' } → a tool call: input, then output
//                                          (state: input-streaming →
//                                           input-available → output-available)
//
// Each part gets its own `state`, so the UI can show "calling…" before the
// result lands. That's how tools like searchKnowledgeBase render LIVE —
// watch the Sources panel appear mid-answer while testing /chat.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from 'ai';
import type { SearchResult, ToolCallSummary } from '@/lib/types';
import { Badge, JsonPre } from './ui';

const TOOL_LABELS: Record<string, string> = {
  searchKnowledgeBase: '🔎 Knowledge base search',
  rememberFact: '🧠 Memory write',
  calculator: '🧮 Calculator',
  getCurrentTime: '🕒 Server time',
};

export function ChatMessage({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-indigo-500/30 bg-indigo-950/40 px-4 py-2.5 text-sm text-indigo-100">
          {message.parts
            .filter((part) => part.type === 'text')
            .map((part, i) => (
              <span key={i}>{part.type === 'text' ? part.text : ''}</span>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-full space-y-3 rounded-2xl rounded-bl-sm border border-neutral-800 bg-neutral-900/70 px-4 py-3">
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return part.text.trim() ? (
              <div
                key={i}
                className="prose prose-sm prose-invert max-w-none prose-pre:bg-black/50 prose-code:text-indigo-300"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
              </div>
            ) : null;
          }

          // Everything whose type starts with "tool-" is a tool call part.
          if (part.type.startsWith('tool-')) {
            const name = part.type.slice('tool-'.length);
            // Cast the generic part to the fields we render. The SDK's
            // ToolUIPart type carries these; a local cast keeps rendering
            // decoupled from exact SDK typing.
            const toolPart = part as unknown as {
              state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
              input: unknown;
              output?: unknown;
              errorText?: string;
            };
            return <ToolPanel key={i} name={name} {...toolPart} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolPanel({
  name,
  state,
  input,
  output,
  errorText,
}: {
  name: string;
  state: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
}) {
  const [open, setOpen] = useState(false);
  const isError = state === 'output-error';
  const done = state === 'output-available';

  return (
    <div
      className={`overflow-hidden rounded-lg border text-xs ${
        isError ? 'border-red-900/60 bg-red-950/20' : 'border-neutral-800 bg-black/25'
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="font-medium text-neutral-300">{TOOL_LABELS[name] ?? name}</span>
        <span className="flex items-center gap-2">
          {state === 'input-streaming' && <Badge tone="amber">calling…</Badge>}
          {state === 'input-available' && <Badge tone="amber">running…</Badge>}
          {done && <Badge tone="green">done</Badge>}
          {isError && <Badge tone="red">error</Badge>}
          <span className="text-neutral-600">{open ? '▾' : '▸'}</span>
        </span>
      </button>

      {name === 'searchKnowledgeBase' && done && Array.isArray(output) && (
        <div className="space-y-2 border-t border-neutral-800 px-3 py-2">
          {(output as SearchResult[]).map((result) => (
            <div key={result.index} className="rounded-md bg-neutral-900/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-neutral-300">
                  [{result.index}] {result.documentTitle} · chunk {result.chunkIndex}
                </span>
                <Badge tone="indigo">{(result.similarity * 100).toFixed(0)}% match</Badge>
              </div>
              <p className="mt-1 line-clamp-3 text-neutral-500">{result.content}</p>
            </div>
          ))}
        </div>
      )}

      {name === 'rememberFact' && done && (
        <p className="border-t border-neutral-800 px-3 py-2 text-neutral-400">
          Saved to long-term memory — see the Memory page.
        </p>
      )}

      {isError && <p className="border-t border-red-900/60 px-3 py-2 text-red-300">{errorText}</p>}

      {open && (
        <div className="space-y-2 border-t border-neutral-800 px-3 py-2">
          <p className="text-neutral-500">Input the model chose:</p>
          <JsonPre value={input} />
          {output != null && (
            <>
              <p className="text-neutral-500">Raw output:</p>
              <JsonPre value={output} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Used by the /traces page to label persisted tool calls. */
export const toolCallLabel = (call: ToolCallSummary) => TOOL_LABELS[call.tool] ?? call.tool;
