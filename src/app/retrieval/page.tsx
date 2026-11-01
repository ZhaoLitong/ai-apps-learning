'use client';

// The RETRIEVAL PLAYGROUND — RAG with the model removed.
// Type a query, see exactly which chunks a cosine search returns and how
// strong each match is. This is the best place to build intuition for what
// the model gets handed in /chat: same function (retrieveContext), same
// numbers, no generation step.
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from '@/components/ui';
import type { RetrievedChunk } from '@/lib/types';

export default function RetrievalPage() {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(4);
  const [results, setResults] = useState<RetrievedChunk[] | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Search failed');
      setResults(body.results);
      setTookMs(body.tookMs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Retrieval playground"
        lead="Raw semantic search against the knowledge base: your query is embedded, compared with every stored chunk by cosine similarity, and the closest matches come back. Try rephrasing the same question — synonym-heavy phrasing should still hit. This is exactly what the searchKnowledgeBase tool hands to the model."
        files={['src/ai/rag.ts', 'src/app/api/search/route.ts']}
      />

      <Card className="mb-6">
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Input
            className="min-w-64 flex-1"
            placeholder='e.g. "why do chunks overlap?"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            top-k
            <Input
              type="number"
              min={1}
              max={10}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-16"
            />
          </label>
          <Button type="submit" disabled={!query.trim() || loading}>
            Search
          </Button>
        </form>
        {loading && (
          <div className="mt-3">
            <Spinner label="embedding query → cosine search…" />
          </div>
        )}
      </Card>

      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      {results !== null && (
        <div>
          <p className="mb-3 text-xs text-neutral-500">
            {results.length} chunk{results.length === 1 ? '' : 's'} in {tookMs}ms
            (chunks below the similarity floor are dropped — tune{' '}
            <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono">retrievalMinSimilarity</code> in src/lib/config.ts)
          </p>
          {results.length === 0 ? (
            <EmptyState>Nothing scored above the similarity floor. Try a different query.</EmptyState>
          ) : (
            <div className="space-y-3">
              {results.map((r) => (
                <Card key={r.chunkId}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-neutral-200">
                      {r.documentTitle} · chunk #{r.chunkIndex}
                    </span>
                    <Badge tone={r.similarity > 0.5 ? 'green' : r.similarity > 0.3 ? 'indigo' : 'neutral'}>
                      {(r.similarity * 100).toFixed(1)}% similar
                    </Badge>
                  </div>
                  {/* The bar is the cosine similarity, visualized. */}
                  <div className="mb-3 h-1 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                      style={{ width: `${Math.max(2, r.similarity * 100)}%` }}
                    />
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">{r.content}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
