import type { LookupAddress } from 'node:dns';
import { validateHeaderName, validateHeaderValue } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSetNumber, type SetNumber } from '@/domain/library/set-number';
import { allowedUrl, checkedLookup, isPublicAddress, NetError, safeGet, type Transport } from '@/server/net/safe-fetch';
import { omrFileUrl, onlineLookup, parseOmrSetPage, resetRebrickableForTests } from '@/server/online/sources';

// No test here touches the network: every exchange goes through a fake transport or resolver.

const sn = (s: string): SetNumber => {
  const r = parseSetNumber(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

type Reply = { status: number; body?: string | Buffer; headers?: Record<string, string>; chunks?: number; delayMs?: number; error?: string };
function fake(routes: Record<string, Reply>, seen: { url: string; headers: Record<string, string> }[] = []): Transport {
  return async (url, headers, signal) => {
    seen.push({ url: url.toString(), headers: { ...headers } });
    const r = routes[url.toString()];
    if (!r) throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    if (r.error) throw Object.assign(new Error(r.error), { code: r.error });
    if (r.delayMs) await new Promise((res, rej) => { const t = setTimeout(res, r.delayMs); signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' })); }); });
    const body = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body ?? '');
    const n = r.chunks ?? 1;
    return {
      status: r.status, headers: r.headers ?? {},
      body: (async function* () {
        for (let i = 0; i < n; i++) yield body.subarray(Math.floor((i * body.length) / n), Math.floor(((i + 1) * body.length) / n));
      })(),
    };
  };
}

const POLICY = { hosts: ['library.ldraw.org'], maxBytes: 1000, timeoutMs: 200 };

describe('safe outgoing requests', () => {
  it.each([
    ['127.0.0.1', false], ['10.1.2.3', false], ['172.20.0.1', false], ['192.168.1.10', false], ['169.254.169.254', false], ['100.64.0.1', false], ['0.0.0.0', false],
    ['::1', false], ['fe80::1', false], ['fd00::1', false], ['::ffff:127.0.0.1', false], ['::ffff:10.0.0.1', false], ['::ffff:7f00:1', false], ['0:0:0:0:0:ffff:7f00:1', false], ['::ffff:6815:304', true], ['224.0.0.1', false],
    ['104.21.3.4', true], ['2606:4700::6810:1', true], ['::ffff:104.21.3.4', true], ['not-an-ip', false],
  ])('address %s public = %s', (ip, ok) => expect(isPublicAddress(ip)).toBe(ok));

  it.each([
    'http://library.ldraw.org/omr/set/31040', 'https://evil.example/omr', 'https://library.ldraw.org.evil.example/', 'https://user:pw@library.ldraw.org/',
    'https://library.ldraw.org:8443/', 'https://127.0.0.1/', 'file:///etc/passwd', 'not a url',
  ])('refuses %s', (url) => expect(() => allowedUrl(url, POLICY)).toThrow(NetError));

  it('DNS answer with a private address (DNS rebinding) refuses the connection', async () => {
    const resolver = ((_h: string, _o: object, cb: (e: null, a: LookupAddress[]) => void) => cb(null, [{ address: '104.21.3.4', family: 4 }, { address: '127.0.0.1', family: 4 }])) as never;
    const err = await new Promise<NodeJS.ErrnoException | null>((res) => checkedLookup(resolver)('library.ldraw.org', {}, (e) => res(e)));
    expect(err?.code).toBe('EPRIVATEADDR');
    const ok = ((_h: string, _o: object, cb: (e: null, a: LookupAddress[]) => void) => cb(null, [{ address: '104.21.3.4', family: 4 }])) as never;
    const addr = await new Promise<string>((res) => checkedLookup(ok)('library.ldraw.org', {}, (_e, a) => res(a as string)));
    expect(addr).toBe('104.21.3.4');
  });

  it('follows a redirect on the same allowed host, refuses one to another host', async () => {
    const t = fake({
      'https://library.ldraw.org/a': { status: 302, headers: { location: '/b' } },
      'https://library.ldraw.org/b': { status: 200, body: 'ok' },
      'https://library.ldraw.org/c': { status: 301, headers: { location: 'https://169.254.169.254/latest/meta-data' } },
      'https://library.ldraw.org/d': { status: 302, headers: { location: 'http://library.ldraw.org/b' } },
    });
    expect((await safeGet('https://library.ldraw.org/a', POLICY, t)).body.toString()).toBe('ok');
    await expect(safeGet('https://library.ldraw.org/c', POLICY, t)).rejects.toMatchObject({ code: 'REDIRECT' });
    await expect(safeGet('https://library.ldraw.org/d', POLICY, t)).rejects.toMatchObject({ code: 'REDIRECT' });
  });

  it('sends only headers that Node accepts (ASCII), whatever the source', async () => {
    process.env.REBRICKABLE_API_KEY = 'abcdef0123456789abcdef0123456789';
    resetRebrickableForTests();
    const seen: { url: string; headers: Record<string, string> }[] = [];
    await onlineLookup(sn('90010'), fake({}, seen));
    delete process.env.REBRICKABLE_API_KEY;
    expect(seen.length).toBe(2);
    for (const { headers } of seen) for (const [k, v] of Object.entries(headers)) expect(() => { validateHeaderName(k); validateHeaderValue(k, v); }).not.toThrow();
  });

  it('bounds size (declared or streamed), time, and reports HTTP and network errors', async () => {
    const t = fake({
      'https://library.ldraw.org/big': { status: 200, headers: { 'content-length': '5000' }, body: 'x' },
      'https://library.ldraw.org/stream': { status: 200, body: Buffer.alloc(5000, 1), chunks: 10 },
      'https://library.ldraw.org/slow': { status: 200, body: 'x', delayMs: 2000 },
      'https://library.ldraw.org/gone': { status: 503 },
      'https://library.ldraw.org/reset': { status: 0, error: 'ECONNRESET' },
    });
    await expect(safeGet('https://library.ldraw.org/big', POLICY, t)).rejects.toMatchObject({ code: 'TOO_LARGE' });
    await expect(safeGet('https://library.ldraw.org/stream', POLICY, t)).rejects.toMatchObject({ code: 'TOO_LARGE' });
    await expect(safeGet('https://library.ldraw.org/slow', POLICY, t)).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(safeGet('https://library.ldraw.org/gone', POLICY, t)).rejects.toMatchObject({ code: 'HTTP', status: 503 });
    await expect(safeGet('https://library.ldraw.org/reset', POLICY, t)).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

/** Synthetic page with the structure of an OMR set page (no real page is stored). */
const omrPage = (n: string, name: string, files: { id: number; file: string; kind: string; author: string }[]) => `<!doctype html><html><head>
<title>LDraw.org Official Model Repository - ${name} | LDraw.org Library</title></head><body>
<a href="https://library.ldraw.org/omr/sets">Sets List</a><main><div>${n} - ${name}</div><div>Models</div>
${files.map((f) => `<div><div> ${f.kind} </div><div><span class="x">Author:</span>${f.author}</div>
<a href="https://library.ldraw.org/media/omr_models/${f.id}/${f.file}?v=1758937619">Download</a></div>`).join('\n')}
<a href="https://library.ldraw.org/media/omr_models/999/other-set.mpd">unrelated</a>
<a href="https://evil.example/media/omr_models/1/${n}.mpd">evil</a>
</main></body></html>`;

describe('LDraw OMR set page', () => {
  const page = omrPage('90010-1', 'Test Racers', [
    { id: 505, file: '90010-1_Quad.mpd', kind: 'Alternate Model', author: 'Test Author [ta]' },
    { id: 503, file: '90010-1.mpd', kind: 'Main Model', author: 'Test Author [ta]' },
    { id: 504, file: '90010-1_Dune-Buggy.mpd', kind: 'Alternate Model', author: 'Other &amp; Co' },
  ]);
  it('lists the main model then the alternates, only files of this set on the OMR host', () => {
    const r = parseOmrSetPage(page, sn('90010'));
    expect(r.setName).toBe('Test Racers');
    expect(r.models.map((m) => [m.fileName, m.alternate, m.title, m.kind, m.author])).toEqual([
      ['90010-1.mpd', false, 'Test Racers', 'Main Model', 'Test Author [ta]'],
      ['90010-1_Quad.mpd', true, 'Quad', 'Alternate Model', 'Test Author [ta]'],
      ['90010-1_Dune-Buggy.mpd', true, 'Dune Buggy', 'Alternate Model', 'Other & Co'],
    ]);
    expect(r.models.every((m) => m.fileUrl.startsWith('https://library.ldraw.org/media/omr_models/') && !m.fileUrl.includes('?'))).toBe(true);
    // another variant of the number is another box
    expect(parseOmrSetPage(page, sn('90010-2')).models).toEqual([]);
  });
  it('a page whose layout changed gives no model (the user is sent to the page), never a guess', () => {
    expect(parseOmrSetPage('<html><title>Something else</title><a href="/media/omr_models/1/90010-1.mpd">x</a></html>', sn('90010')).models).toEqual([]);
  });
  it.each([
    ['https://library.ldraw.org/media/omr_models/503/31040-1.mpd', true],
    ['https://library.ldraw.org/media/omr_models/503/31040-1.mpd?v=1', false],
    ['https://library.ldraw.org/media/omr_models/503/../../.env', false],
    ['https://library.ldraw.org/library/official/parts/3001.dat', false],
    ['https://evil.example/media/omr_models/503/31040-1.mpd', false],
    ['http://library.ldraw.org/media/omr_models/503/31040-1.mpd', false],
    ['https://library.ldraw.org/media/omr_models/503/31040-1.exe', false],
  ])('download URL %s accepted = %s', (url, ok) => expect(omrFileUrl(url) !== null).toBe(ok));
});

describe('online lookup (OMR + optional Rebrickable)', () => {
  const OLD = { key: process.env.REBRICKABLE_API_KEY, online: process.env.BRICK_LAB_ONLINE };
  beforeEach(() => {
    delete process.env.REBRICKABLE_API_KEY;
    delete process.env.BRICK_LAB_ONLINE;
    resetRebrickableForTests();
  });
  afterEach(() => {
    if (OLD.key === undefined) delete process.env.REBRICKABLE_API_KEY; else process.env.REBRICKABLE_API_KEY = OLD.key;
    if (OLD.online === undefined) delete process.env.BRICK_LAB_ONLINE; else process.env.BRICK_LAB_ONLINE = OLD.online;
  });

  it('several models, no Rebrickable key: works, says Rebrickable is optional, LEGO stays manual', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const page = omrPage('90010-1', 'Test Racers', [{ id: 1, file: '90010-1.mpd', kind: 'Main Model', author: 'A' }, { id: 2, file: '90010-1_Boat.mpd', kind: 'Alternate Model', author: 'A' }]);
    const r = await onlineLookup(sn('90010'), fake({ 'https://library.ldraw.org/omr/set/90010-1': { status: 200, body: page } }, seen));
    expect(r.omr).toMatchObject({ status: 'ok', message: '2 modèle(s) 3D sur l’OMR, dont 1 alternatif(s).' });
    expect(r.rebrickable.status).toBe('not_configured');
    expect(r.lego).toMatchObject({ status: 'manual', pageUrl: 'https://www.lego.com/fr-fr/service/building-instructions/90010' });
    expect(seen.map((s) => s.url)).toEqual(['https://library.ldraw.org/omr/set/90010-1']); // one request, nothing else
  });

  it('no model / source unavailable / offline switch', async () => {
    expect((await onlineLookup(sn('90011'), fake({ 'https://library.ldraw.org/omr/set/90011-1': { status: 404 } }))).omr).toMatchObject({ status: 'not_found', message: 'Aucun modèle 3D trouvé pour ce set sur l’OMR.' });
    const down = await onlineLookup(sn('90012'), fake({ 'https://library.ldraw.org/omr/set/90012-1': { status: 503 } }));
    expect(down.omr.status).toBe('unavailable');
    expect(down.omr.pageUrl).toBe('https://library.ldraw.org/omr/set/90012-1');
    expect((await onlineLookup(sn('90013'), fake({}))).omr.status).toBe('unavailable'); // DNS failure
    process.env.BRICK_LAB_ONLINE = '0';
    const seen: { url: string; headers: Record<string, string> }[] = [];
    expect((await onlineLookup(sn('90010'), fake({}, seen))).omr.status).toBe('unavailable');
    expect(seen).toEqual([]);
  });

  it('Rebrickable with a local key: metadata only, the key is sent to Rebrickable and never returned', async () => {
    process.env.REBRICKABLE_API_KEY = 'abcdef0123456789abcdef0123456789';
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const t = fake({
      'https://library.ldraw.org/omr/set/90010-1': { status: 404 },
      'https://rebrickable.com/api/v3/lego/sets/90010-1/': { status: 200, body: JSON.stringify({ set_num: '90010-1', name: 'Test Racers', year: 2016, num_parts: 64, set_url: 'https://rebrickable.com/sets/90010-1/x/', set_img_url: 'https://cdn.rebrickable.com/x.jpg' }) },
      'https://rebrickable.com/api/v3/lego/sets/90014-1/': { status: 401, body: '{"detail":"Invalid token."}' },
    }, seen);
    const r = await onlineLookup(sn('90010'), t);
    expect(r.rebrickable).toMatchObject({ status: 'ok', set: { name: 'Test Racers', year: 2016, numParts: 64 } });
    expect(seen.find((s) => s.url.includes('rebrickable'))?.headers.authorization).toBe('key abcdef0123456789abcdef0123456789');
    expect(JSON.stringify(r)).not.toContain('abcdef0123456789');
    const refused = await onlineLookup(sn('90014'), t);
    expect(refused.rebrickable).toMatchObject({ status: 'unavailable', message: 'Rebrickable indisponible : clé refusée.' });
    expect(JSON.stringify(refused)).not.toContain('abcdef0123456789');
  });
});
