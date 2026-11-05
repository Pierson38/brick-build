'use client';

import Link from 'next/link';
import { useState } from 'react';
import { analyzeModel, sha256Hex } from '@/domain/import/analyze';
import { parseMappingText, type InstructionMapping } from '@/domain/instructions/mapping';
import { SET_NUMBER_RE, type LibraryView } from '@/domain/library/types';
import { ApiError, libraryApi } from '@/infra/library/api';
import { formatBytes } from './labels';

const MAX_MODEL_BYTES = 8 * 1024 * 1024;

interface ModelRow {
  readonly key: number;
  readonly file: File;
  readonly sha256: string;
  readonly label: string;
  readonly rootName: string;
  readonly rootCandidates: readonly string[];
  readonly pieces: number;
  readonly title: string;
}

interface MappingPick {
  readonly file: File;
  readonly mapping: InstructionMapping;
}

/** Reads a model in the browser to show what will be added (pieces, main model) before any upload. */
async function readModel(file: File, key: number, label: string): Promise<ModelRow> {
  if (!/\.(mpd|ldr)$/i.test(file.name)) throw new Error(`${file.name} : formats acceptés .mpd et .ldr.`);
  if (file.size > MAX_MODEL_BYTES) throw new Error(`${file.name} : trop volumineux (8 Mo au plus).`);
  const bytes = await file.arrayBuffer();
  const a = analyzeModel(new TextDecoder('utf-8').decode(bytes), file.name);
  if (a.model.occurrences.length === 0) throw new Error(`${file.name} : aucune pièce lue, fichier inutilisable.`);
  const title = a.document.sections.find((s) => s.name === a.model.rootName)?.meta?.title ?? '';
  return { key, file, sha256: await sha256Hex(bytes), label, rootName: a.model.rootName, rootCandidates: a.rootCandidates, pieces: a.model.occurrences.length, title };
}

export function AddSetDialog({ view, onClose, onCreated }: { view: LibraryView; onClose: () => void; onCreated: (setId: string) => void }) {
  const [setNumber, setSetNumber] = useState('');
  const [name, setName] = useState('');
  const [models, setModels] = useState<ModelRow[]>([]);
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [mapping, setMapping] = useState<MappingPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [allowSame, setAllowSame] = useState(false);

  const sameNumber = view.sets.find((s) => s.setNumber.toLowerCase() === setNumber.trim().toLowerCase());
  const mappingTarget = mapping ? models.find((m) => m.sha256 === mapping.mapping.model.sha256 && m.rootName === mapping.mapping.model.rootName) : undefined;

  const addModel = async (file: File) => {
    setError(null);
    try {
      const row = await readModel(file, Date.now(), models.length === 0 ? 'Modèle principal' : `Modèle ${String.fromCharCode(65 + models.length)}`);
      if (models.some((m) => m.sha256 === row.sha256)) throw new Error(`${file.name} est déjà dans la liste.`);
      setModels([...models, row]);
      if (!name && models.length === 0 && row.title && !/^main$/i.test(row.title)) setName(row.title);
      if (!setNumber) {
        const guess = /^(\d{4,7}(?:-\d+)?)/.exec(file.name)?.[1];
        if (guess) setSetNumber(guess);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pickMapping = async (file: File) => {
    setError(null);
    const parsed = parseMappingText(await file.text());
    if (!parsed.ok) return setError(`Correspondances refusées : ${parsed.errors.join(' ')}`);
    setMapping({ file, mapping: parsed.mapping });
  };

  // same rule as the server: a mapping of another file, main model or piece count is never used
  const mappingProblem = !mapping ? null
    : !mappingTarget ? `Ce fichier de correspondances concerne un autre modèle (${mapping.mapping.model.fileName}, empreinte ${mapping.mapping.model.sha256.slice(0, 12)}…, modèle principal « ${mapping.mapping.model.rootName} ») : il ne sera pas utilisé.`
      : mappingTarget.pieces !== mapping.mapping.model.occurrenceCount ? `Nombre de pièces différent : ${mapping.mapping.model.occurrenceCount} dans les correspondances, ${mappingTarget.pieces} dans le modèle.`
        : null;

  const submit = async () => {
    setError(null);
    setDuplicateOf(null);
    if (!SET_NUMBER_RE.test(setNumber.trim())) return setError('Numéro de set invalide (ex. 31040-1).');
    if (!name.trim()) return setError('Donne un nom au set.');
    if (models.length === 0) return setError('Ajoute au moins un modèle 3D (.mpd ou .ldr).');
    if (mappingProblem) return setError('Retire le fichier de correspondances incompatible avant d’ajouter le set.');
    try {
      setBusy('Import des modèles…');
      for (const m of models) await libraryApi.upload('model', m.file);
      const bookletIds: string[] = [];
      for (const [i, f] of pdfs.entries()) {
        setBusy(`Import des notices (${i + 1}/${pdfs.length})…`);
        bookletIds.push((await libraryApi.upload('pdf', f)).file.sha256);
      }
      let mappingFileId: string | undefined;
      if (mapping && mappingTarget && !mappingProblem) {
        setBusy('Import des correspondances…');
        mappingFileId = (await libraryApi.upload('mapping', mapping.file)).file.sha256;
      }
      setBusy('Création du set…');
      const created = await libraryApi.createSet({
        setNumber: setNumber.trim(), name: name.trim(), allowSameNumber: allowSame,
        builds: models.map((m) => ({
          label: m.label, modelFileId: m.sha256, rootName: m.rootName, bookletFileIds: bookletIds,
          ...(mappingTarget && mappingFileId && m.key === mappingTarget.key ? { mappingFileId } : {}),
        })),
      });
      onCreated(created.set.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE' && typeof e.details.setId === 'string') setDuplicateOf(e.details.setId);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-set-title" data-testid="add-set-dialog">
        <h2 id="add-set-title">Ajouter un set</h2>
        <p className="small muted">Les fichiers sont copiés dans <code>{view.dataDir}/library</code> et identifiés par leur empreinte SHA-256. Rien ne quitte ce Mac.</p>
        <div className="form-grid">
          <label>Numéro du set
            <input value={setNumber} onChange={(e) => setSetNumber(e.target.value)} placeholder="31040-1" data-testid="add-number" />
          </label>
          <label>Nom
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Desert Racers" maxLength={120} data-testid="add-name" />
          </label>
        </div>
        {sameNumber && (
          <p className="warn small">
            Le set {sameNumber.setNumber} « {sameNumber.name} » est déjà dans ta collection. Pour un modèle alternatif de la même boîte, <Link href={`/sets/${sameNumber.id}`}>ajoute une construction à ce set</Link>.
            {' '}<label><input type="checkbox" checked={allowSame} onChange={(e) => setAllowSame(e.target.checked)} /> Créer quand même un second set</label>
          </p>
        )}

        <h3>1. Modèle 3D <span className="muted small">(.mpd / .ldr, un par construction)</span></h3>
        <ul className="plain">
          {models.map((m, i) => (
            <li key={m.key} className="model-row" data-testid="add-model-row">
              <input aria-label="Nom de la construction" value={m.label} maxLength={120} onChange={(e) => setModels(models.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <span className="small">{m.file.name} · {m.pieces} pièces</span>
              {m.rootCandidates.length > 1 && (
                <select aria-label="Modèle principal" value={m.rootName} onChange={(e) => setModels(models.map((x, j) => (j === i ? { ...x, rootName: e.target.value } : x)))}>
                  {m.rootCandidates.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              <button type="button" className="small" onClick={() => setModels(models.filter((_, j) => j !== i))}>Retirer</button>
            </li>
          ))}
        </ul>
        <label className="button secondary small">
          {models.length === 0 ? 'Choisir le modèle' : 'Ajouter un modèle alternatif'}
          <input type="file" accept=".mpd,.ldr" hidden data-testid="add-model-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addModel(f); e.target.value = ''; }} />
        </label>

        <h3>2. Notices PDF <span className="muted small">(facultatif, une ou plusieurs)</span></h3>
        <ul className="plain small">
          {pdfs.map((f, i) => <li key={`${f.name}-${i}`}>{f.name} · {formatBytes(f.size)} <button type="button" className="small" onClick={() => setPdfs(pdfs.filter((_, j) => j !== i))}>Retirer</button></li>)}
        </ul>
        <label className="button secondary small">
          Ajouter des notices
          <input type="file" accept="application/pdf,.pdf" multiple hidden data-testid="add-pdf-input"
            onChange={(e) => { const fs = [...(e.target.files ?? [])].filter((f) => !pdfs.some((p) => p.name === f.name && p.size === f.size)); setPdfs([...pdfs, ...fs]); e.target.value = ''; }} />
        </label>

        <h3>3. Correspondances notice ↔ 3D <span className="muted small">(facultatif, fichier .brick-mapping.json)</span></h3>
        {mapping && (
          <p className={mappingProblem ? 'small error' : 'small ok'} data-testid="add-mapping-status">
            {mappingProblem ?? `${mapping.file.name} : ${mapping.mapping.steps.length} étape(s), ${mapping.mapping.steps.filter((s) => s.provenance === 'verified').length} vérifiée(s), pour « ${mappingTarget!.label} ».`}
            {' '}<button type="button" className="small" onClick={() => setMapping(null)}>Retirer</button>
          </p>
        )}
        <label className="button secondary small">
          Choisir un fichier de correspondances
          <input type="file" accept="application/json,.json" hidden data-testid="add-mapping-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickMapping(f); e.target.value = ''; }} />
        </label>

        {error && (
          <p className="error" role="alert" data-testid="add-error">
            {error}{duplicateOf && <> <Link href={`/sets/${duplicateOf}`}>Ouvrir ce set</Link></>}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy !== null}>Annuler</button>
          <button type="button" className="button primary" onClick={() => void submit()} disabled={busy !== null || models.length === 0} data-testid="add-submit">{busy ?? 'Ajouter à ma collection'}</button>
        </div>
      </div>
    </div>
  );
}
