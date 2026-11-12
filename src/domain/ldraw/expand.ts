import { msgs } from '../../i18n/runtime';
import { determinant3, IDENTITY, multiply } from './matrix';
import {
  DEFAULT_LIMITS,
  type BrickOccurrence,
  type Diagnostic,
  type ExpandedModel,
  type LDrawDocument,
  type LDrawSection,
  type Matrix4Tuple,
  type ParseLimits,
  type SubmodelInstance,
} from './types';
import { referenceKey } from './parser';

export const MAIN_COLOUR = '16';
const SUBMODEL_EXTENSIONS = /\.(ldr|mpd)$/i;

/**
 * Expands the submodel tree from the root section into final brick occurrences.
 * A reference is a submodel when its name matches a section of the document;
 * anything else is a part to be resolved later against the local LDraw library.
 */
export function expandModel(
  doc: LDrawDocument,
  options: { rootName?: string; limits?: ParseLimits } = {},
): ExpandedModel {
  const t = msgs().domain.expand;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const diagnostics: Diagnostic[] = [];
  const sections = new Map(doc.sections.map((s) => [s.key, s] as const));
  const root = options.rootName ? sections.get(referenceKey(options.rootName)) : doc.sections[0];

  if (!root) {
    diagnostics.push({ code: 'ROOT_NOT_FOUND', severity: 'error', message: options.rootName ? t.rootNotFound(options.rootName) : t.noModelSection });
    return { rootName: options.rootName ?? '', occurrences: [], submodelInstances: [], diagnostics };
  }

  const occurrences: BrickOccurrence[] = [];
  const instances: SubmodelInstance[] = [];
  const reachable = new Set<string>([root.key]);
  const reportedMissing = new Set<string>();
  let limitReached = false;

  const visit = (
    section: LDrawSection,
    parentMatrix: Matrix4Tuple,
    parentColour: string,
    idPrefix: string,
    ancestors: readonly string[],
    stepPath: readonly number[],
    stack: readonly string[],
  ): void => {
    for (const ref of section.refs) {
      if (limitReached) return;
      const id = `${idPrefix}${section.name}#${ref.refIndex}`;
      const colour = ref.colorCode === MAIN_COLOUR ? parentColour : ref.colorCode;
      const matrix = multiply(parentMatrix, ref.localMatrix);
      const steps = [...stepPath, ref.stepIndex];
      const sub = sections.get(ref.fileKey);

      if (sub && !sub.isPartDefinition) {
        reachable.add(sub.key);
        if (stack.includes(sub.key)) {
          diagnostics.push({ code: 'CYCLE', severity: 'error', section: section.name, line: ref.line, message: t.cycle([...stack, sub.key].join(' → ')) });
          continue;
        }
        if (stack.length >= limits.maxDepth) {
          diagnostics.push({ code: 'MAX_DEPTH', severity: 'error', section: section.name, line: ref.line, message: t.maxDepth(limits.maxDepth) });
          continue;
        }
        instances.push({
          instanceId: id,
          sectionKey: sub.key,
          sectionName: sub.name,
          parentInstanceId: ancestors.at(-1) ?? null,
          stepIndexInParent: ref.stepIndex,
        });
        visit(sub, matrix, colour, `${id}/`, [...ancestors, id], steps, [...stack, sub.key]);
        continue;
      }

      if (sub) reachable.add(sub.key);
      if (!sub && SUBMODEL_EXTENSIONS.test(ref.fileName)) {
        if (!reportedMissing.has(ref.fileKey)) {
          diagnostics.push({ code: 'MISSING_SUBMODEL', severity: 'error', section: section.name, line: ref.line, message: t.missingSubmodel(ref.fileName) });
          reportedMissing.add(ref.fileKey);
        }
        continue;
      }

      if (occurrences.length >= limits.maxOccurrences) {
        diagnostics.push({ code: 'TOO_MANY_OCCURRENCES', severity: 'error', message: t.tooManyOccurrences(limits.maxOccurrences) });
        limitReached = true;
        return;
      }
      const det = determinant3(matrix);
      occurrences.push({
        occurrenceId: id,
        partRef: ref.fileName,
        partKey: ref.fileKey,
        colorCode: colour,
        targetMatrix: matrix,
        sourcePath: `${section.name}:L${ref.line}`,
        ancestorSubmodels: ancestors,
        stepPath: steps,
        rigid: Math.abs(det - 1) <= 0.01,
      });
    }
  };

  visit(root, IDENTITY, MAIN_COLOUR, '', [], [], [root.key]);

  const unreferenced = doc.sections.filter((s) => !reachable.has(s.key) && s.refs.length > 0 && !s.isPartDefinition);
  if (unreferenced.length > 0) {
    diagnostics.push({
      code: 'ALTERNATIVE_ROOT_CANDIDATE',
      severity: 'info',
      message: t.alternativeRoots(unreferenced.map((s) => s.name).join(', ')),
    });
  }
  if (occurrences.length === 0) {
    diagnostics.push({ code: 'NO_OCCURRENCES', severity: 'error', message: t.noOccurrences });
  }
  return { rootName: root.name, occurrences, submodelInstances: instances, diagnostics };
}

/** Sections that could be chosen as main model (non-empty), in file order. */
export function rootCandidates(doc: LDrawDocument): string[] {
  return doc.sections.filter((s) => s.refs.length > 0 && !s.isPartDefinition).map((s) => s.name);
}
