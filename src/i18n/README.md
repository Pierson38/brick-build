# i18n — French (reference) and English

Dependency-free layer for the App Router. French is the reference language: existing French
texts are kept **byte for byte** (the E2E suites select elements by their French labels).

## Files

- `locale.ts` — `Locale` (`'fr' | 'en'`), Accept-Language negotiation, cookie name, `plural()`.
- `messages/fr/<namespace>.ts` — reference catalog. `Messages = typeof fr`.
- `messages/en/<namespace>.ts` — typed `Messages['<namespace>']`: a missing or extra key, or a
  function with another signature, is a **type error** (`npm run typecheck`).
- `I18nProvider.tsx` — React: `useT()` (catalog), `useI18n()` (`locale`, `t`, `setLocale`),
  `useLocale()`.
- `runtime.ts` — `msgs()`: catalog of the current language for code outside React (domain,
  server, infra). Browser: language of the interface. Server (API routes): language of the
  request (`src/server/http/locale.ts`, entered by `guard()`). Elsewhere (unit tests): French.
- `server.ts` — `getServerLocale()` / `getServerMessages()` for server components and metadata.

## Language selection

1. Cookie `brick-lab-locale` (`fr` | `en`), written by the switcher of the top bar
   (`LocaleToggle`, `data-testid="locale-toggle"`). Same origin, no other storage, no network.
2. Otherwise the browser's `Accept-Language` (= `navigator.languages`): first supported language;
   no header → French; only unsupported languages → English.

`<html lang>` follows the choice (server render, then updated on switch). Switching applies at
once without reload; screens that show server-produced texts fetch them again (`useLocale()` in
the effect dependencies).

## Conventions

- Namespaces: `common`, `app` (shell), `atelier` (BrickLabApp, LibraryAtelier), `workshop`
  (atelier/*, parts tray, sync banner, PDF panel, mapping editor, model summary, splitter,
  LDraw setup), `library` (collection, set detail, add a set), `domain` (src/domain), `server`
  (src/server, API routes, infra).
- Group keys by component: `t.library.collection.title`, `t.atelier.toast.placed(...)`.
- Parameterised message = function with typed parameters, returning a string:
  `placed: (n: number, total: number) => \`${n}/${total} pièces posées\``. Plurals are decided in
  the function (French keeps its existing `(s)` forms; English uses `plural(n, 'piece', 'pieces')`).
- Rich text (links, `<kbd>`, `<strong>`): split into several keys, or a function taking
  `ReactNode` parts is avoided — keep catalogs plain strings.
- Read the catalog when the text is produced (`msgs()` inside the function, never at module
  load), and add the locale to `useMemo`/`useEffect` dependencies when a memoised value contains
  catalog text.
- English: plain ASCII apostrophes and quotes ("…" for quoted names), no French left over
  (checked by `tests/unit/i18n.test.ts`).

## Known limits

- Parser diagnostics stored in a library snapshot (`library.json`) keep the language in which the
  model was imported; new imports use the current language.
- Identifiers that are not text (test ids, LDraw codes, file names, set numbers) are not
  translated.
