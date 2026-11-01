// /api/traces — the observability feed for the /traces page.
// Returns recent traces with their spans nested, newest first.
import { asc, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { spans, traces } from '@/db/schema';
import { apiError } from '@/lib/http';

export async function GET() {
  try {
    const recentTraces = await db
      .select()
      .from(traces)
      .orderBy(desc(traces.startedAt))
      .limit(25);

    if (recentTraces.length === 0) {
      return Response.json({ traces: [] });
    }

    // One query for all spans (not one per trace), ordered so each trace's
    // spans read chronologically in the UI.
    const allSpans = await db
      .select()
      .from(spans)
      .where(
        inArray(
          spans.traceId,
          recentTraces.map((t) => t.id),
        ),
      )
      .orderBy(asc(spans.startedAt));

    return Response.json({
      traces: recentTraces.map((trace) => ({
        ...trace,
        spans: allSpans.filter((s) => s.traceId === trace.id),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
