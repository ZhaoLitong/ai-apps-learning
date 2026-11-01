// Tiny fetch helpers for client components: parse JSON and turn non-2xx
// responses into thrown Errors carrying the server's `error` message, so
// pages can just try/catch and render ErrorBanner.

export async function apiGetOrThrow<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function apiSendOrThrow<T>(
  url: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parsed.error ?? `Request failed (${res.status})`);
  return parsed as T;
}
