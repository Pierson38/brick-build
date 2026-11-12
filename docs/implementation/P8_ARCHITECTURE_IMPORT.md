# P8 — Simplified import: sources, permissions, strategy, risks

**Date:** 2026-11-06. Branch `feat/p8-simplified-import`, dedicated worktree, base `origin/main` = `a4d2eeb` (P7 merged).

Report, tests and verdict: [P8_RAPPORT.md](P8_RAPPORT.md). Manual acceptance test: [RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md).

> This document is not legal advice. It summarizes what was **read** on the sources' websites on 2026-11-06; what could not be read is marked "not verified".

## 1. Audit of the P7 import (before development)

### 1.1 Problems found in the add flow

| # | Finding in the P7 code | Consequence for the user | Addressed in P8 |
|---|---|---|---|
| A1 | Two unconnected entry points: the "Ajouter un set" (Add a set) dialog (`AddSetDialog`) and the discovery banner (`DiscoveryPanel`) | For a new set: look for the files yourself, enter the number and the name, choose the files one by one | Single page `/ajouter`: search by number, quick import, same rules |
| A2 | The number is compared as exact text (`31040` ≠ `31040-1`) | Set duplicate possible; the variant is never explained | Normalization `31040` → `31040-1` (variant assumed and **displayed**), `31040-2` remains another box |
| A3 | One file per picker (model, then instructions, then mapping) | 3 to 6 file dialogs per set | Drag and drop or **simultaneous** selection of `.mpd`, `.ldr`, `.pdf`, `.brick-mapping.json` |
| A4 | Files sent one by one **before** the set is created, recorded in the index on each upload | A cancellation leaves entries in the index; each upload creates an index backup (20 kept) | Preparation **outside the index** (`library/staging/`), a single index write on confirmation |
| A5 | `createSet` rejects a model already present (DUPLICATE) even if it is the same import being replayed | After a lost response, retrying gives an error | **Idempotent** import: a build already present in the target set is reported, not duplicated; progress and mapping intact |
| A6 | Adding an alternate model to an existing set: only from the set detail, one file at a time | Different flow for a 3-in-1 | The search detects the existing set and offers to **add** the builds to it |
| A7 | Missing parts are only visible in the 3D rendering, in the workshop | An incomplete model is discovered after adding it | Check of part references against the local LDraw library **before** confirmation |
| A8 | PDFs are not analyzed (neither pages nor booklets); all instructions go to all builds (discovery) | Uncertain association presented as established | Page count read; association **proposed, not verified** when there is only one build, otherwise checked by the user; "liée par les correspondances" (linked by the mappings) only if the mapping names it |
| A9 | Mapping: a single file, chosen by hand; discovery only looks for models in `models/` | Existing mapping not found for a model imported another way | Search for mappings by **exact fingerprint** of the model and the main model, in the user's selection, the library and `mappings/`; state valid / incomplete / absent |
| A10 | Modes are only known after adding | You do not know in advance whether synchronized instructions will be available | **Compatibility sheet** before confirmation, same rules as the collection |
| A11 | No provenance or license kept | The license of the OMR file cannot be found again in the library | Provenance per file (source, URL, license and author read **from the file**) |
| A12 | `commit()` writes the backup copy **before** `library.json` | If the very first write fails, a backup exists without an index and the library locks up ("restore the most recent") | Index written first, copy afterwards (found by the P8 interruption test) |

### 1.2 Matrix

| | Content |
|---|---|
| **Already present (P7)** | SHA-256-addressed storage (`blobs/`), files left in place (`external`), fully validated index, atomic writes, history, trash, optimistic revisions; read-only discovery; mapping validation against the model; HTTP guard (Host, Origin, application header); multiple builds per set. |
| **Reused as is** | `analyzeModel` (steps, submodels, diagnostics), `validateMapping`, `inventoryCheck` (31040/31009), `LibraryStore.makeBuild` / `checkMapping` / `writeRecord`, `discover()`, `guard()`, `resolveInside()`, `resolveLibraryFile()` (LDraw library), pdf.js (already used by the reader). |
| **Manual steps removed** | Searching for files on disk (found by number); entering the name (OMR, Rebrickable or model title); entering the number for quick import (read from the file name); file-by-file selection (multiple drop); mapping choice (preselection of the most verified one that is **valid**); round trip to the detail for an alternate model; manual download of the MPD from the OMR (one click). |
| **Remain manual** | Downloading the PDF instructions from LEGO.com (no automation allowed, section 2.2); indicating which instruction booklet goes with which build when there are several; entering a mapping (P9). |
| **External sources** | OMR (on click); LEGO.com (link only); Rebrickable (optional, local key). |
| **Limits** | Technical and legal: sections 2 and 6. |
| **Required changes** | Domain: `set-number.ts`, `compatibility.ts`, `import-types.ts`. Server: `net/safe-fetch.ts`, `online/sources.ts`, `library/prepare.ts`, `parts-check.ts`, `pdf-info.ts`, `store.ts` (preparation + `importSet`), `schema.ts` (optional provenance). Routes `/api/library/lookup`, `/lookup/online`, `/import/files`, `/import/omr`, `/import/prepare`, `/import`. UI: `/ajouter` (3 components). Removed: `AddSetDialog.tsx` (replaced). Unchanged: engine, workshop, mapping editor, set detail. |

## 2. Study of external sources (2026-11-06)

### 2.1 LDraw Official Model Repository — https://library.ldraw.org/omr

| Point | Finding |
|---|---|
| Official API | **None.** The site's code is public (https://github.com/ldraw-org/ldraworg-library, MIT license): `routes/api.php` contains `// None yet`; `https://library.ldraw.org/api` → 404. The site's search goes through Livewire (no GET parameter). |
| Search by number | A route exists in `routes/web.php`: `/omr/set/{setnumber}` (`31040` and `31040-1` work, 404 otherwise). HTML page, not JSON. The canonical URL `/omr/sets/{id}` uses an internal id unrelated to the number (31040 → 471). **Route not publicly documented: not a contract.** |
| Models of a set | Links `https://library.ldraw.org/media/omr_models/{id}/{set}-{n}[_{Alternate-Name}].mpd?v={timestamp}`; one file per model (main, alternates). 31040: 3 files (main, Dune Buggy, Quad); 31009: 3; 31153: 1 (alternates absent from the OMR). The page also shows "Main Model / Alternate Model", the author, "Missing Parts". |
| Format | Text MPD; direct 200 response, `application/octet-stream`, no redirect (Cloudflare). |
| Metadata, license | Headers `0 Name:`, `0 Author:`, `0 !LDRAW_ORG Model`, `0 !LICENSE …`. The real files declare **CCAL 2.0** (= CC BY 2.0) whereas the current OMR standard requires CC BY 4.0: the license is therefore **read from each file**, never assumed. Author of 31153: the page and the file differ (we keep the file's). Legal page: https://www.ldraw.org/docs-main/licenses/legal-info.html (nothing about automated access). |
| Automated access | `robots.txt`: `User-agent: *` / empty `Disallow:`. No documented limit; site behind Cloudflare (anti-bot blocking possible in case of intensive use, not verified). |
| Stability | Route and format present in the current code, but undocumented; the site has already been redesigned (legacy redirects). |

### 2.2 LEGO instructions — https://www.lego.com/fr-fr/service/building-instructions

| Point | Finding |
|---|---|
| API | No documented public API. The page uses an internal endpoint `https://www.lego.com/api/graphql`: **not used**. |
| Set page | `…/building-instructions/{n}` → 200 in HTML; a nonexistent number also returns 200 (soft 404). |
| Booklets, languages | PDFs at `https://www.lego.com/cdn/product-assets/product.bi.core.pdf/{assetId}.pdf`. 31040: 1 booklet (fr-fr `6145903`, en-us `6145904`: **the identifier changes with language/region**); 31009: 3 booklets; 31153: 3 booklets (50 to 89 MB). Identifiers cannot be deduced from the number. The booklets of the 31040 alternates are not listed (not verified in the PDF). |
| Terms | Terms of use: download for personal non-commercial use; redistribution forbidden; text and data mining reserved, including by "automated systems". Fair Play: the instructions are protected by copyright. |
| **Conclusion** | No authorization for automated download, no API, unstable identifiers → **link to the official page**, download by the user, then drop the PDF into the quick import (one gesture). PDF links are **not** extracted from the page. |

### 2.3 Rebrickable API v3 — https://rebrickable.com/api/

| Point | Finding |
|---|---|
| API | Official and documented (`/api/v3/docs/`). Personal key (account), header `Authorization: key <key>`. |
| Useful data | `GET /api/v3/lego/sets/{set_num}/` (`31040-1`): name, year, part count, URL. `/sets/{n}/alternates/` exists but returns community MOCs (and the API removed MOCs in 2020): **not used**. |
| Limits | "on average one request per second", 429 then risk of ban. The documentation recommends CSVs for bulk uses. |
| Terms | `/terms/` page refused (403) on automated reading: **not verified**. Usage chosen: one request per search, on click, with cache. |
| **Conclusion** | **Optional.** Without a key, everything works; with a key in `.env.local`, the name, year and announced part count are displayed **for information only** (never compared to the model as if they were the inventory). |

## 3. Chosen strategy

1. **Offline first.** The search by number reads the collection and the data folder (`models/<n>/`, `instructions/<n>/`, `mappings/` by fingerprint), without network. The quick local import never needs the Internet. `BRICK_LAB_ONLINE=0` cuts all outbound requests.
2. **OMR on click, tolerant.** "Chercher en ligne" (Search online) reads **one** page (`/omr/set/<n>`), extracts from it only the `.mpd` links of that number on the OMR host; each file is downloaded only on a "Télécharger" (Download) click. If the page changes shape or the site is unavailable: clear message, "Ouvrir la page de l'OMR" (Open the OMR page) link, and the quick import remains the fallback. No crawl, no background task, no network cache.
3. **LEGO.com: link only.** "Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire." (Instructions available on LEGO.com, but manual download required.)
4. **Rebrickable optional** (local key, at most 1 request/s, 1 h cache, never sent back to the browser nor logged).
5. **No mapping generated.** A mapping is only offered if it already exists, for the exact fingerprint of the model and its main model.

### Deviation from the frozen specification — approved by the owner (2026-11-06)

`README.md` ("Pas de … téléchargement automatique de notices/sets" (No … automatic download of instructions/sets)) and `docs/07` ("Ne pas aspirer automatiquement l'OMR ni LEGO.com ; le choix et le téléchargement des fichiers restent côté utilisateur" (Do not automatically scrape the OMR or LEGO.com; the choice and download of files remain on the user's side)) date from v1.0. P8 has the **local server** download an OMR file that the user has **chosen and requested with a click**. This is neither scraping nor an automatic download (one page and one file per click, nothing in the background), but the transfer is no longer done by the user's browser. LEGO instructions remain entirely manual. The v1.0 specification is not modified (it remains immutable); the deviation is recorded here and in the decision journal.

**Explicit GO from the owner (2026-11-06)** for this deviation. Framework approved by the owner on 2026-11-06: online search triggered by a user action; individual download of an explicitly chosen model; HTTPS, closed host list, address verification and SSRF protection; no bulk download nor background network task; retention of the author, the license, the source URL and the file fingerprint; offline mode kept via `BRICK_LAB_ONLINE=0`; no automated download of official LEGO instructions. Any extension of this framework (other host, grouped download, LEGO instructions) will require a new authorization.

## 4. Flow

`/ajouter` ("Ajouter un set" button of "Ma collection" (My collection)):

1. **Search**: number (normalized, assumed variant displayed) **or** quick local import (drop of several files).
2. **Resources**: data folder, OMR ("Chercher en ligne" button, then "Télécharger" per model), LEGO (link), Rebrickable (if key).
3. **Selected files**: per model, its possible builds (main model checked; another unused model from the MPD offered, unchecked; "Ce modèle existe déjà dans ta collection" (This model already exists in your collection) disabled), parts, steps, license, source; instructions (pages, association per build); mappings (state). Advanced details collapsed (SHA-256, diagnostics, another main model).
4. **Compatibility**: per build, modes actually available and reasons.
5. **Confirmation**: new set (number, pre-filled name) or addition to the existing set; then "Construire "…"" (Build "…") opens the workshop without any file selection.

Sheet rules (`src/domain/library/compatibility.ts`): LDraw steps → guided; no steps → free building; PDF → free building **with** instructions; valid mapping **and** its booklets selected → synchronized instructions; a PDF alone never gives synchronized instructions; missing parts, library not configured, unverified inventory ("indéterminé" (indeterminate)) always displayed; no build without a 3D model.

## 5. Data and reliability

```
library/
  staging/<sha256>.<ext>        prepared file (verified), outside the index, until confirmation
  staging/<sha256>.meta.json    original name, type, provenance
  blobs/…                       unchanged (P7)
  library.json                  + optional `provenance` field per file
```

- **Verification before saving**: size (model 8 MB, PDF 300 MB, mapping 1 MB), real format (LDraw text with at least one part, `%PDF-`, valid mapping), SHA-256 recomputed at preparation **and** at confirmation, for all origins.
- **Atomicity**: `importSet` reads and verifies all files, writes the content-addressed copies (never overwriting), then does **a single** index write (set + builds + files). An error before that write leaves no set; the copies already written are reused by the next attempt.
- **Retry**: the same import replayed returns the existing set (`alreadyPresent`); a mapping is only written if the build has none (`mappingsKept` otherwise); the progress is never touched.
- **Duplicates**: identical file → reused (no copy); model + main model already in another set → rejected with a link; same number → addition to the existing set offered by default, second set only on explicit choice.
- **Data folder files**: referenced in place (`external`), never copied or modified.
- **Provenance**: `source` (`upload`, `discovery`, `omr`), `url` and `pageUrl` (OMR), `license` and `author` read from the LDraw header, `retrievedAtIso`. Validated on every read of the index (`https://` URLs only).
- **P7 compatibility**: the index keeps `schemaVersion: 1`; the `provenance` field is optional (a P7 index is read as is; a P7 server reads a P8 index ignoring this field). P5/P6/P7 progress, mappings and synchronized mode unchanged.
- **Staging area**: unconfirmed files deleted after 7 days (temporary copies of files the user still has, or downloads to redo); confirmed files removed from `staging/` after the import (they are in `blobs/`).

## 6. Security

| Threat | Countermeasure | Test |
|---|---|---|
| Page from another site that would make the server send requests out (SSRF triggered by CSRF) | Online search and download via **POST** with the P7 write guard (Origin = loopback Host + `x-brick-lab` header) | `import-api.test.ts` |
| Arbitrary URL sent to the server | The browser can only request a file `https://library.ldraw.org/media/omr_models/<id>/<name>.mpd|.ldr` (no query, no port, no credentials); the page read is built by the server from the validated number | `online-sources.test.ts`, `import-api.test.ts` |
| Unexpected host, redirect | Closed host list (`library.ldraw.org`, `rebrickable.com`), HTTPS port 443 only, literal IP rejected; each redirect rechecked (2 at most, none for Rebrickable) | "redirect" unit tests |
| Private addresses, DNS rebinding | DNS resolution checked **at connection time** (`lookup` of `https.request`): rejected if an address is private, loopback, link-local, CGNAT, multicast, reserved, IPv4 mapped in IPv6 (dotted and hexadecimal forms); the connection uses the verified address | "address", "DNS rebinding" unit tests |
| Huge or slow response | `Content-Length` rejected beyond the limit, stream cut as soon as it is exceeded (page 2 MB, model 8 MB, Rebrickable 256 KB); overall timeout 10 to 30 s | "bounds" unit tests |
| HTTP errors, disconnection | Clear message, no file prepared, link to the source's page | unit tests, E2E "source unavailable" |
| Malicious content | The downloaded file follows exactly the validation of an import (LDraw text, at least one part); nothing is executed; pdf.js on the server without XFA or system fonts, page counted only | unit tests, E2E "invalid files" |
| Rebrickable key leak | Read from the local environment on each call, sent only to `rebrickable.com`, never sent back nor logged (generic error messages) | "key never returned" unit test |
| Paths | `discovered` references limited to `models/`, `instructions/`, `mappings/` (validated segments, `realpath`, no `library/`); `staged` by fingerprint only | "hostile references" unit test |
| Network listening | Unchanged: `127.0.0.1`; the simulated responses of the tests (`BRICK_LAB_NET_FIXTURES`) are ignored by the production server | — |

## 7. Risks

| Risk | Probability | Effect | Countermeasure |
|---|---|---|---|
| The OMR page changes shape | Medium (undocumented route) | No more models listed | Message "aucun fichier lu" (no file read), link to the page, quick import; never guessing |
| Cloudflare blocks the server's requests | Low (one request per click) | "OMR indisponible" (OMR unavailable) | Same |
| OMR license differs between files | Certain (CCAL 2.0 / CC BY 4.0) | — | License read from the file and kept |
| The user associates the wrong instructions | Medium (3-in-1) | Inappropriate instructions displayed | Association marked "proposed, not verified"; no mapping inferred; editable in the set detail |
| Rebrickable changes its terms | Unknown (not verified) | — | Optional, disabled without a key |
| `staging/` grows (large PDFs dropped then abandoned) | Low | Disk space | Purge after 7 days; documented folder |
