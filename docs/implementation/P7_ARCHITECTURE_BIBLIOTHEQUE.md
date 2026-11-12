# P7 — Personal library: architecture, security, backup

**Date:** 2026-11-05. Branch `feat/p7-personal-library`, base `origin/main` = `7f2e670` (P6 merged).

## 1. Need and constraints

- Open the application on **"Ma collection"** (My collection) and resume a build **without re-importing** the MPD, the instructions or the mapping.
- The **same** collection from Chrome and Safari, on the same Mac.
- Files only on the Mac, server on `127.0.0.1`, no outbound requests, no account.
- The P5/P6 `localStorage` saves remain readable and are carried over without loss.

## 2. Storage choice

| Option | Shared Chrome + Safari | Durable MPD/PDF files | Verdict |
|---|---|---|---|
| `localStorage` / IndexedDB / OPFS (P5/P6 state) | **No**: one store per browser and per origin | IndexedDB yes, but per browser | Rejected (this is the constraint to remove) |
| File System Access API | No (absent from Safari) | Yes | Rejected |
| SQLite (`node:sqlite`) | Yes (server side) | Yes | Rejected: a few dozen sets, an index of a few KB; a readable JSON can be backed up, compared and restored with the Finder. Nothing justifies a binary database. |
| **Files + JSON index on the Next.js server side (Node `fs`)** | **Yes** | **Yes** | **Chosen** |

The local Next.js server (already needed to serve the LDraw library) reads and writes in a data folder. Both browsers talk to the same server, so they see the same collection.

## 3. Layout on disk

Data folder: `~/Documents/brick-lab-data/` (variable `BRICK_LAB_DATA_DIR` for another location; tests use a temporary folder).

```
brick-lab-data/
  models/ instructions/ mappings/      ← existing files: read only, never modified or moved
  ldraw/                                ← part library (unchanged)
  library/                              ← everything P7 writes
    library.json                        index (sets, builds, files) — atomic write
    backups/library-<date>-r<rév>.json  copy of each version of the index (last 20)
    blobs/<2 chars>/<sha256>.<ext>      files imported via "Ajouter un set" (Add a set) (content-addressed)
    builds/<id>/progress.json           progress (P6 v2 payload unchanged) + revision
    builds/<id>/mapping.json            mappings for this build + revision
    builds/<id>/thumbnail-<sha>.png     locally rendered thumbnail
    builds/<id>/history/                replaced versions (last 30 per type)
    trash/<date>-<id>/                  builds removed from the collection (nothing is erased)
    tmp/                                imports in progress
```

### Data model

- **File**: identified by its **SHA-256**; type (`model`, `pdf`, `mapping`), size, original name, location `blob` (library copy) or `external` (left in place, path relative to the data folder).
- **Set**: editable number and name. The number **is not an identity** (two sets can have the same number, upon confirmation).
- **Build**: a set has one or more (alternate models of a 3-in-1). Own identity (`id`), and above all **(SHA-256 of the model, main model)**: this is what progress and mapping are validated against. Associated instructions (ordered list), snapshot of the parser diagnostics taken at add time.
- **Progress**: exactly the P6 `LocalBuildProgress` (schema v2, v1 still readable), wrapped in `{ revision, savedAtIso, source }`.
- **Mapping**: the P6 `brick-lab-instruction-mapping`, same envelope.

### Files already present (31040, 31009)

"Ma collection" offers the sets found in `models/<set>/`, `instructions/<set>/` and `mappings/`. Mappings are recognized by the **fingerprint of the model they contain**, not by their name; the most verified one is preselected (31040: `31040-1.brick-mapping.json`, 24/24 verified, rather than the prepared version 0/24). Adding **references the files in place** (no copy, no move); only the mapping (7 KB) is copied into `builds/<id>/mapping.json`, because it becomes editable in the editor without touching the original.

## 4. Reuse of P5/P6 (no duplicated logic)

- `BrickLabApp` receives a **`BuildStore`**: `browserStore` (localStorage, workshop without a collection, P5/P6 behavior unchanged) or `libraryBuildStore` (local API). Restoration, progress validation (`restoreProgress`), mapping validation (`validateMapping`), explicit fallback to free building, synchronized plan: **P5/P6 code unchanged**.
- `LibraryAtelier` prepares the opening: SHA-256 check of each file, loading of the model and the instructions (`File` objects passed to `useNotice.open`), pick-up of the browser saves, then mounts `BrickLabApp`.
- The server reuses the parser (`analyzeModel`) for diagnostics and to reject a progress or mapping that does not match the model.

## 5. Security

| Threat | Countermeasure | Test |
|---|---|---|
| Network access | `next dev/start -H 127.0.0.1` | — |
| Web page from another site writing into the library (CSRF) | Writes: `Origin` = `http://<Host>` **and** header `x-brick-lab: 1` (impossible without a CORS preflight, which is never accepted); `Sec-Fetch-Site` ≠ `cross-site`/`same-site` | `library-api` unit tests, E2E sandboxed iframe → "blocked" |
| DNS rebinding (`evil.example` → 127.0.0.1) that would read the PDFs | `Host` must be `127.0.0.1`, `localhost` or `[::1]`, including for reads | unit tests, E2E |
| Arbitrary paths / traversal | The client **never** supplies a path; identifiers validated (`[a-z0-9-]`, SHA-256 hex). Stored paths validated segment by segment (no `..`, leading `/`, `\`, hidden file), resolved by `realpath` and checked **inside** the root; discovery without following symbolic links, limited to `models/`, `instructions/`, `mappings/`; `library/` forbidden as an external file | "hostile paths" unit tests, E2E |
| Hand-edited index | `library.json` re-read and validated **in full** on every operation (types, bounds, referential integrity, `__proto__`); if invalid, **no write** | "damaged index" unit test |
| Replaced file / wrong instructions | SHA-256 recomputed on every open (server **and** browser); repair accepted only with the same fingerprint | unit tests, E2E "modified or missing" |
| Size | model 8 MB, PDF 300 MB, mapping 1 MB, thumbnail 2 MB, JSON body 2 MB; streamed import, rejected as soon as the limit is exceeded | unit tests |
| Type | extension + content (`%PDF-`, LDraw text with no null byte and at least one part, valid mapping, PNG) | unit tests |
| Corruption on write | temporary file + `fsync` + `rename` + directory `fsync`; copy of each version of the index | "interrupted write" unit test |
| Silent overwrite | optimistic revision: a write based on a stale revision is **rejected** (409), never merged (documented exception: if only the displayed page or booklet changed elsewhere, the game being identical, the workshop saves again on the new revision); replaced versions kept in `history/`; blobs created by `link` (never overwritten) | unit tests, E2E "two tabs" |
| Deletion | "Retirer" (Remove) asks for confirmation, moves to `trash/`; "Abandonner" (Abandon) (library) asks for confirmation and keeps the progress in `history/` | unit tests, E2E |
| Third-party files | never modified or moved (mtime checked in test) | "discovery" unit test |

Headers added to all production server responses: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

## 6. Performance (measured)

- Index: re-read on every request (a few KB), < 5 ms.
- Collection list: file existence and size only; the model (≤ 50 KB) is hashed and analyzed to validate the mapping (analysis cached by fingerprint).
- Full SHA-256 when opening a build and in the set detail: the 4 existing PDFs (22 MB) in a few tens of ms.
- Discovery of the real folder (8 models, 4 PDFs, 2 mappings): **130 ms** (fingerprints cached by size + date).
- Thumbnails: rendered in the browser from the 3D model (WebGL), one at a time, then saved as PNG; no image downloaded.

## 7. Startup, backup, restore

```bash
npm ci
npm run build
npm run start            # http://127.0.0.1:3000 → « Ma collection »
```

**Back up**: copy the folder `~/Documents/brick-lab-data/` (at minimum `library/`, plus `models/`, `instructions/`, `mappings/` if files there are referenced "left in place"). Time Machine already does this if it covers `Documents`. Stop the server during the copy to get a consistent snapshot.

**Restore the collection**: stop the server, put the `library/` folder back (and the external files in place), restart.

**Restore a version of the index** (`library.json` damaged or deleted: the application reports it and writes nothing more):

```bash
cd ~/Documents/brick-lab-data/library
ls -1 backups | tail -3                       # most recent versions
cp library.json library.json.abime 2>/dev/null # keep the damaged version
cp backups/<la plus récente>.json library.json
```

**Restore a progress or a mapping**: `builds/<id>/history/` contains the replaced versions; copy the desired one over `progress.json` / `mapping.json`, with the server stopped.

**Recover a removed item**: `trash/<date>-<id>/removed.json` describes the set, the builds and the files; the build folder contains its progress and its mapping.

**External file moved or modified**: the set detail reports it ("introuvable" (not found), "modifié (empreinte)" (modified (fingerprint))); "Réparer" (Repair) accepts the original file (same SHA-256) and keeps a copy in `library/blobs/`.

**Browser saves (P5/P6)**: never erased or modified. When opening a build whose model has the same fingerprint:
- the library has no progress → the browser's is picked up (nothing to overwrite);
- the two are **identical** (mode, placed parts, page, booklet, mappings fingerprint) → nothing is asked;
- they **differ** → a screen compares these five points side by side (the date is only indicative) and asks which one to resume, **even if the browser's is older**. "Reprendre la bibliothèque" (Resume the library) is remembered for that specific browser save (it stays announced); "Reprendre ce navigateur" (Resume this browser) replaces the library progress, whose previous version is **always** copied to `builds/<id>/history/`; if the mappings differ, a checkbox (visible, checked when the game was played with them) also picks up the browser's mappings, the old version going to the history;
- at any time, the **set detail** offers "Reprendre la sauvegarde de ce navigateur" (Resume this browser's save) (with confirmation) as long as it differs from the library;
- a write based on a stale revision of the library is rejected (no overwriting of a game played in the meantime in another browser).
