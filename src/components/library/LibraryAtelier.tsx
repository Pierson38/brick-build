'use client';

import Link from 'next/link';
import { FileWarning, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { analyzeModel, sha256Hex } from '@/domain/import/analyze';
import { parseMapping, serializeMapping } from '@/domain/instructions/mapping';
import { decideOnOpen, saveSignature, summarise, type OpenDecision } from '@/domain/library/save-compare';
import type { BuildView, LibrarySet } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { libraryBuildStore, type BuildStore } from '@/infra/persistence/build-store';
import BrickLabApp, { type BrickLabAppProps } from '../BrickLabApp';
import { keptSignatureOf, mappingsDiffer, readBrowserMapping, readBrowserSave, recoverBrowserSave, rememberKept, SaveDiffView } from './BrowserSave';
import { AppBar, type Crumb } from '../ui/AppBar';
import { Loading } from '../ui/feedback';
import { formatDate } from './labels';

const LOAD_STEPS = ['Vérification des fichiers…', 'Chargement du modèle…', 'Lecture de la progression…'];

type Ready = { store: BuildStore; initial: NonNullable<BrickLabAppProps['initial']>; notes: string[] };
type Answer = { useBrowser: boolean; withMapping: boolean };
type Choice = { decision: Extract<OpenDecision, { kind: 'ask' | 'ask-invalid' }>; total: number; mappingDiffers: boolean; resolve: (a: Answer) => void };

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
      // P5/P6 saves of this browser (localStorage, by model fingerprint): never deleted, never
      // overwritten, and never chosen on dates alone: any relevant difference is shown to the user
      const target = { sha256: build.model.sha256, fileName: build.model.originalName, rootName: build.rootName, occurrences: analysis.model.occurrences };
      const local = readBrowserSave(build.model.sha256, analysis.model.occurrences);
      const localMapping = readBrowserMapping(target);
      const parsedLibMapping = mapping.mapping ? parseMapping(mapping.mapping) : null;
      const libMapping = parsedLibMapping?.ok ? parsedLibMapping.mapping : null;
      const libSave = progress.progress === null ? 'absent' as const : summarise(progress.progress, build.model.sha256, analysis.model.occurrences) ?? 'invalid' as const;
      const decision = decideOnOpen(libSave, local?.summary ?? null, keptSignatureOf(buildId));
      const total = analysis.model.occurrences.length;
      const take = async (withMapping: boolean) => {
        const r = await recoverBrowserSave(buildId, progress.revision, local!.raw, withMapping && localMapping ? { revision: mapping.revision, value: localMapping } : undefined);
        progress = { revision: r.progressRevision, progress: local!.raw };
        if (r.mappingRevision !== null) mapping = { revision: r.mappingRevision, mapping: JSON.parse(serializeMapping(localMapping!)) as unknown };
      };
      if (decision.kind === 'migrate') {
        await take(false);
        notes.push(`Partie enregistrée dans ce navigateur reprise dans la bibliothèque (${local!.summary.placed.length}/${total} pièces, ${formatDate(local!.summary.updatedAtIso)}). Elle reste aussi dans le navigateur.`);
      } else if (decision.kind === 'ask' || decision.kind === 'ask-invalid') {
        const answer = await new Promise<Answer>((resolve) => setChoice({ decision, total, mappingDiffers: mappingsDiffer(libMapping, localMapping), resolve }));
        setChoice(null);
        if (answer.useBrowser) {
          await take(answer.withMapping);
          notes.push(`Sauvegarde de ce navigateur reprise (${local!.summary.placed.length}/${total} pièces)${answer.withMapping ? ', avec ses correspondances' : ''}. La version précédente de la bibliothèque est gardée dans son historique.`);
        } else {
          rememberKept(buildId, saveSignature(local!.summary));
          notes.push('Sauvegarde de la bibliothèque reprise. Celle de ce navigateur est conservée et reste récupérable depuis le détail du set.');
        }
      } else if (decision.kind === 'kept') {
        notes.push(`Une autre sauvegarde existe dans ce navigateur (${decision.diff.browser.placed.length}/${total} pièces) : récupérable depuis le détail du set.`);
      }
      // the mapping alone: taken over when the library has none (nothing to overwrite), otherwise reported
      const current = mapping.mapping ? parseMapping(mapping.mapping) : null;
      if (localMapping && mapping.mapping === null) {
        const r = await libraryApi.putMapping(buildId, null, serializeMapping(localMapping), 'browser');
        mapping = { revision: r.revision, mapping: JSON.parse(serializeMapping(localMapping)) as unknown };
        notes.push(`Correspondances de ce navigateur reprises dans la bibliothèque (${localMapping.steps.length} étape(s)).`);
      } else if (mappingsDiffer(current?.ok ? current.mapping : null, localMapping)) {
        notes.push('Ce navigateur contient une autre version des correspondances pour ce modèle : celle de la bibliothèque est utilisée (l’autre reste dans le navigateur, récupérable depuis le détail du set).');
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

  const crumbs: Crumb[] = [
    { label: 'Ma collection', href: '/', testId: 'back-to-collection' },
    ...(meta ? [{ label: <><span className="setno">{meta.set.setNumber}</span> {meta.set.name}</>, href: `/sets/${meta.set.id}`, title: `${meta.set.setNumber} ${meta.set.name}` }] : []),
    ...(meta && meta.set.name !== meta.build.label ? [{ label: meta.build.label }] : []),
  ];

  if (fatal || choice || !ready) {
    return (
      <div className="app">
        <AppBar crumbs={crumbs} />
        <main className="atelier-wait">
          {fatal ? (
            <div className="repair card" role="alert" data-testid="atelier-error">
              <span className="empty-icon error-icon" aria-hidden><FileWarning size={20} /></span>
              <h2>Impossible d’ouvrir cette construction</h2>
              <p className="error">{fatal}</p>
              <p className="muted">Rien n’a été chargé à la place : aucun autre modèle ni aucune correspondance n’est utilisé.</p>
              {meta && <Link className="button primary" href={`/sets/${meta.set.id}`}><Wrench size={16} aria-hidden /> Réparer depuis le détail du set</Link>}
            </div>
          ) : choice ? (
            <ChoiceScreen choice={choice} />
          ) : (
            <div className="repair">
              <Loading>{step}</Loading>
              <ol className="load-steps small muted">
                {LOAD_STEPS.map((label) => <li key={label} className={label === step ? 'current' : undefined}>{label}</li>)}
              </ol>
            </div>
          )}
        </main>
      </div>
    );
  }
  return (
    <BrickLabApp
      store={ready.store}
      initial={ready.initial}
      crumbs={crumbs}
      banner={ready.notes.length > 0 && notesOpen ? (
        <div className="banner info" data-testid="atelier-notes">
          <ul className="plain small">{ready.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" className="small" onClick={() => setNotesOpen(false)}>OK</button>
        </div>
      ) : null}
    />
  );
}

function ChoiceScreen({ choice }: { choice: Choice }) {
  const { decision, total, mappingDiffers, resolve } = choice;
  // the mapping the browser save was played with goes with it by default; always visible and optional
  const [withMapping, setWithMapping] = useState(mappingDiffers && decision.kind === 'ask' && decision.diff.keys.includes('mapping'));
  return (
    <div className="repair card" data-testid="progress-choice">
      <h2>Deux sauvegardes différentes pour cette construction</h2>
      {decision.kind === 'ask' ? (
        <>
          <p>Choisis celle à reprendre. L’autre n’est ni effacée ni écrasée : la bibliothèque garde sa version précédente dans son historique, et ce navigateur garde la sienne.</p>
          <SaveDiffView diff={decision.diff} total={total} />
          {decision.diff.newer !== 'same' && <p className="small muted">Enregistrée en dernier : {decision.diff.newer === 'library' ? 'la bibliothèque' : 'ce navigateur'} (indication seulement).</p>}
        </>
      ) : (
        <p>La sauvegarde de la bibliothèque ne correspond plus à ce modèle (elle est conservée telle quelle). Ce navigateur contient une partie valide : {decision.browser.placed.length}/{total} pièces, {formatDate(decision.browser.updatedAtIso)}.</p>
      )}
      {mappingDiffers && (
        <label className="small"><input type="checkbox" checked={withMapping} onChange={(e) => setWithMapping(e.target.checked)} data-testid="choice-with-mapping" /> Reprendre aussi les correspondances de ce navigateur (celles de la bibliothèque iront dans son historique)</label>
      )}
      <div className="card-actions">
        <button type="button" className="button primary" onClick={() => resolve({ useBrowser: false, withMapping: false })} data-testid="choice-library">Reprendre la bibliothèque</button>
        <button type="button" className="button secondary" onClick={() => resolve({ useBrowser: true, withMapping })} data-testid="choice-browser">Reprendre ce navigateur</button>
      </div>
    </div>
  );
}
