import { compatibility, mappingState, type CompatibilitySheet } from '@/domain/library/compatibility';
import type { FileRef, ImportBuildInput, MappingMatch, PreparedImport, PreparedMapping, PreparedModel, PreparedRoot } from '@/domain/library/import-types';

/**
 * What the user selected on the "Ajouter un set" page, on top of the server's measurements.
 * Defaults are conservative: nothing already in the collection is preselected; a booklet is
 * associated by default only with a single build ("proposée, non vérifiée") or with the build
 * whose mapping names it; the most verified mapping that is VALID with its booklets is preselected.
 */

export interface BuildChoice {
  readonly checked: boolean;
  readonly label: string;
  readonly booklets: readonly string[];
  /** SHA-256 of the chosen mapping, or null. */
  readonly mapping: string | null;
}

export interface Selection {
  readonly builds: Readonly<Record<string, BuildChoice>>;
  /** Booklets and mappings already seen by the defaults (one the user removed is not added back). */
  readonly seen: readonly string[];
}

export const EMPTY_SELECTION: Selection = { builds: {}, seen: [] };

export const buildKey = (model: Pick<PreparedModel, 'sha256'>, root: Pick<PreparedRoot, 'rootName'>) => `${model.sha256}|${root.rootName}`;

const matchOf = (p: PreparedImport, mappingSha: string, root: PreparedRoot): MappingMatch | null =>
  p.mappingMatches.find((x) => x.mappingSha256 === mappingSha && x.rootName === root.rootName) ?? null;

export interface BuildRow {
  readonly key: string;
  readonly model: PreparedModel;
  readonly root: PreparedRoot;
  /** Mappings of this exact model and main model, with their state for the current booklets. */
  readonly mappings: readonly { readonly file: PreparedMapping; readonly state: ReturnType<typeof mappingState> }[];
}

export function buildRows(p: PreparedImport, sel: Selection): BuildRow[] {
  return p.models.flatMap((model) => model.roots.map((root) => {
    const key = buildKey(model, root);
    const booklets = sel.builds[key]?.booklets ?? [];
    const mappings = p.mappings
      .filter((m) => m.modelSha256 === model.sha256 && m.rootName === root.rootName)
      .map((file) => ({ file, state: mappingState({ root, bookletSha256s: booklets, mapping: { file, match: matchOf(p, file.sha256, root) } }) }))
      .sort((a, b) => b.file.verified - a.file.verified);
    return { key, model, root, mappings };
  }));
}

/** OMR alternate files are named "<set>_<Name>.mpd". */
const alternateName = (model: PreparedModel) => (/_/.test(model.name) ? model.name.replace(/\.(mpd|ldr)$/i, '').split('_').slice(1).join(' ').replace(/-/g, ' ').trim() : '');

function defaultLabel(model: PreparedModel, root: PreparedRoot, index: number): string {
  if (root.role !== 'main') return root.rootName.replace(/\.(ldr|dat)$/i, '').slice(0, 120);
  return (alternateName(model) || (index === 0 ? 'Modèle principal' : `Modèle ${String.fromCharCode(65 + index)}`)).slice(0, 120);
}

/** Adds defaults for what is seen for the first time; keeps every choice the user already made. */
export function withDefaults(p: PreparedImport, sel: Selection): Selection {
  const builds: Record<string, BuildChoice> = { ...sel.builds };
  // the OMR main model ("31040-1.mpd") before its alternates
  const models = [...p.models].sort((a, b) => Number(alternateName(a) !== '') - Number(alternateName(b) !== ''));
  // letters continue after the builds the set already has ("Modèle C" for a third build)
  let index = (p.existingSets[0]?.builds.length ?? 0) + Object.values(builds).filter((c) => c.checked).length;
  const fresh: string[] = [];
  for (const model of models) {
    for (const root of model.roots) {
      const key = buildKey(model, root);
      if (builds[key]) continue;
      const checked = root.role === 'main' && !root.existingBuild;
      builds[key] = { checked, label: defaultLabel(model, root, checked ? index : 0), booklets: [], mapping: null };
      if (checked) index++;
      fresh.push(key);
    }
  }
  const newPdfs = p.pdfs.map((x) => x.sha256).filter((s) => !sel.seen.includes(s));
  const checked = Object.entries(builds).filter(([, c]) => c.checked).map(([k]) => k);
  // booklets seen for the first time go to the build when there is only one (a proposal)
  if (checked.length === 1 && newPdfs.length > 0) {
    const c = builds[checked[0]!]!;
    builds[checked[0]!] = { ...c, booklets: [...new Set([...c.booklets, ...newPdfs])] };
  }
  // a mapping is preselected for a new build when it is valid with its own booklets
  for (const row of buildRows(p, { builds, seen: sel.seen })) {
    const c = builds[row.key]!;
    if (!fresh.includes(row.key) && c.mapping !== null) continue;
    if (!fresh.includes(row.key) && !row.mappings.some((m) => !sel.seen.includes(m.file.sha256))) continue;
    const available = (m: PreparedMapping) => m.bookletSha256s.filter((s) => p.pdfs.some((x) => x.sha256 === s));
    const usable = row.mappings.find((m) => mappingState({
      root: row.root, bookletSha256s: [...new Set([...c.booklets, ...available(m.file)])], mapping: { file: m.file, match: matchOf(p, m.file.sha256, row.root) },
    }).state === 'valid');
    if (usable) builds[row.key] = { ...c, mapping: usable.file.sha256, booklets: [...new Set([...c.booklets, ...available(usable.file)])] };
  }
  return { builds, seen: [...new Set([...sel.seen, ...p.pdfs.map((x) => x.sha256), ...p.mappings.map((m) => m.sha256)])] };
}

export interface SelectedBuild {
  readonly row: BuildRow;
  readonly choice: BuildChoice;
  readonly sheet: CompatibilitySheet;
  readonly mappingFile: PreparedMapping | null;
}

export function selectedBuilds(p: PreparedImport, sel: Selection): SelectedBuild[] {
  return buildRows(p, sel).filter((r) => sel.builds[r.key]?.checked).map((row) => {
    const choice = sel.builds[row.key]!;
    const mappingFile = row.mappings.find((m) => m.file.sha256 === choice.mapping)?.file ?? null;
    const sheet = compatibility({ root: row.root, bookletSha256s: choice.booklets, mapping: mappingFile ? { file: mappingFile, match: matchOf(p, mappingFile.sha256, row.root) } : null });
    return { row, choice, sheet, mappingFile };
  });
}

/** Import request for the selection (the server checks every file again). */
export function importBuilds(p: PreparedImport, sel: Selection): ImportBuildInput[] {
  return selectedBuilds(p, sel).map(({ row, choice, mappingFile }) => ({
    label: choice.label.trim(),
    model: row.model.ref,
    rootName: row.root.rootName,
    booklets: choice.booklets.map((s) => p.pdfs.find((x) => x.sha256 === s)?.ref).filter((r): r is FileRef => r !== undefined),
    mapping: mappingFile?.ref ?? null,
  }));
}
