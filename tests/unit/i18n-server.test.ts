import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as postSet } from '@/app/api/library/sets/route';
import { describeFailure } from '@/domain/build/engine';
import { compatibility } from '@/domain/library/compatibility';
import { parseLDraw } from '@/domain/ldraw/parser';
import { parseSetNumber } from '@/domain/library/set-number';
import { currentLocale } from '@/i18n/runtime';
import { guard } from '@/server/http/guard';
import { withLocale } from '@/server/http/locale';
import { LibraryError, libraryStore } from '@/server/library/store';

/**
 * Messages produced by the domain and the server follow the language of the request being served
 * (src/server/http/locale.ts): French by default (unit tests, scripts), English inside
 * withLocale('en') or a request whose cookie / Accept-Language asks for it, including after awaits.
 */

const FRENCH_CHARS = /[àâçéèêëîïôûùœÉÈÀÇ«»’]/;
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

let dir: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-i18n-'));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** Error message of a rejected promise. */
const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(LibraryError);
    return (e as Error).message;
  }
  throw new Error('expected a rejection');
};

describe('domain and store messages', () => {
  it('are French by default', async () => {
    expect(currentLocale()).toBe('fr');
    expect(describeFailure({ reason: 'COMPLETE' })).toBe('Le modèle est déjà terminé.');
    expect(parseSetNumber('31040-0')).toEqual({ ok: false, error: 'La variante d’un set commence à 1 (ex. 31040-1).' });
    expect(parseLDraw('', 'empty.ldr').diagnostics[0]!.message).toBe('Fichier vide.');
    expect(await rejection(libraryStore(dir).remove({ setId: 'x' }, true, 99))).toBe('La collection a été modifiée entre-temps : recharge la page.');
  });

  it('are English inside withLocale(en), also after awaits', async () => {
    const out = await withLocale('en', async () => {
      await tick();
      const failure = describeFailure({ reason: 'TOO_FAR', distanceLdu: 41.6 });
      await Promise.resolve();
      const setNumber = parseSetNumber('31040/1');
      const parsed = parseLDraw('1 16 0 0 0 1 0 0 0 1 0 0 0 1 ../evil.dat\n', 'm.ldr').diagnostics.map((d) => d.message);
      // the store produces its conflict message after reading the index from the disk
      const store = await rejection(libraryStore(dir).remove({ setId: 'x' }, true, 99));
      await tick();
      return { failure, setNumber, parsed, store, locale: currentLocale() };
    });
    expect(out.locale).toBe('en');
    expect(out.failure).toBe('Too far from the nearest spot (42 LDU).');
    expect(out.setNumber).toEqual({ ok: false, error: '"31040/1" is not a set number (e.g. 31040 or 31040-1).' });
    expect(out.parsed).toContain('Reference refused (parent folder ".."): "../evil.dat".');
    expect(out.store).toBe('The collection was changed in the meantime: reload the page.');
    for (const text of [out.failure, out.setNumber.ok ? '' : out.setNumber.error, ...out.parsed, out.store]) expect(text).not.toMatch(FRENCH_CHARS);
    // back outside: French again
    expect(currentLocale()).toBe('fr');
    expect(describeFailure({ reason: 'COMPLETE' })).toBe('Le modèle est déjà terminé.');
  });

  it('keeps the plural forms of each language', () => {
    const sheet = (n: number) => compatibility({
      root: {
        rootName: 'main.ldr', occurrenceCount: 4, uniqueParts: n, stepCount: n, planKind: 'ROOT_STEPS', errors: 0,
        missingParts: { checked: true, refs: [], occurrences: 0 }, inventory: { verdict: 'NOT_VERIFIED', message: '' },
      } as never,
      bookletSha256s: [],
      mapping: null,
    });
    expect(sheet(1).lines[0]!.text).toBe('Modèle prêt pour le montage guidé : 1 étape(s) LDraw.');
    expect(withLocale('en', () => sheet(1).lines[0]!.text)).toBe('Model ready for the guided build: 1 LDraw step.');
    expect(withLocale('en', () => sheet(3).lines[0]!.text)).toBe('Model ready for the guided build: 3 LDraw steps.');
    expect(withLocale('en', () => sheet(3).headline)).toBe('Model ready for the guided build.');
  });
});

describe('guard() and the language of the request', () => {
  const ORIGIN = 'http://127.0.0.1:3000';
  const refusal = (headers: Record<string, string>) =>
    // guard() enters the language of the request for the rest of the current async context: run it
    // inside its own context so that it does not leak into the next tests
    withLocale('fr', () => ({ response: guard(new Request(`${ORIGIN}/api/library`, { headers: { host: 'evil.example', ...headers } }), { write: false }), locale: currentLocale() }));
  const message = async (r: Response | null) => ((await r!.json()) as { error: { code: string; message: string } }).error;

  it('answers in French without any language information', async () => {
    const { response, locale } = refusal({});
    expect(locale).toBe('fr');
    expect(response!.status).toBe(403);
    expect(await message(response)).toEqual({ code: 'FORBIDDEN', message: 'Hôte refusé : la bibliothèque ne répond qu’à 127.0.0.1 / localhost.' });
  });

  it('follows Accept-Language', async () => {
    const { response, locale } = refusal({ 'accept-language': 'en-GB,en;q=0.9,fr;q=0.5' });
    expect(locale).toBe('en');
    expect(await message(response)).toEqual({ code: 'FORBIDDEN', message: 'Host refused: the library only answers on 127.0.0.1 / localhost.' });
    expect(refusal({ 'accept-language': 'fr-FR,en;q=0.8' }).locale).toBe('fr');
  });

  it('prefers the language cookie over Accept-Language', async () => {
    const en = refusal({ cookie: 'theme=dark; brick-lab-locale=en', 'accept-language': 'fr-FR' });
    expect(en.locale).toBe('en');
    expect((await message(en.response)).message).toBe('Host refused: the library only answers on 127.0.0.1 / localhost.');
    const fr = refusal({ cookie: 'brick-lab-locale=fr', 'accept-language': 'en-US' });
    expect(fr.locale).toBe('fr');
    expect((await message(fr.response)).message).toBe('Hôte refusé : la bibliothèque ne répond qu’à 127.0.0.1 / localhost.');
  });

  it('serves a whole route in the language of the request, across its awaits', async () => {
    const post = (headers: Record<string, string>) => withLocale('fr', () => postSet(new Request(`${ORIGIN}/api/library/sets`, {
      method: 'POST',
      body: JSON.stringify({ setNumber: '31040-1', name: 'x' }),
      headers: { host: '127.0.0.1:3000', origin: ORIGIN, 'x-brick-lab': '1', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers },
    })));
    const en = await post({ cookie: 'brick-lab-locale=en' });
    expect(en.status).toBe(422);
    expect(await message(en)).toEqual({ code: 'INVALID', message: 'Build list expected.' });
    const fr = await post({ 'accept-language': 'fr' });
    expect(await message(fr)).toEqual({ code: 'INVALID', message: 'Liste de constructions attendue.' });
    expect(currentLocale()).toBe('fr');
  });
});
