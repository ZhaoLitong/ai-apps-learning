// /api/search — the RETRIEVAL PLAYGROUND.
// Runs raw vector search against the knowledge base and returns chunks WITH
// their similarity scores. Use this page to build intuition for what the
// model actually "sees" — and how topK / the similarity floor change it.
import { retrieveContext } from '@/ai/rag';
import { assertConfigured } from '@/lib/config';
import { apiError, badRequest } from '@/lib/http';

export async function POST(req: Request) {
  try {
    assertConfigured(); // embedding the query needs the provider
    const body = (await req.json()) as { query?: string; topK?: number };
    if (!body.query?.trim()) return badRequest('A non-empty "query" is required.');

    const startedAt = Date.now();
    const topK = Math.min(Math.max(Number(body.topK) || 4, 1), 10);
    const results = await retrieveContext(body.query, { topK });

    return Response.json({ results, tookMs: Date.now() - startedAt });
  } catch (error) {
    return apiError(error);
  }
}
