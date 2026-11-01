'use client';

// The Traces page — your window into every chat turn.
// A TRACE is one request; SPANS are the timed steps inside it (memory
// retrieval, tool calls, the LLM call itself). When answers go wrong, this is
// where you look first: was retrieval empty? Did the tool get bad input? How
// many tokens did the turn burn?
import { useCallback, useEffect, useState } from 'react';
import { apiGetOrThrow } from '@/lib/client';
import { Badge, Card, EmptyState, ErrorBanner, JsonPre, PageHeader, Spinner } from '@/components/ui';

interface Span {
  id: string;
  name: string;
  kind: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number;
}

interface Trace {
  id: string;
  conversationId: string;
  model: string;
  startedAt: string;
  durationMs: number | null;
  finishReason: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  error: string | null;
  spans: Span[];
}

export default function TracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGetOrThrow<{ traces: Trace[] }>('/api/traces');
      setTraces(data.traces);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Traces"
        lead="One trace per chat request, one span per unit of work: memory retrieval, each tool call, the LLM call with its token usage. Spans record structured input and output, so when an answer is wrong you can see whether retrieval, the tool, or the model dropped the ball."
        files={['src/ai/tracing.ts', 'src/app/api/traces/route.ts']}
      />

      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      {loading ? (
        <Spinner label="Loading traces…" />
      ) : traces.length === 0 ? (
        <EmptyState>
          No traces yet. Send a message in <a className="text-indigo-400 hover:underline" href="/chat">Chat</a> — even
          a failed one (like before configuring your API key) will leave a trace.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {traces.map((trace) => (
            <Card key={trace.id}>
              <button
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                onClick={() => setExpandedId(expandedId === trace.id ? null : trace.id)}
              >
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-neutral-500">
                    {trace.conversationId.slice(0, 8)}
                  </span>
                  <span className="text-neutral-300">{trace.model}</span>
                  {trace.error ? (
                    <Badge tone="red">error</Badge>
                  ) : (
                    <Badge tone="green">{trace.finishReason ?? 'running…'}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  {trace.usage && (
                    <>
                      <Badge tone="indigo">{trace.usage.inputTokens} in</Badge>
                      <Badge tone="indigo">{trace.usage.outputTokens} out</Badge>
                    </>
                  )}
                  {trace.durationMs != null && <span>{trace.durationMs}ms</span>}
                  <span>{new Date(trace.startedAt).toLocaleTimeString()}</span>
                </div>
              </button>

              {expandedId === trace.id && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-600">
                    {trace.spans.length} spans, chronological
                  </p>
                  {trace.spans.map((span) => (
                    <div key={span.id} className="rounded-lg border border-neutral-800 bg-black/25 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone={span.kind === 'llm' ? 'indigo' : span.kind === 'tool' ? 'green' : 'neutral'}>
                            {span.kind}
                          </Badge>
                          <span className="font-mono text-xs text-neutral-300">{span.name}</span>
                          {span.status === 'error' && <Badge tone="red">error</Badge>}
                        </div>
                        <span className="text-xs text-neutral-500">{span.durationMs}ms</span>
                      </div>
                      {span.error && <p className="mt-2 text-xs text-red-300">{span.error}</p>}
                      {span.input != null && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] text-neutral-500">input</summary>
                          <div className="mt-1">
                            <JsonPre value={span.input} />
                          </div>
                        </details>
                      )}
                      {span.output != null && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-neutral-500">output</summary>
                          <div className="mt-1">
                            <JsonPre value={span.output} />
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
