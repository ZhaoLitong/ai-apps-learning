'use client';

// The Memory page — watch the assistant's long-term brain.
// Rows arrive from three sources: 'auto' (extracted after each exchange),
// 'tool' (the model called rememberFact), 'manual' (added here). Each one is
// vector-embedded and competes in the top-k similarity match on every future
// user message.
import { useCallback, useEffect, useState } from 'react';
import { apiGetOrThrow, apiSendOrThrow } from '@/lib/client';
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from '@/components/ui';

interface Memory {
  id: string;
  content: string;
  kind: string;
  source: string;
  createdAt: string;
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiGetOrThrow<{ memories: Memory[] }>('/api/memory');
      setMemories(data.memories);
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

  async function add() {
    if (!draft.trim()) return;
    try {
      await apiSendOrThrow('/api/memory', 'POST', { content: draft });
      setDraft('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    await apiSendOrThrow(`/api/memory/${id}`, 'DELETE');
    await load();
  }

  async function clearAll() {
    if (!confirm('Delete ALL memories?')) return;
    await apiSendOrThrow('/api/memory', 'DELETE');
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Memory"
        lead="Long-term memory is a table of embedded facts. It's written two ways — a small model extracts durable facts after each exchange ('auto'), and the model can call rememberFact when you explicitly ask ('tool'). On every future message the top-3 most similar memories are injected into the system prompt. Add one below, then start a new chat and see it in action."
        files={['src/ai/memory.ts', 'src/ai/prompts.ts']}
      />

      <Card className="mb-8">
        <div className="flex gap-2">
          <Input
            placeholder='e.g. "The user is building a startup in fintech"'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <Button onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      </Card>

      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {memories.length} memor{memories.length === 1 ? 'y' : 'ies'}
        </h2>
        {memories.length > 0 && (
          <Button variant="danger" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading memories…" />
      ) : memories.length === 0 ? (
        <EmptyState>
          Nothing remembered yet. Chat with the assistant, tell it to remember something
          explicitly, or add a fact manually above.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {memories.map((memory) => (
            <Card key={memory.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-neutral-200">{memory.content}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-500">
                  <Badge tone={memory.source === 'auto' ? 'amber' : memory.source === 'tool' ? 'indigo' : 'neutral'}>
                    {memory.source}
                  </Badge>
                  <span>{new Date(memory.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <Button variant="ghost" onClick={() => remove(memory.id)}>
                ✕
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
