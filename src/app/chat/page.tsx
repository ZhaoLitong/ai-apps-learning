'use client';

// The chat page: useChat() + our ChatMessage renderer.
//
// What's interesting here is what you DON'T see: no fetch code, no stream
// parsing, no message state management. @ai-sdk/react's useChat hook does all
// of it — send a message, receive a stream of parts, expose `status` so the
// UI can show busy states, surface `error`, and support stop/regenerate.
//
// The conversation id is generated once per browser session and sent with
// every request, which is what ties messages and traces together on the
// server. Refreshing starts a new conversation id (history lives in the DB;
// building a conversation list page is a suggested exercise).
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { ChatMessage } from '@/components/chat-message';
import { Button, ErrorBanner, Input, PageHeader, Spinner } from '@/components/ui';

export default function ChatPage() {
  // One conversation per browser session. useState initializer runs once.
  const [conversationId] = useState(() => crypto.randomUUID());

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    id: conversationId,
  });

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const busy = status === 'submitted' || status === 'streaming';

  return (
    <div>
      <PageHeader
        title="Chat"
        lead="A streaming chat with RAG, tools and memory behind it. Watch for tool panels appearing inside answers — that's agentic retrieval happening live. Every turn also writes a trace you can inspect afterwards."
        files={['src/app/api/chat/route.ts', 'src/ai/tools.ts', 'src/components/chat-message.tsx']}
      />

      <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
        <span>
          conversation <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px]">{conversationId.slice(0, 8)}</code>
          {' · '}after each turn, open <a className="text-indigo-400 hover:underline" href="/traces">Traces</a> to see what happened
        </span>
        <button
          className="text-indigo-400 hover:underline"
          onClick={() => {
            stop();
            setMessages([]);
          }}
        >
          + new chat
        </button>
      </div>

      <div className="flex h-[62vh] flex-col overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        {messages.length === 0 && (
          <div className="m-auto max-w-md text-center text-sm text-neutral-500">
            <p className="text-neutral-300">Try one of these:</p>
            <ul className="mt-3 space-y-1.5">
              <li>&ldquo;What is RAG and why chunk documents?&rdquo; <span className="text-neutral-600">(triggers search tool)</span></li>
              <li>&ldquo;What is (3841 × 27) / 9?&rdquo; <span className="text-neutral-600">(triggers calculator)</span></li>
              <li>&ldquo;Remember that I prefer short answers.&rdquo; <span className="text-neutral-600">(triggers memory write)</span></li>
            </ul>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
        {busy && (
          <div className="mt-3 pl-1">
            <Spinner label={status === 'submitted' ? 'Thinking…' : 'Streaming…'} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBanner message={error.message} />
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (!text || busy) return;
          setInput('');
          sendMessage({ text });
        }}
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about RAG, embeddings, tools, memory…"
          disabled={busy}
          autoFocus
        />
        {busy ? (
          <Button type="button" variant="ghost" onClick={() => stop()}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
