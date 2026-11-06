import { promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as postImport } from '@/app/api/library/import/route';
import { POST as postStage } from '@/app/api/library/import/files/route';
import { POST as postOmr } from '@/app/api/library/import/omr/route';
import { POST as postPrepare } from '@/app/api/library/import/prepare/route';
import { GET as getLookup } from '@/app/api/library/lookup/route';
import { POST as postOnline } from '@/app/api/library/lookup/online/route';

const ORIGIN = 'http://127.0.0.1:3000';
const MINI = readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'mini-4-pieces.mpd'));
let dir: string;
const OLD = { online: process.env.BRICK_LAB_ONLINE, fixtures: process.env.BRICK_LAB_NET_FIXTURES };

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-p8-api-'));
  process.env.BRICK_LAB_DATA_DIR = dir;
  // any outgoing request would hit this empty table and fail: proves nothing leaves the machine
  await fs.writeFile(path.join(dir, 'net.json'), '{}');
  process.env.BRICK_LAB_NET_FIXTURES = path.join(dir, 'net.json');
});
afterAll(async () => {
  delete process.env.BRICK_LAB_DATA_DIR;
  if (OLD.online === undefined) delete process.env.BRICK_LAB_ONLINE; else process.env.BRICK_LAB_ONLINE = OLD.online;
  if (OLD.fixtures === undefined) delete process.env.BRICK_LAB_NET_FIXTURES; else process.env.BRICK_LAB_NET_FIXTURES = OLD.fixtures;
  await fs.rm(dir, { recursive: true, force: true });
});

const app = { host: '127.0.0.1:3000', 'sec-fetch-site': 'same-origin', origin: ORIGIN, 'x-brick-lab': '1' };
const post = (url: string, body: unknown, headers: Record<string, string> = app) => new Request(`${ORIGIN}${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

describe('P8 routes', () => {
  it('outgoing requests can only be triggered by the application page (no cross-site, no DNS rebinding, no plain form)', async () => {
    for (const headers of [
      { ...app, 'sec-fetch-site': 'cross-site' }, { ...app, host: 'evil.example:3000', origin: 'http://evil.example:3000' }, { host: app.host, origin: ORIGIN },
    ]) {
      expect((await postOnline(post('/api/library/lookup/online', { setNumber: '31040' }, headers))).status).toBe(403);
      expect((await postOmr(post('/api/library/import/omr', { url: 'https://library.ldraw.org/media/omr_models/503/31040-1.mpd' }, headers))).status).toBe(403);
    }
  });

  it('only OMR model files can be downloaded: other URLs are refused before any connection', async () => {
    for (const url of ['https://evil.example/x.mpd', 'http://127.0.0.1:3000/api/library', 'https://library.ldraw.org/media/omr_models/1/x.exe', 'file:///etc/passwd', 'https://169.254.169.254/latest', 42]) {
      const r = await postOmr(post('/api/library/import/omr', { url }));
      expect(r.status).toBe(403);
    }
  });

  it('source unavailable: a clear error, nothing staged', async () => {
    const r = await postOmr(post('/api/library/import/omr', { url: 'https://library.ldraw.org/media/omr_models/503/31040-1.mpd' }));
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: { message: string } }).error.message).toContain('Ouvre la page de l’OMR');
    expect(await fs.readdir(path.join(dir, 'library', 'staging')).catch(() => [])).toEqual([]);
  });

  it('offline switch: online lookup answers without any request, the local search still works', async () => {
    process.env.BRICK_LAB_ONLINE = '0';
    const r = (await (await postOnline(post('/api/library/lookup/online', { setNumber: '31040' }))).json()) as { omr: { status: string }; lego: { status: string } };
    expect(r.omr.status).toBe('unavailable');
    expect(r.lego.status).toBe('manual');
    expect((await postOmr(post('/api/library/import/omr', { url: 'https://library.ldraw.org/media/omr_models/503/31040-1.mpd' }))).status).toBe(403);
    const local = await getLookup(new Request(`${ORIGIN}/api/library/lookup?number=31040`, { headers: { host: app.host, 'sec-fetch-site': 'same-origin' } }));
    expect(local.status).toBe(200);
    expect(((await local.json()) as { online: { omr: boolean } }).online.omr).toBe(false);
    delete process.env.BRICK_LAB_ONLINE;
  });

  it('quick import through the routes: stage, prepare, confirm, retry', async () => {
    const staged = await postStage(new Request(`${ORIGIN}/api/library/import/files?kind=model&name=mini.mpd`, { method: 'POST', body: MINI, headers: { ...app, 'content-type': 'application/octet-stream' } }));
    expect(staged.status).toBe(201);
    const { file } = (await staged.json()) as { file: { sha256: string } };
    const ref = { origin: 'staged', sha256: file.sha256 };
    const p = (await (await postPrepare(post('/api/library/import/prepare', { setNumber: '90100', files: [{ kind: 'model', ref }] }))).json()) as { models: { roots: { rootName: string }[] }[] };
    expect(p.models[0]!.roots[0]!.rootName).toBe('mini-4-pieces.mpd');
    const body = { target: { type: 'new', setNumber: '90100', name: 'Mini' }, builds: [{ label: 'Modèle principal', model: ref, rootName: 'mini-4-pieces.mpd', booklets: [], mapping: null }] };
    const first = await postImport(post('/api/library/import', body));
    expect(first.status).toBe(201);
    // the answer was lost and the browser sends the same request with the library copy
    const retry = await postImport(post('/api/library/import', { ...body, builds: [{ ...body.builds[0], model: { origin: 'library', sha256: file.sha256 } }] }));
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { alreadyPresent: unknown[] }).alreadyPresent).toHaveLength(1);
    // malformed requests
    expect((await postImport(post('/api/library/import', { target: { type: 'new' }, builds: [] }))).status).toBe(422);
    expect((await postPrepare(post('/api/library/import/prepare', { files: [{ kind: 'exe', ref }] }))).status).toBe(422);
    expect((await postStage(new Request(`${ORIGIN}/api/library/import/files?kind=model&name=x.mpd`, { method: 'POST', body: MINI, headers: { ...app, 'content-type': 'text/plain' } }))).status).toBe(415);
  });
});
