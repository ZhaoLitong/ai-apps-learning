// /api/documents — RAG ingestion + listing.
// GET  → every document with its chunks (what the /documents page renders)
// POST → ingest { title, content }: chunk → embed → store (see src/ai/rag.ts)
import { ingestDocument, listDocumentsWithChunks } from '@/ai/rag';
import { apiError, badRequest } from '@/lib/http';

export async function GET() {
  try {
    return Response.json({ documents: await listDocumentsWithChunks() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    // JSON only — the UI reads uploaded files client-side and sends the text.
    const body = (await req.json()) as { title?: string; content?: string; source?: string };
    if (!body.content?.trim()) return badRequest('A non-empty "content" is required.');

    const result = await ingestDocument({
      title: body.title?.trim() || 'Untitled document',
      content: body.content,
      source: body.source ?? 'manual',
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
