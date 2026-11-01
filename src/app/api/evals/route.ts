// /api/evals — eval history + running evals from the UI.
// GET  → recent eval runs (same data `npm run eval` writes)
// POST → run the dataset now (slow: one or more LLM calls per case!)
import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { evalRuns } from '@/db/schema';
import { runEvals } from '@/ai/evals/runner';
import { apiError, badRequest } from '@/lib/http';

export async function GET() {
  try {
    const runs = await db.select().from(evalRuns).orderBy(desc(evalRuns.startedAt)).limit(20);
    return Response.json({ runs });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { dataset?: string };
    const dataset = body.dataset ?? 'learning-basics';
    if (typeof dataset !== 'string') return badRequest('"dataset" must be a string.');
    const run = await runEvals(dataset);
    return Response.json(run, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
