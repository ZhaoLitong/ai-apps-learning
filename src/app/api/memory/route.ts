// /api/memory — inspect & manage long-term memory.
// GET    → all memories (newest first)
// POST   → manually add { content } (source: 'manual')
// DELETE → clear everything (the [id] route deletes one)
import { rememberFact, listMemories, clearMemories } from '@/ai/memory';
import { apiError, badRequest } from '@/lib/http';

export async function GET() {
  try {
    return Response.json({ memories: await listMemories() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { content?: string };
    if (!body.content?.trim()) return badRequest('A non-empty "content" is required.');
    const result = await rememberFact(body.content, 'manual');
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE() {
  try {
    await clearMemories();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
