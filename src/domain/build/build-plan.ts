import type { InstructionRef } from '../instructions/mapping';
import type { BrickOccurrence, ExpandedModel, LDrawDocument } from '../ldraw/types';

export type StepProvenance = 'LDRAW_ROOT' | 'LDRAW_NESTED' | 'USER_EDITED' | 'NONE';
/** INSTRUCTION_STEPS: steps of the official booklet, from a validated manual mapping (instructions/mapping.ts). */
export type StepPlanKind = 'ROOT_STEPS' | 'FLATTENED_STEPS' | 'NO_STEPS' | 'INSTRUCTION_STEPS';

export interface BuildStep {
  readonly id: string;
  readonly index: number;
  readonly occurrenceIds: readonly string[];
  readonly provenance: StepProvenance;
  /** Submodel instance whose step this is (null = root model). */
  readonly instanceId: string | null;
  /** Booklet page and printed number, only for INSTRUCTION_STEPS. */
  readonly instruction?: InstructionRef;
}

export interface StepPlan {
  readonly kind: StepPlanKind;
  readonly steps: readonly BuildStep[];
  readonly notes: readonly string[];
}

/**
 * Builds the step sequence from the LDraw STEP markers only. Never invents steps.
 *
 * Flattening strategy (documented, NOT equivalent to the official LEGO booklet):
 * inside a step, every submodel referenced in that step is built first, its own
 * steps flattened recursively in file order; then the parts placed directly in the
 * step form one step. Empty steps are dropped. Each copy of a reused submodel is
 * built separately, at its final position.
 */
export function buildStepPlan(doc: LDrawDocument, model: ExpandedModel): StepPlan {
  const sectionsWithMarkers = new Set(doc.sections.filter((s) => s.hasStepMarkers).map((s) => s.key));
  const usedSections = new Set([
    doc.sections.find((s) => s.name === model.rootName)?.key,
    ...model.submodelInstances.map((i) => i.sectionKey),
  ]);
  const hasMarkers = [...usedSections].some((key) => key !== undefined && sectionsWithMarkers.has(key));
  if (!hasMarkers) {
    return { kind: 'NO_STEPS', steps: [], notes: ['Aucune commande 0 STEP : modèle fini uniquement, montage libre.'] };
  }

  const directByInstance = new Map<string | null, BrickOccurrence[]>();
  for (const occ of model.occurrences) {
    const key = occ.ancestorSubmodels.at(-1) ?? null;
    const list = directByInstance.get(key) ?? [];
    list.push(occ);
    directByInstance.set(key, list);
  }
  const childrenByInstance = new Map<string | null, typeof model.submodelInstances[number][]>();
  for (const inst of model.submodelInstances) {
    const list = childrenByInstance.get(inst.parentInstanceId) ?? [];
    list.push(inst);
    childrenByInstance.set(inst.parentInstanceId, list);
  }

  const raw: { instanceId: string | null; occurrenceIds: string[] }[] = [];
  const flatten = (instanceId: string | null): void => {
    const direct = directByInstance.get(instanceId) ?? [];
    const children = childrenByInstance.get(instanceId) ?? [];
    const stepIndices = [...new Set([...direct.map((o) => o.stepPath.at(-1)!), ...children.map((c) => c.stepIndexInParent)])].sort((a, b) => a - b);
    for (const s of stepIndices) {
      for (const child of children) if (child.stepIndexInParent === s) flatten(child.instanceId);
      const ids = direct.filter((o) => o.stepPath.at(-1) === s).map((o) => o.occurrenceId);
      if (ids.length > 0) raw.push({ instanceId, occurrenceIds: ids });
    }
  };
  flatten(null);

  if (raw.length <= 1) {
    return { kind: 'NO_STEPS', steps: [], notes: ['Une seule étape exploitable : pas de séquence de montage, montage libre.'] };
  }
  const nested = model.submodelInstances.length > 0;
  const provenance: StepProvenance = nested ? 'LDRAW_NESTED' : 'LDRAW_ROOT';
  const steps = raw.map((s, index) => ({ id: `step-${index + 1}`, index, occurrenceIds: s.occurrenceIds, provenance, instanceId: s.instanceId }));
  const notes = nested
    ? ['Étapes aplaties depuis les sous-modèles (stratégie documentée) ; elles ne correspondent pas forcément à la notice officielle.']
    : ['Étapes lues dans les commandes 0 STEP du modèle principal ; elles ne correspondent pas forcément à la notice officielle.'];
  return { kind: nested ? 'FLATTENED_STEPS' : 'ROOT_STEPS', steps, notes };
}
