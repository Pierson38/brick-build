import { promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getLibrary } from '@/app/api/library/route';
import { POST as postFile } from '@/app/api/library/files/route';
import { GET as getFile } from '@/app/api/library/files/[sha]/route';
import { POST as postSet } from '@/app/api/library/sets/route';
import { PATCH as patchSet } from '@/app/api/library/sets/[setId]/route';
import { GET as getProgress, PUT as putProgress } from '@/app/api/library/builds/[buildId]/progress/route';
import { guard } from '@/server/http/guard';

const ORIGIN = 'http://127.0.0.1:3000';
const MINI = readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'mini-4-pieces.mpd'));
let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-api-'));
  process.env.BRICK_LAB_DATA_DIR = dir;
});
afterAll(async () => {
  delete process.env.BRICK_LAB_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

const req = (url: string, init: RequestInit & { headers?: Record<string, string> } = {}, write = init.method !== undefined && init.method !== 'GET') =>
  new Request(`${ORIGIN}${url}`, {
    ...init,
    headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'same-origin', ...(write ? { origin: ORIGIN, 'x-brick-lab': '1' } : {}), ...init.headers },
  });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

describe('request guard', () => {
  const h = (headers: Record<string, string>) => new Request(`${ORIGIN}/api/library`, { method: 'POST', headers });
  const good = { host: '127.0.0.1:3000', origin: ORIGIN, 'x-brick-lab': '1', 'sec-fetch-site': 'same-origin' };
  it('accepts the app itself, on 127.0.0.1 and localhost', () => {
    expect(guard(h(good), { write: true })).toBeNull();
    expect(guard(h({ ...good, host: 'localhost:3000', origin: 'http://localhost:3000' }), { write: true })).toBeNull();
    expect(guard(new Request(`${ORIGIN}/x`, { headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'none' } }), { write: false })).toBeNull();
  });
  it.each([
    ['DNS rebinding host', { ...good, host: 'evil.example:3000', origin: 'http://evil.example:3000' }],
    ['cross-site page', { ...good, 'sec-fetch-site': 'cross-site' }],
    ['same-site other port', { ...good, 'sec-fetch-site': 'same-site' }],
    ['other origin', { ...good, origin: 'http://127.0.0.1:8080' }],
    ['no origin (curl, form)', { host: good.host, 'x-brick-lab': '1' }],
    ['no app header (simple form post)', { host: good.host, origin: ORIGIN }],
    ['null origin (sandboxed iframe, file://)', { ...good, origin: 'null' }],
  ])('refuses a write: %s', async (_name, headers) => {
    const r = guard(h(headers as Record<string, string>), { write: true });
    expect(r?.status).toBe(403);
  });
  it('refuses reads from another site or host', () => {
    expect(guard(new Request(`${ORIGIN}/x`, { headers: { host: 'attacker.test', 'sec-fetch-site': 'same-origin' } }), { write: false })?.status).toBe(403);
    expect(guard(new Request(`${ORIGIN}/x`, { headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site' } }), { write: false })?.status).toBe(403);
  });
});

describe('library routes', () => {
  it('import → set → progress → rename, through the HTTP handlers', async () => {
    const up = await postFile(req('/api/library/files?kind=model&name=mini-4-pieces.mpd', { method: 'POST', body: MINI, headers: { 'content-type': 'application/octet-stream' } }));
    expect(up.status).toBe(201);
    const { file } = (await up.json()) as { file: { sha256: string } };
    const dup = await postFile(req('/api/library/files?kind=model&name=again.mpd', { method: 'POST', body: MINI, headers: { 'content-type': 'application/octet-stream' } }));
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ duplicate: true });

    const created = await postSet(req('/api/library/sets', { method: 'POST', body: JSON.stringify({ setNumber: '90010-1', name: 'Mini', builds: [{ label: 'Principal', modelFileId: file.sha256 }] }), headers: { 'content-type': 'application/json' } }));
    expect(created.status).toBe(201);
    const { set, builds } = (await created.json()) as { set: { id: string }; builds: { id: string }[] };
    const buildId = builds[0]!.id;

    const progress = { schemaVersion: 2, modelContentHash: file.sha256, displayName: 'mini-4-pieces.mpd', buildMode: 'guided', placedOccurrenceIds: ['mini-4-pieces.mpd#0'], totalOccurrences: 4, updatedAtIso: new Date().toISOString() };
    const put = await putProgress(req(`/api/library/builds/${buildId}/progress`, { method: 'PUT', body: JSON.stringify({ baseRevision: null, progress }), headers: { 'content-type': 'application/json' } }), params({ buildId }));
    expect(await put.json()).toMatchObject({ revision: 1 });
    const stale = await putProgress(req(`/api/library/builds/${buildId}/progress`, { method: 'PUT', body: JSON.stringify({ baseRevision: null, progress }), headers: { 'content-type': 'application/json' } }), params({ buildId }));
    expect(stale.status).toBe(409);
    expect(await (await getProgress(req(`/api/library/builds/${buildId}/progress`), params({ buildId }))).json()).toMatchObject({ revision: 1, progress: { placedOccurrenceIds: ['mini-4-pieces.mpd#0'] } });

    const lib = (await (await getLibrary(req('/api/library'))).json()) as { revision: number };
    const renamed = await patchSet(req(`/api/library/sets/${set.id}`, { method: 'PATCH', body: JSON.stringify({ baseRevision: lib.revision, name: 'Mini renommé' }), headers: { 'content-type': 'application/json' } }), params({ setId: set.id }));
    expect(renamed.status).toBe(200);
    const after = (await (await getLibrary(req('/api/library'))).json()) as { sets: { name: string; builds: { progress: { placed: number } }[] }[] };
    expect(after.sets[0]).toMatchObject({ name: 'Mini renommé', builds: [{ progress: { placed: 1 } }] });

    const bytes = await getFile(req(`/api/library/files/${file.sha256}`), params({ sha: file.sha256 }));
    expect(Buffer.from(await bytes.arrayBuffer()).equals(MINI)).toBe(true);
  });

  it('refuses unauthorised and malformed requests before touching the disk', async () => {
    const cross = await postFile(new Request(`${ORIGIN}/api/library/files?kind=model&name=x.mpd`, { method: 'POST', body: MINI, headers: { host: '127.0.0.1:3000', origin: 'http://evil.test', 'content-type': 'application/octet-stream' } }));
    expect(cross.status).toBe(403);
    const badSha = await getFile(req('/api/library/files/..%2F..%2Fetc%2Fpasswd'), params({ sha: '../../etc/passwd' }));
    expect(badSha.status).toBe(422);
    const badKind = await postFile(req('/api/library/files?kind=exe&name=x', { method: 'POST', body: 'x', headers: { 'content-type': 'application/octet-stream' } }));
    expect(badKind.status).toBe(422);
    const notJson = await postSet(req('/api/library/sets', { method: 'POST', body: 'setNumber=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
    expect(notJson.status).toBe(415);
    const badBuild = await putProgress(req('/api/library/builds/..%2Fx/progress', { method: 'PUT', body: JSON.stringify({ baseRevision: null, progress: {} }), headers: { 'content-type': 'application/json' } }), params({ buildId: '../x' }));
    expect(badBuild.status).toBe(404);
    const huge = await postSet(req('/api/library/sets', { method: 'POST', body: JSON.stringify({ x: 'y'.repeat(3 * 1024 * 1024) }), headers: { 'content-type': 'application/json' } }));
    expect(huge.status).toBe(413);
  });
});
