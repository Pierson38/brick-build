import type { OmrModelCandidate, OnlineLookup, SourceLinks } from '@/domain/library/import-types';
import type { SetNumber } from '@/domain/library/set-number';
import { NetError, onlineEnabled, safeGet, type FetchPolicy, type Transport } from '../net/safe-fetch';

// Server-only. External sources studied in docs/implementation/P8_ARCHITECTURE_IMPORT.md:
// - LDraw OMR: no API. One public page per set number (/omr/set/<n>), read ONCE per user click;
//   its .mpd links are listed and a file is downloaded only when the user asks for it. Not a
//   contract: when the page changes, the user is sent to the OMR page and imports the file himself.
// - LEGO.com: no authorised automated download → link to the official page only.
// - Rebrickable API v3: optional (personal key in .env.local), metadata only, ≤ 1 request/s.

export const OMR_HOST = 'library.ldraw.org';
export const REBRICKABLE_HOST = 'rebrickable.com';

const OMR_PAGE: FetchPolicy = { hosts: [OMR_HOST], maxBytes: 2 * 1024 * 1024, timeoutMs: 12_000, headers: { accept: 'text/html' } };
/** Same limit as an imported model (MAX_BYTES.model). */
export const OMR_FILE: FetchPolicy = { hosts: [OMR_HOST], maxBytes: 8 * 1024 * 1024, timeoutMs: 30_000 };
const REBRICKABLE: FetchPolicy = { hosts: [REBRICKABLE_HOST], maxBytes: 256 * 1024, timeoutMs: 10_000, maxRedirects: 0, headers: { accept: 'application/json' } };

/** Only files of the OMR media folder, named after the set, can be downloaded. */
const OMR_FILE_RE = /^\/media\/omr_models\/(\d{1,9})\/([A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:mpd|ldr))$/;

export function sourceLinks(sn: SetNumber): SourceLinks {
  return {
    omrSearch: `https://${OMR_HOST}/omr/set/${encodeURIComponent(sn.canonical)}`,
    legoInstructions: `https://www.lego.com/fr-fr/service/building-instructions/${encodeURIComponent(sn.base)}`,
    rebrickable: `https://rebrickable.com/sets/${encodeURIComponent(sn.canonical)}/`,
  };
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/**
 * Model files of an OMR set page. Tolerant: unknown fields stay null. Only links to files of THIS
 * set number on the OMR host are kept (`31040-1.mpd`, `31040-1_Dune-Buggy.mpd`).
 */
export function parseOmrSetPage(html: string, sn: SetNumber): { setName: string | null; models: OmrModelCandidate[] } {
  const title = /<title>\s*LDraw\.org Official Model Repository\s*-\s*([^<|]{1,200}?)\s*\|/i.exec(html)?.[1];
  const models: OmrModelCandidate[] = [];
  const seen = new Set<string>();
  const re = /href="(https:\/\/library\.ldraw\.org\/media\/omr_models\/[^"?#]+)(?:\?[^"#]*)?"/g;
  let previousEnd = Math.max(0, html.search(/>\s*Models\s*</));
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const url = new URL(decode(m[1]!));
    const path = OMR_FILE_RE.exec(url.pathname);
    if (!path || seen.has(url.pathname)) continue;
    const fileName = decodeURIComponent(path[2]!);
    const stem = fileName.replace(/\.(mpd|ldr)$/i, '');
    if (stem.toLowerCase() !== sn.canonical && !stem.toLowerCase().startsWith(`${sn.canonical}_`)) continue;
    seen.add(url.pathname);
    const block = html.slice(previousEnd, m.index);
    previousEnd = m.index + m[0].length;
    const kinds = [...block.matchAll(/>\s*((?:Main|Alternate)\s+Model)\s*</gi)];
    const kind = kinds.at(-1)?.[1] ? decode(kinds.at(-1)![1]!) : null;
    const author = [...block.matchAll(/Author:\s*<\/span>\s*([^<]{1,120})</gi)].at(-1)?.[1];
    const alternateName = stem.includes('_') ? stem.slice(stem.indexOf('_') + 1).replace(/-/g, ' ') : null;
    models.push({
      fileUrl: `https://${OMR_HOST}${url.pathname}`,
      fileName,
      title: alternateName ?? (title ? decode(title) : sn.canonical),
      kind,
      alternate: alternateName !== null || /alternate/i.test(kind ?? ''),
      author: author ? decode(author) : null,
      license: null,
    });
  }
  // main model first, then alternates in page order
  models.sort((a, b) => Number(a.alternate) - Number(b.alternate));
  return { setName: title ? decode(title) : null, models };
}

/** Validates a download URL received from the browser (it must be an OMR model file). */
export function omrFileUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== OMR_HOST || url.port !== '' || url.username || url.password || url.search || url.hash) return null;
    return OMR_FILE_RE.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

const omrMessage = (e: unknown) => e instanceof NetError
  ? e.code === 'HTTP' ? `L’OMR a répondu ${e.status}.` : e.message
  : 'Erreur inattendue.';

async function omrLookup(sn: SetNumber, transport?: Transport): Promise<OnlineLookup['omr']> {
  const pageUrl = sourceLinks(sn).omrSearch;
  if (!sn.numeric) return { status: 'unsupported', message: 'L’OMR ne référence que des numéros de set LEGO.', pageUrl: null, setName: null, models: [] };
  try {
    const res = await safeGet(pageUrl, OMR_PAGE, transport);
    const { setName, models } = parseOmrSetPage(res.body.toString('utf8'), sn);
    if (models.length === 0) {
      return { status: 'not_found', message: setName ? `Page OMR trouvée (« ${setName} »), mais aucun fichier de modèle n’a pu y être lu : ouvre la page et télécharge le fichier toi-même.` : 'Aucun modèle 3D trouvé pour ce set sur l’OMR.', pageUrl, setName, models: [] };
    }
    const alternates = models.filter((m) => m.alternate).length;
    return { status: 'ok', message: `${models.length} modèle(s) 3D sur l’OMR${alternates > 0 ? `, dont ${alternates} alternatif(s)` : ''}.`, pageUrl, setName, models };
  } catch (e) {
    if (e instanceof NetError && e.code === 'HTTP' && e.status === 404) return { status: 'not_found', message: 'Aucun modèle 3D trouvé pour ce set sur l’OMR.', pageUrl: null, setName: null, models: [] };
    return { status: 'unavailable', message: `OMR indisponible : ${omrMessage(e)} Réessaie plus tard ou ouvre la page de l’OMR.`, pageUrl, setName: null, models: [] };
  }
}

// --- Rebrickable (optional) ------------------------------------------------------------------

const rbCache = new Map<string, { at: number; value: OnlineLookup['rebrickable'] }>();
let rbLast = 0;
const RB_INTERVAL_MS = 1_100;
const RB_CACHE_MS = 3_600_000;

/** Personal key from the local configuration only; never logged, never sent to the browser. */
export const rebrickableKey = () => {
  const k = process.env.REBRICKABLE_API_KEY?.trim();
  return k && /^[A-Za-z0-9]{16,64}$/.test(k) ? k : null;
};

async function rebrickableLookup(sn: SetNumber, transport?: Transport): Promise<OnlineLookup['rebrickable']> {
  const key = rebrickableKey();
  if (!key) return { status: 'not_configured', message: 'Rebrickable non configuré (facultatif : clé personnelle REBRICKABLE_API_KEY dans .env.local).', set: null };
  const cached = rbCache.get(sn.canonical);
  if (cached && Date.now() - cached.at < RB_CACHE_MS) return cached.value;
  const wait = rbLast + RB_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  rbLast = Date.now();
  let value: OnlineLookup['rebrickable'];
  try {
    const res = await safeGet(`https://${REBRICKABLE_HOST}/api/v3/lego/sets/${encodeURIComponent(sn.canonical)}/`, { ...REBRICKABLE, headers: { ...REBRICKABLE.headers, authorization: `key ${key}` } }, transport);
    const j = JSON.parse(res.body.toString('utf8')) as Record<string, unknown>;
    const name = typeof j.name === 'string' ? j.name.slice(0, 120) : null;
    if (!name) throw new Error('réponse inattendue');
    value = {
      status: 'ok', message: 'Métadonnées Rebrickable (indicatives).',
      set: {
        setNum: typeof j.set_num === 'string' ? j.set_num.slice(0, 32) : sn.canonical, name,
        year: typeof j.year === 'number' && Number.isInteger(j.year) ? j.year : null,
        numParts: typeof j.num_parts === 'number' && Number.isInteger(j.num_parts) ? j.num_parts : null,
        url: typeof j.set_url === 'string' && /^https:\/\/rebrickable\.com\//.test(j.set_url) ? j.set_url : null,
      },
    };
  } catch (e) {
    const status = e instanceof NetError && e.code === 'HTTP' ? e.status : null;
    value = status === 404 ? { status: 'not_found', message: 'Set inconnu de Rebrickable.', set: null }
      : { status: 'unavailable', message: `Rebrickable indisponible${status === 401 || status === 403 ? ' : clé refusée' : status === 429 ? ' : trop de requêtes, réessaie dans une minute' : ''}.`, set: null };
    if (value.status === 'unavailable') return value; // not cached: may work again soon
  }
  rbCache.set(sn.canonical, { at: Date.now(), value });
  return value;
}

/** Online lookup, run only when the user clicks "Chercher en ligne". */
export async function onlineLookup(sn: SetNumber, transport?: Transport): Promise<OnlineLookup> {
  const lego = { status: 'manual' as const, message: 'Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire : ouvre la page officielle, télécharge le PDF puis dépose-le ici.', pageUrl: sourceLinks(sn).legoInstructions };
  if (!onlineEnabled()) {
    const off = 'Accès Internet désactivé (BRICK_LAB_ONLINE=0).';
    return { setNumber: sn, omr: { status: 'unavailable', message: off, pageUrl: sourceLinks(sn).omrSearch, setName: null, models: [] }, rebrickable: { status: 'unavailable', message: off, set: null }, lego };
  }
  const [omr, rebrickable] = await Promise.all([omrLookup(sn, transport), rebrickableLookup(sn, transport)]);
  return { setNumber: sn, omr, rebrickable, lego };
}

export function resetRebrickableForTests() {
  rbCache.clear();
  rbLast = 0;
}
