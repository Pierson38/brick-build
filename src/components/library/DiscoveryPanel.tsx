'use client';

import { useEffect, useState } from 'react';
import type { DiscoveredSet, DiscoveryResult } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { formatBytes } from './labels';

/** Most verified mapping first; none is preselected when none is verified. */
const defaultMapping = (s: DiscoveredSet) => [...s.mappings].sort((a, b) => b.verified - a.verified).find((m) => m.verified > 0) ?? null;

function Candidate({ set, onAdded }: { set: DiscoveredSet; onAdded: () => void }) {
  const model = set.models.find((m) => !m.existingBuild) ?? set.models[0]!;
  const generic = !model.title || /^main$/i.test(model.title);
  const [name, setName] = useState(generic ? set.folder : model.title);
  const [number, setNumber] = useState(set.setNumber ?? '');
  const [pdfs, setPdfs] = useState<ReadonlySet<string>>(new Set(set.pdfs.map((p) => p.sha256)));
  const [mappingSha, setMappingSha] = useState<string | null>(defaultMapping(set)?.sha256 ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forModel = set.mappings.filter((m) => m.modelSha256 === model.sha256);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const mapping = forModel.find((m) => m.sha256 === mappingSha);
      await libraryApi.adopt({
        setNumber: number.trim(), name: name.trim(),
        models: [{ rel: model.rel, sha256: model.sha256, label: 'Modèle principal', rootName: model.rootName }],
        pdfs: set.pdfs.filter((p) => pdfs.has(p.sha256)).map((p) => ({ rel: p.rel, sha256: p.sha256 })),
        mappings: mapping ? [{ rel: mapping.rel, sha256: mapping.sha256, modelSha256: mapping.modelSha256 }] : [],
      });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="candidate" data-testid={`discovered-${set.folder}`}>
      <div className="form-grid">
        <label>Numéro <input value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label>Nom <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="discovered-name" /></label>
      </div>
      <p className="small">Modèle : <code>{model.rel}</code> · {model.occurrenceCount} pièces · {model.stepCount > 0 ? `${model.stepCount} étapes LDraw` : 'sans étapes'}</p>
      {set.pdfs.length > 0 && (
        <fieldset className="small">
          <legend>Notices trouvées</legend>
          {set.pdfs.map((p) => (
            <label key={p.sha256} className="block">
              <input type="checkbox" checked={pdfs.has(p.sha256)} onChange={(e) => setPdfs((cur) => { const n = new Set(cur); if (e.target.checked) n.add(p.sha256); else n.delete(p.sha256); return n; })} />
              {' '}{p.name} · {formatBytes(p.size)}
            </label>
          ))}
        </fieldset>
      )}
      {forModel.length > 0 && (
        <fieldset className="small">
          <legend>Correspondances trouvées (reconnues par l’empreinte du modèle)</legend>
          <label className="block"><input type="radio" name={`map-${set.folder}`} checked={mappingSha === null} onChange={() => setMappingSha(null)} /> Aucune</label>
          {forModel.map((m) => (
            <label key={m.sha256} className="block">
              <input type="radio" name={`map-${set.folder}`} checked={mappingSha === m.sha256} onChange={() => setMappingSha(m.sha256)} data-testid={`discovered-mapping-${m.name}`} />
              {' '}{m.name} · {m.steps} étapes, <strong>{m.verified}/{m.steps} vérifiées</strong>
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="error small" role="alert">{error}</p>}
      <button type="button" className="button primary small" disabled={busy || !name.trim() || !number.trim()} onClick={() => void add()} data-testid="discovered-add">
        {busy ? 'Ajout…' : 'Ajouter à ma collection (fichiers laissés en place)'}
      </button>
    </li>
  );
}

/** Sets already present in the data folder (models/, instructions/, mappings/), not yet in the collection. */
export function DiscoveryPanel({ onAdded }: { onAdded: () => void }) {
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    libraryApi.discover().then(setResult, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [round]);
  const candidates = result?.sets.filter((s) => s.models.some((m) => !m.existingBuild)) ?? [];
  if (error) return <p className="small muted">Détection des fichiers existants indisponible : {error}</p>;
  if (candidates.length === 0) return null;
  return (
    <section className="discovery" data-testid="discovery">
      <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {candidates.length} set(s) trouvé(s) dans ton dossier de données, pas encore dans la collection {open ? '▴' : '▾'}
      </button>
      {open && (
        <>
          <p className="small muted">Lecture seule de <code>{result!.dataDir}</code> (models/, instructions/, mappings/) : les fichiers ne sont ni copiés ni déplacés, leur empreinte est vérifiée à chaque ouverture.</p>
          <ul className="plain candidates">
            {candidates.map((s) => <Candidate key={s.folder} set={s} onAdded={() => { setRound((r) => r + 1); onAdded(); }} />)}
          </ul>
          {result!.skipped.length > 0 && <details className="small"><summary>{result!.skipped.length} fichier(s) ignoré(s)</summary><ul>{result!.skipped.map((s) => <li key={s}>{s}</li>)}</ul></details>}
        </>
      )}
    </section>
  );
}
