'use client';

// The Documents page is the RAG INGESTION workbench.
// Add a document (paste or upload a .md/.txt file) and watch it become chunks
// — those chunks are what actually get embedded and retrieved. Expand a
// document to inspect exactly what the model will see for each piece.
import { useCallback, useEffect, useState } from 'react';
import { apiGetOrThrow } from '@/lib/client';
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, PageHeader, Spinner, Textarea } from '@/components/ui';

interface DocChunk {
  id: string;
  chunkIndex: number;
  content: string;
  tokenEstimate: number;
}

interface Doc {
  id: string;
  title: string;
  source: string;
  content: string;
  createdAt: string;
  chunks: DocChunk[];
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGetOrThrow<{ documents: Doc[] }>('/api/documents');
      setDocs(data.documents);
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

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Ingestion failed');
      setTitle('');
      setContent('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this document and its chunks?')) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    await load();
  }

  // The file never touches the server as a file — we read it client-side and
  // send text. (Server-side uploads with FormData are an exercise.)
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTitle(file.name.replace(/\.[^.]+$/, ''));
    setContent(await file.text());
    e.target.value = '';
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        lead="The knowledge base that powers RAG. Ingesting a document chunks it (semantic paragraphs, ~400 estimated tokens, with overlap), embeds every chunk, and stores the vectors in Postgres. Expand a document to see its chunks — that's literally what the model retrieves."
        files={['src/ai/rag.ts', 'src/ai/chunking.ts', 'src/app/api/documents/route.ts']}
      />

      <Card className="mb-8">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-sm"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="cursor-pointer rounded-lg border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-400 hover:bg-neutral-800/60">
              or upload .md / .txt
              <input type="file" accept=".md,.markdown,.txt,text/plain" className="hidden" onChange={onFile} />
            </label>
          </div>
          <Textarea
            rows={6}
            placeholder="Paste text to ingest. Blank lines separate paragraphs — chunking uses them."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button onClick={submit} disabled={!content.trim() || submitting}>
              {submitting ? 'Ingesting…' : 'Ingest document'}
            </Button>
            {submitting && <Spinner label="chunking → embedding → storing" />}
          </div>
        </div>
      </Card>

      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Knowledge base ({docs.length} documents)
      </h2>
      {loading ? (
        <Spinner label="Loading documents…" />
      ) : docs.length === 0 ? (
        <EmptyState>
          No documents yet. Run <code className="mx-1 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">npm run db:seed</code> for
          the built-in AI-concepts reference docs, or ingest your own above.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <div className="flex items-center justify-between gap-3">
                <button
                  className="flex flex-1 items-center gap-3 text-left"
                  onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                >
                  <span className="text-neutral-600">{expandedId === doc.id ? '▾' : '▸'}</span>
                  <span className="font-medium text-neutral-200">{doc.title}</span>
                  <Badge tone="indigo">{doc.chunks.length} chunks</Badge>
                  <Badge>{doc.source}</Badge>
                </button>
                <Button variant="danger" onClick={() => remove(doc.id)}>
                  Delete
                </Button>
              </div>
              {expandedId === doc.id && (
                <div className="mt-4 space-y-2">
                  {doc.chunks.map((chunk) => (
                    <div key={chunk.id} className="rounded-lg bg-black/30 p-3">
                      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-neutral-500">
                        <Badge>chunk #{chunk.chunkIndex}</Badge>
                        <span>≈ {chunk.tokenEstimate} tokens</span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">
                        {chunk.content}
                      </p>
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
