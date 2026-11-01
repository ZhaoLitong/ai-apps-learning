// A tiny helper shared by every API route: turn a thrown error into a JSON
// response with the right status code and a message safe to show the user.
//
// Two rules this encodes:
//  1. Configuration problems (no API key) are 503 "service not configured",
//     not 500 — they're an environment issue, not a bug.
//  2. Log the full error server-side, return the message client-side. (In a
//     real product you'd scrub internal details from the message; here the
//     messages ARE meant to be educational.)

export function apiError(error: unknown): Response {
  console.error('[api]', error);
  const message = error instanceof Error ? error.message : String(error);
  const status = /api key|not configured/i.test(message) ? 503 : 500;
  return Response.json({ error: message }, { status });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
