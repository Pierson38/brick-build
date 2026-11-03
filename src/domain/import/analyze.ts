import { buildStepPlan, type StepPlan } from '../build/build-plan';
import { expandModel, rootCandidates } from '../ldraw/expand';
import { parseLDraw } from '../ldraw/parser';
import { DEFAULT_LIMITS, type Diagnostic, type ExpandedModel, type LDrawDocument, type ParseLimits } from '../ldraw/types';

export type ImportQuality = 'INVALID' | 'ANALYSABLE' | 'RENDERABLE' | 'MANUAL_ONLY' | 'GUIDED_PLAYABLE';

export interface ModelAnalysis {
  readonly document: LDrawDocument;
  readonly model: ExpandedModel;
  readonly plan: StepPlan;
  readonly rootCandidates: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly uniqueParts: readonly string[];
  readonly colours: readonly string[];
  /** Raw text (with its `0 FILE` line) of every part definition embedded in the MPD. */
  readonly embeddedParts: readonly { readonly name: string; readonly text: string }[];
}

export function analyzeModel(
  text: string,
  fileName: string,
  options: { rootName?: string; limits?: ParseLimits } = {},
): ModelAnalysis {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const document = parseLDraw(text, fileName, limits);
  const model = expandModel(document, { limits, ...(options.rootName ? { rootName: options.rootName } : {}) });
  const plan = buildStepPlan(document, model);
  const lines = text.split(/\r\n|\r|\n/);
  const embeddedParts = document.sections
    .filter((s) => s.isPartDefinition)
    .map((s) => ({ name: s.name, text: lines.slice(s.firstLine - 1, s.lastLine).join('\n') }));
  return {
    document,
    model,
    embeddedParts,
    plan,
    rootCandidates: rootCandidates(document),
    diagnostics: [...document.diagnostics, ...model.diagnostics],
    uniqueParts: [...new Set(model.occurrences.map((o) => o.partKey))].sort(),
    colours: [...new Set(model.occurrences.map((o) => o.colorCode))].sort(),
  };
}

export interface QualityReport {
  readonly quality: ImportQuality;
  readonly reasons: readonly string[];
}

/**
 * `missingParts`: part keys the local library could not resolve, or `null` when the
 * library has not been checked yet (then the model is at most ANALYSABLE).
 */
export function classifyImport(analysis: ModelAnalysis, missingParts: ReadonlySet<string> | null): QualityReport {
  const fatal = analysis.diagnostics.filter((d) => d.severity === 'error' && (d.code === 'EMPTY_FILE' || d.code === 'FILE_TOO_LARGE' || d.code === 'TOO_MANY_LINES' || d.code === 'ROOT_NOT_FOUND' || d.code === 'NO_OCCURRENCES'));
  if (fatal.length > 0 || analysis.model.occurrences.length === 0) {
    return { quality: 'INVALID', reasons: fatal.map((d) => d.message) };
  }
  const reasons: string[] = [];
  const errors = analysis.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) reasons.push(`${errors.length} erreur(s) de lecture : certaines lignes ou branches sont ignorées.`);
  if (missingParts === null) {
    return { quality: 'ANALYSABLE', reasons: [...reasons, 'Bibliothèque de pièces non vérifiée.'] };
  }
  const missingOccurrences = analysis.model.occurrences.filter((o) => missingParts.has(o.partKey)).length;
  if (missingOccurrences > 0) {
    return { quality: 'ANALYSABLE', reasons: [...reasons, `${missingParts.size} référence(s) absente(s) de la bibliothèque locale (${missingOccurrences} pièce(s)) : rendu incomplet.`] };
  }
  const nonRigid = analysis.model.occurrences.filter((o) => !o.rigid).length;
  if (nonRigid > 0) {
    return { quality: 'RENDERABLE', reasons: [...reasons, `${nonRigid} pièce(s) avec matrice miroir/échelle : aimantation non fiable.`] };
  }
  if (analysis.plan.kind === 'NO_STEPS') {
    return { quality: 'MANUAL_ONLY', reasons: [...reasons, ...analysis.plan.notes] };
  }
  return { quality: 'GUIDED_PLAYABLE', reasons: [...reasons, ...analysis.plan.notes] };
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
