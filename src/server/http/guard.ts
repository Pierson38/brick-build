import { msgs } from '@/i18n/runtime';
import { LibraryError } from '../library/store';
import { UnsafePathError } from '../library/paths';
import { enterRequestLocale } from './locale';

// Server-only. Every library route starts with `guard()`. The server listens on 127.0.0.1 only;
// these checks also refuse what a web page from another origin could make the browser send:
// - Host must be a loopback name (blocks DNS rebinding: evil.example resolving to 127.0.0.1);
// - Sec-Fetch-Site, when sent, must be same-origin (or none: typed URL);
// - writes need Origin == http://<Host> AND the custom header below, which a cross-origin page
//   cannot add without a CORS preflight that this server never accepts.

export const CLIENT_HEADER = 'x-brick-lab';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

const deny = (status: number, message: string) => Response.json({ error: { code: 'FORBIDDEN', message } }, { status, headers: { 'Cache-Control': 'no-store' } });

function hostOf(value: string | null): string | null {
  if (!value || value.length > 300) return null;
  const m = /^(\[[0-9a-f:]+\]|[A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(value);
  return m ? m[1]!.toLowerCase() : null;
}

/** Returns a refusal, or null when the request may proceed. */
export function guard(request: Request, { write }: { write: boolean }): Response | null {
  enterRequestLocale(request);
  const host = request.headers.get('host');
  if (!LOOPBACK.has(hostOf(host) ?? '')) return deny(403, msgs().server.guard.hostRefused);
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return deny(403, msgs().server.guard.crossSite);
  if (!write) return null;
  const origin = request.headers.get('origin');
  if (origin !== `http://${host}`) return deny(403, msgs().server.guard.originRefused);
  if (request.headers.get(CLIENT_HEADER) !== '1') return deny(403, msgs().server.guard.missingHeader);
  return null;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Maps errors to JSON responses; unexpected errors are logged locally and not detailed. */
export function failure(e: unknown): Response {
  if (e instanceof LibraryError) return json({ error: { code: e.code, message: e.message, ...e.details } }, e.status);
  if (e instanceof UnsafePathError) return json({ error: { code: 'FORBIDDEN', message: e.message } }, 403);
  console.error('[library]', e);
  return json({ error: { code: 'STORAGE', message: msgs().server.guard.internalError } }, 500);
}

/** Reads at most `max` bytes of the body; larger bodies are refused without being buffered. */
export async function readBody(request: Request, max: number): Promise<Buffer> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > max) throw new LibraryError('TOO_LARGE', msgs().server.guard.bodyTooLarge(Math.round(max / 1024)));
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of bodyChunks(request)) {
    size += chunk.byteLength;
    if (size > max) throw new LibraryError('TOO_LARGE', msgs().server.guard.bodyTooLarge(Math.round(max / 1024)));
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

export async function* bodyChunks(request: Request): AsyncIterable<Uint8Array> {
  if (!request.body) return;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBody(request: Request, max = 2 * 1024 * 1024): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('application/json')) throw new LibraryError('UNSUPPORTED', msgs().server.guard.jsonBodyExpected);
  let raw: unknown;
  try {
    raw = JSON.parse((await readBody(request, max)).toString('utf8'));
  } catch (e) {
    if (e instanceof LibraryError) throw e;
    throw new LibraryError('INVALID', msgs().server.guard.invalidJson);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new LibraryError('INVALID', msgs().server.guard.jsonObjectExpected);
  return raw as Record<string, unknown>;
}

export const revisionOf = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
