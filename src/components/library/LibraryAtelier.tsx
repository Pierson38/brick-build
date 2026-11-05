'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { restoreProgress, type LocalBuildProgress } from '@/domain/build/progress';
import { analyzeModel, sha256Hex } from '@/domain/import/analyze';
import { mappingDigest, parseMapping, serializeMapping, validateMapping } from '@/domain/instructions/mapping';
import type { BuildView, LibrarySet } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { libraryBuildStore, type BuildStore } from '@/infra/persistence/build-store';
import { loadStoredMapping } from '@/infra/persistence/local-mapping';
import { loadStoredProgress } from '@/infra/persistence/local-progress';
import BrickLabApp, { type BrickLabAppProps } from '../BrickLabApp';
import { formatDate } from './labels';

type Ready = { store: BuildStore; initial: NonNullable<BrickLabAppProps['initial']>; notes: string[] };
type Choice = { server: LocalBuildProgress; browser: LocalBuildProgress; resolve: (useBrowser: boolean) => void };

const summary = (p: LocalBuildProgress) => `${p.placedOccurrenceIds.length}/${p.totalOccurrences} pièces, ${formatDate(p.updatedAtIso)}`;

/**
 * Opens a library build in the existing atelier: every file is re-hashed, the model and booklets
 * are loaded without asking for them, the stored progress and mapping are handed to the atelier,
 * which validates them exactly as in P5/P6. A P5/P6 save of this browser is taken over, never lost.
 */
export default function LibraryAtelier({ buildId }: { buildId: string }) {
  const [meta, setMeta] = useState<{ set: LibrarySet; build: BuildView } | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [step, setStep] = useState('Vérification des fichiers…');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [notesOpen, setNotesOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { set, build } = await libraryApi.build(buildId);
      if (cancelled) return;
      setMeta({ set, build });
      const checked = await libraryApi.check(buildId);
      const modelCheck = checked.files.find((f) => f.sha256 === build.model.sha256);
      if (modelCheck?.state !== 'OK') throw new Error(modelCheck?.message ?? 'Modèle 3D indisponible.');
      const notes: string[] = checked.files.filter((f) => f.kind === 'pdf' && f.state !== 'OK').map((f) => `Notice non chargée : ${f.message}`);

      setStep('Chargement du modèle…');
      const bytes = await libraryApi.fileBytes(build.model.sha256);
      // checked again here: the atelier never runs on bytes other than the recorded ones
      if ((await sha256Hex(bytes)) !== build.model.sha256) throw new Error('Le modèle reçu n’a pas l’empreinte attendue : il n’est pas utilisé.');
      const text = new TextDecoder('utf-8').decode(bytes);
      const analysis = analyzeModel(text, build.model.originalName, { rootName: build.rootName });

      setStep('Lecture de la progression…');
      let [progress, mapping] = await Promise.all([libraryApi.progress(buildId), libraryApi.mapping(buildId)]);
      // P5/P6 saves of this browser (localStorage, by model fingerprint): taken over, never deleted
      const local = loadStoredProgress(build.model.sha256) as LocalBuildProgress | null;
      const localOk = local !== null && restoreProgress(local, build.model.sha256, analysis.model.occurrences).ok;
      if (localOk && progress.progress === null) {
        const r = await libraryApi.putProgress(buildId, null, local);
        progress = { revision: r.revision, progress: local };
        notes.push(`Partie enregistrée dans ce navigateur reprise dans la bibliothèque (${summary(local)}). Elle reste aussi dans le navigateur.`);
      } else if (localOk && progress.progress !== null) {
        const server = progress.progress as LocalBuildProgress;
        const differs = JSON.stringify([server.buildMode, server.placedOccurrenceIds]) !== JSON.stringify([local.buildMode, local.placedOccurrenceIds]);
        if (differs && local.updatedAtIso > server.updatedAtIso) {
          const useBrowser = await new Promise<boolean>((resolve) => setChoice({ server, browser: local, resolve }));
          setChoice(null);
          if (useBrowser) {
            const r = await libraryApi.putProgress(buildId, progress.revision, local);
            progress = { revision: r.revision, progress: local };
            notes.push('Sauvegarde du navigateur reprise ; la version précédente de la bibliothèque est gardée dans son historique.');
          }
        }
      }
      const target = { sha256: build.model.sha256, fileName: build.model.originalName, rootName: build.rootName, occurrences: analysis.model.occurrences };
      const localMapping = loadStoredMapping(build.model.sha256);
      if (localMapping?.ok && !validateMapping(localMapping.mapping, target).issues.some((i) => i.code === 'MODEL_MISMATCH')) {
        const server = mapping.mapping ? parseMapping(mapping.mapping) : null;
        if (!server) {
          const r = await libraryApi.putMapping(buildId, null, serializeMapping(localMapping.mapping), 'browser');
          mapping = { revision: r.revision, mapping: JSON.parse(serializeMapping(localMapping.mapping)) as unknown };
          notes.push(`Correspondances de ce navigateur reprises dans la bibliothèque (${localMapping.mapping.steps.length} étape(s)).`);
        } else if (server.ok && mappingDigest(server.mapping) !== mappingDigest(localMapping.mapping)) {
          notes.push('Ce navigateur contient une autre version des correspondances pour ce modèle : celle de la bibliothèque est utilisée (l’autre reste dans le navigateur, exportable depuis l’atelier sans collection).');
        }
      }

      const booklets: { file: File; sha256: string }[] = [];
      const okBooklets = build.booklets.filter((b) => checked.files.some((f) => f.sha256 === b.sha256 && f.state === 'OK'));
      for (const [i, b] of okBooklets.entries()) {
        setStep(`Chargement des notices (${i + 1}/${okBooklets.length})…`);
        const pdf = await libraryApi.fileBytes(b.sha256);
        booklets.push({ file: new File([pdf], b.originalName, { type: 'application/pdf' }), sha256: b.sha256 });
      }
      if (cancelled) return;
      setReady({
        store: libraryBuildStore({ buildId, progress: { revision: progress.revision, payload: progress.progress }, mapping: { revision: mapping.revision, payload: mapping.mapping } }),
        initial: { fileName: build.model.originalName, text, sha256: build.model.sha256, rootName: build.rootName, booklets },
        notes,
      });
    })().catch((e: unknown) => {
      if (!cancelled) setFatal(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [buildId]);

  const nav = (
    <>
      <Link href="/" className="button secondary small" data-testid="back-to-collection">← Ma collection</Link>
      {meta && <Link href={`/sets/${meta.set.id}`} className="small"><strong>{meta.set.setNumber}</strong> {meta.set.name}{meta.set.name !== meta.build.label ? ` · ${meta.build.label}` : ''}</Link>}
    </>
  );

  if (fatal || choice || !ready) {
    return (
      <div className="app">
        <header className="topbar">{nav}</header>
        <main className="atelier-wait">
          {fatal ? (
            <div className="repair" role="alert" data-testid="atelier-error">
              <h2>Impossible d’ouvrir cette construction</h2>
              <p className="error">{fatal}</p>
              <p>Rien n’a été chargé à la place : aucun autre modèle ni aucune correspondance n’est utilisé.</p>
              {meta && <Link className="button primary" href={`/sets/${meta.set.id}`}>Réparer depuis le détail du set</Link>}
            </div>
          ) : choice ? (
            <div className="repair" data-testid="progress-choice">
              <h2>Deux sauvegardes différentes</h2>
              <p>La bibliothèque contient {summary(choice.server)} ; ce navigateur contient une partie plus récente : {summary(choice.browser)}.</p>
              <div className="card-actions">
                <button type="button" className="button primary" onClick={() => choice.resolve(false)}>Reprendre la bibliothèque</button>
                <button type="button" className="button secondary" onClick={() => choice.resolve(true)}>Reprendre ce navigateur</button>
              </div>
              <p className="small muted">L’autre version n’est pas effacée.</p>
            </div>
          ) : <p className="muted">{step}</p>}
        </main>
      </div>
    );
  }
  return (
    <BrickLabApp
      store={ready.store}
      initial={ready.initial}
      nav={nav}
      banner={ready.notes.length > 0 && notesOpen ? (
        <div className="banner info" data-testid="atelier-notes">
          <ul className="plain small">{ready.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" className="small" onClick={() => setNotesOpen(false)}>OK</button>
        </div>
      ) : null}
    />
  );
}
