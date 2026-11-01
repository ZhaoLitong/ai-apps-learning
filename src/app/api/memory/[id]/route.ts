// /api/memory/[id] — delete a single memory.
import { deleteMemory } from '@/ai/memory';
import { apiError } from '@/lib/http';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteMemory(id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
