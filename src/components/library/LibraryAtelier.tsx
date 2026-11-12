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
import { useT } from '@/i18n/I18nProvider';
import { msgs, type Messages } from '@/i18n/runtime';

/** Loading steps: the three fixed ones (listed on screen), then the booklets one by one. */
type LoadStep = 'verify' | 'model' | 'progress' | { readonly booklet: number; readonly of: number };
const LOAD_STEPS = ['verify', 'model', 'progress'] as const;
const loadStepLabel = (t: Messages, s: LoadStep): string => (
  s === 'verify' ? t.atelier.library.loadVerify : s === 'model' ? t.atelier.library.loadModel : s === 'progress' ? t.atelier.library.loadProgress
    : t.atelier.library.loadBooklets(s.booklet, s.of));

/** Notes shown above the atelier, written in the language of the interface when shown. */
type Note = (t: Messages) => string;
type Ready = { store: BuildStore; initial: NonNullable<BrickLabAppProps['initial']>; notes: Note[] };
type Answer = { useBrowser: boolean; withMapping: boolean };
type Choice = { decision: Extract<OpenDecision, { kind: 'ask' | 'ask-invalid' }>; total: number; mappingDiffers: boolean; resolve: (a: Answer) => void };

/**
 * Opens a library build in the existing atelier: every file is re-hashed, the model and booklets
 * are loaded without asking for them, the stored progress and mapping are handed to the atelier,
 * which validates them exactly as in P5/P6. A P5/P6 save of this browser is taken over, never lost.
 */
export default function LibraryAtelier({ buildId }: { buildId: string }) {
  const t = useT();
  const [meta, setMeta] = useState<{ set: LibrarySet; build: BuildView } | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [step, setStep] = useState<LoadStep>('verify');
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
      if (modelCheck?.state !== 'OK') throw new Error(modelCheck?.message ?? msgs().atelier.library.modelUnavailable);
      const notes: Note[] = checked.files.filter((f) => f.kind === 'pdf' && f.state !== 'OK').map((f) => (tr: Messages) => tr.atelier.library.noteBookletNotLoaded(String(f.message)));

      setStep('model');
      const bytes = await libraryApi.fileBytes(build.model.sha256);
      // checked again here: the atelier never runs on bytes other than the recorded ones
      if ((await sha256Hex(bytes)) !== build.model.sha256) throw new Error(msgs().atelier.library.hashMismatch);
      const text = new TextDecoder('utf-8').decode(bytes);
      const analysis = analyzeModel(text, build.model.originalName, { rootName: build.rootName });

      setStep('progress');
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
        const summary = local!.summary;
        notes.push((tr) => tr.atelier.library.noteMigrated(summary.placed.length, total, formatDate(summary.updatedAtIso)));
      } else if (decision.kind === 'ask' || decision.kind === 'ask-invalid') {
        const answer = await new Promise<Answer>((resolve) => setChoice({ decision, total, mappingDiffers: mappingsDiffer(libMapping, localMapping), resolve }));
        setChoice(null);
        if (answer.useBrowser) {
          await take(answer.withMapping);
          const placed = local!.summary.placed.length;
          notes.push((tr) => tr.atelier.library.noteBrowserTaken(placed, total, answer.withMapping));
        } else {
          rememberKept(buildId, saveSignature(local!.summary));
          notes.push((tr) => tr.atelier.library.noteLibraryTaken);
        }
      } else if (decision.kind === 'kept') {
        const placed = decision.diff.browser.placed.length;
        notes.push((tr) => tr.atelier.library.noteKept(placed, total));
      }
      // the mapping alone: taken over when the library has none (nothing to overwrite), otherwise reported
      const current = mapping.mapping ? parseMapping(mapping.mapping) : null;
      if (localMapping && mapping.mapping === null) {
        const r = await libraryApi.putMapping(buildId, null, serializeMapping(localMapping), 'browser');
        mapping = { revision: r.revision, mapping: JSON.parse(serializeMapping(localMapping)) as unknown };
        const steps = localMapping.steps.length;
        notes.push((tr) => tr.atelier.library.noteMappingTaken(steps));
      } else if (mappingsDiffer(current?.ok ? current.mapping : null, localMapping)) {
        notes.push((tr) => tr.atelier.library.noteMappingDiffers);
      }

      const booklets: { file: File; sha256: string }[] = [];
      const okBooklets = build.booklets.filter((b) => checked.files.some((f) => f.sha256 === b.sha256 && f.state === 'OK'));
      for (const [i, b] of okBooklets.entries()) {
        setStep({ booklet: i + 1, of: okBooklets.length });
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
    { label: t.common.myCollection, href: '/', testId: 'back-to-collection' },
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
              <h2>{t.atelier.library.errorTitle}</h2>
              <p className="error">{fatal}</p>
              <p className="muted">{t.atelier.library.nothingLoaded}</p>
              {meta && <Link className="button primary" href={`/sets/${meta.set.id}`}><Wrench size={16} aria-hidden /> {t.atelier.library.repair}</Link>}
            </div>
          ) : choice ? (
            <ChoiceScreen choice={choice} />
          ) : (
            <div className="repair">
              <Loading>{loadStepLabel(t, step)}</Loading>
              <ol className="load-steps small muted">
                {LOAD_STEPS.map((s) => <li key={s} className={s === step ? 'current' : undefined}>{loadStepLabel(t, s)}</li>)}
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
          <ul className="plain small">{ready.notes.map((n) => n(t)).map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" className="small" onClick={() => setNotesOpen(false)}>{t.atelier.library.ok}</button>
        </div>
      ) : null}
    />
  );
}

function ChoiceScreen({ choice }: { choice: Choice }) {
  const t = useT();
  const { decision, total, mappingDiffers, resolve } = choice;
  // the mapping the browser save was played with goes with it by default; always visible and optional
  const [withMapping, setWithMapping] = useState(mappingDiffers && decision.kind === 'ask' && decision.diff.keys.includes('mapping'));
  return (
    <div className="repair card" data-testid="progress-choice">
      <h2>{t.atelier.library.choiceTitle}</h2>
      {decision.kind === 'ask' ? (
        <>
          <p>{t.atelier.library.choiceIntro}</p>
          <SaveDiffView diff={decision.diff} total={total} />
          {decision.diff.newer !== 'same' && <p className="small muted">{t.atelier.library.choiceNewer(decision.diff.newer === 'library')}</p>}
        </>
      ) : (
        <p>{t.atelier.library.choiceInvalid(decision.browser.placed.length, total, formatDate(decision.browser.updatedAtIso))}</p>
      )}
      {mappingDiffers && (
        <label className="small"><input type="checkbox" checked={withMapping} onChange={(e) => setWithMapping(e.target.checked)} data-testid="choice-with-mapping" /> {t.atelier.library.choiceWithMapping}</label>
      )}
      <div className="card-actions">
        <button type="button" className="button primary" onClick={() => resolve({ useBrowser: false, withMapping: false })} data-testid="choice-library">{t.atelier.library.choiceLibrary}</button>
        <button type="button" className="button secondary" onClick={() => resolve({ useBrowser: true, withMapping })} data-testid="choice-browser">{t.atelier.library.choiceBrowser}</button>
      </div>
    </div>
  );
}
