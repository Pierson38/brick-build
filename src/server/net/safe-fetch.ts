import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { readFileSync } from 'node:fs';

// Server-only. The ONLY way the application contacts the Internet (P8), and only when the user
// clicks a button that asks for it. GET over HTTPS to a fixed list of hosts; the address is checked
// when the connection is made (no private, loopback or link-local address: no SSRF, no DNS
// rebinding); every redirect is checked again; bounded size and time; nothing is ever executed.
// Architecture and threats: docs/implementation/P8_ARCHITECTURE_IMPORT.md.

export type NetErrorCode = 'FORBIDDEN_URL' | 'PRIVATE_ADDRESS' | 'TIMEOUT' | 'TOO_LARGE' | 'HTTP' | 'NETWORK' | 'REDIRECT' | 'DISABLED';

export class NetError extends Error {
  constructor(readonly code: NetErrorCode, message: string, readonly status?: number) {
    super(message);
  }
}

export interface FetchPolicy {
  /** Exact host names allowed (no wildcard). */
  readonly hosts: readonly string[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly maxRedirects?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface FetchResult {
  readonly status: number;
  readonly url: string;
  readonly contentType: string | null;
  readonly body: Buffer;
}

/** One HTTP exchange; the default one is node:https with the checked DNS lookup. */
export type Transport = (url: URL, headers: Readonly<Record<string, string>>, signal: AbortSignal) => Promise<{
  status: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: AsyncIterable<Uint8Array>;
}>;

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is unwrapped and checked as IPv4 below (a ::ffff:0:0/96 rule would also match every IPv4 address)

/** True for an address that may be contacted (public unicast). */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    const mapped = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return isPublicAddress(mapped[1]!);
    const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
    if (hex) {
      const [hi, lo] = [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16)];
      return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
  }
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** Resolves like dns.lookup but refuses the connection when ANY resolved address is not public. */
export function checkedLookup(resolve: typeof dnsLookup = dnsLookup): LookupFunction {
  return ((hostname: string, options: object, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as LookupAddress[];
      if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
        const e: NodeJS.ErrnoException = new Error(`${hostname} : adresse non publique refusée.`);
        e.code = 'EPRIVATEADDR';
        return callback(e, '', 0);
      }
      if ((options as { all?: boolean }).all) return callback(null, list);
      return callback(null, list[0]!.address, list[0]!.family);
    });
  }) as LookupFunction;
}

export const httpsTransport: Transport = (url, headers, signal) => new Promise((resolve, reject) => {
  const req = httpsRequest(url, { method: 'GET', headers, lookup: checkedLookup(), signal, agent: false }, (res) => {
    resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res });
  });
  req.on('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EPRIVATEADDR' ? new NetError('PRIVATE_ADDRESS', e.message) : e));
  req.end();
});

/** Validates a URL against the policy (https, allowed host, default port, no credentials). */
export function allowedUrl(raw: string | URL, policy: Pick<FetchPolicy, 'hosts'>): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NetError('FORBIDDEN_URL', 'Adresse invalide.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port !== '' && url.port !== '443') || !policy.hosts.includes(url.hostname.toLowerCase())) {
    throw new NetError('FORBIDDEN_URL', `Adresse non autorisée : ${url.protocol}//${url.hostname}.`);
  }
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0) throw new NetError('FORBIDDEN_URL', 'Adresse IP littérale refusée.');
  return url;
}

/** ASCII only: Node refuses any other character in a header (found by the real P8 trial). */
export const USER_AGENT = 'BrickBuild-local/0.8 (personal app; one request per user click)';

/** GET on an allowed host; refuses everything outside the policy. */
export async function safeGet(raw: string, policy: FetchPolicy, transport: Transport = defaultTransport()): Promise<FetchResult> {
  let url = allowedUrl(raw, policy);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
  try {
    for (let hop = 0; ; hop++) {
      let res: Awaited<ReturnType<Transport>>;
      try {
        res = await transport(url, { 'user-agent': USER_AGENT, accept: '*/*', ...policy.headers }, controller.signal);
      } catch (e) {
        if (e instanceof NetError) throw e;
        if (controller.signal.aborted) throw new NetError('TIMEOUT', `Délai dépassé (${Math.round(policy.timeoutMs / 1000)} s).`);
        throw new NetError('NETWORK', `Connexion impossible à ${url.hostname} (${(e as NodeJS.ErrnoException).code ?? 'réseau'}).`);
      }
      if (res.status >= 300 && res.status < 400) {
        drain(res.body);
        const location = res.headers.location;
        if (typeof location !== 'string' || hop >= (policy.maxRedirects ?? 2)) throw new NetError('REDIRECT', `Redirection refusée depuis ${url.hostname}.`);
        try {
          url = allowedUrl(new URL(location, url), policy);
        } catch {
          throw new NetError('REDIRECT', `Redirection vers un hôte non autorisé refusée (${safeHost(location, url)}).`);
        }
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        drain(res.body);
        throw new NetError('HTTP', `${url.hostname} a répondu ${res.status}.`, res.status);
      }
      const declared = Number(res.headers['content-length'] ?? 0);
      if (declared > policy.maxBytes) {
        drain(res.body);
        throw new NetError('TOO_LARGE', `Réponse trop volumineuse (${Math.round(declared / 1024)} Ko > ${Math.round(policy.maxBytes / 1024)} Ko).`);
      }
      const parts: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of res.body) {
          size += chunk.byteLength;
          if (size > policy.maxBytes) {
            controller.abort();
            throw new NetError('TOO_LARGE', `Réponse trop volumineuse (limite ${Math.round(policy.maxBytes / 1024)} Ko).`);
          }
          parts.push(Buffer.from(chunk));
        }
      } catch (e) {
        if (e instanceof NetError) throw e;
        if (controller.signal.aborted) throw new NetError('TIMEOUT', `Délai dépassé (${Math.round(policy.timeoutMs / 1000)} s).`);
        throw new NetError('NETWORK', `Téléchargement interrompu (${(e as NodeJS.ErrnoException).code ?? 'réseau'}).`);
      }
      const type = res.headers['content-type'];
      return { status: res.status, url: url.toString(), contentType: typeof type === 'string' ? type : null, body: Buffer.concat(parts, size) };
    }
  } finally {
    clearTimeout(timer);
  }
}

function drain(body: AsyncIterable<Uint8Array>) {
  const b = body as { resume?: () => void };
  b.resume?.();
}

function safeHost(location: string, base: URL): string {
  try {
    return new URL(location, base).hostname;
  } catch {
    return 'adresse invalide';
  }
}

// ---------------------------------------------------------------------------------------------
// Online access switch and test responses
// ---------------------------------------------------------------------------------------------

/** `BRICK_LAB_ONLINE=0` disables every outgoing request (offline use, the import stays complete). */
export const onlineEnabled = () => process.env.BRICK_LAB_ONLINE?.trim() !== '0';

/**
 * Canned responses for automated tests (`BRICK_LAB_NET_FIXTURES`: JSON file mapping a URL to
 * `{ status, body | bodyFile, headers }`). Ignored by the production server (`next start`).
 */
function fixtureTransport(file: string): Transport {
  return async (url) => {
    const table = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { status: number; body?: string; bodyFile?: string; headers?: Record<string, string>; error?: string }>;
    const entry = table[url.toString()] ?? table[`${url.origin}${url.pathname}`];
    if (!entry) throw Object.assign(new Error('fixture absente'), { code: 'ENOTFOUND' });
    if (entry.error) throw Object.assign(new Error(entry.error), { code: entry.error });
    const body = entry.bodyFile ? readFileSync(entry.bodyFile) : Buffer.from(entry.body ?? '', 'utf8');
    return { status: entry.status, headers: { 'content-length': String(body.length), ...entry.headers }, body: (async function* () { yield body; })() };
  };
}

export function defaultTransport(): Transport {
  const fixtures = process.env.BRICK_LAB_NET_FIXTURES?.trim();
  if (fixtures && process.env.NODE_ENV !== 'production') return fixtureTransport(fixtures);
  return httpsTransport;
}
