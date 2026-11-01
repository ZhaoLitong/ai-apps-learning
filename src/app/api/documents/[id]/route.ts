// /api/documents/[id] — delete a document (chunks cascade via FK).
// Next.js 15+: dynamic route params arrive as a Promise you must await.
import { deleteDocument } from '@/ai/rag';
import { apiError } from '@/lib/http';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteDocument(id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
