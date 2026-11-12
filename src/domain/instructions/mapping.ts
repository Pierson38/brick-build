import { msgs } from '../../i18n/runtime';
import type { BuildStep, StepPlan } from '../build/build-plan';
import type { BrickOccurrence } from '../ldraw/types';

/**
 * Manual correspondence between the occurrences of ONE imported LDraw model and the steps of
 * the official instruction booklet(s) the user imported. Nothing is inferred from the PDF:
 * every step is entered by the user. The file holds ids, printed numbers and fingerprints only,
 * never PDF content. Architecture and risks: docs/implementation/P6_ARCHITECTURE_NOTICE_SYNC.md.
 */

export const MAPPING_FORMAT = 'brick-lab-instruction-mapping';
export const MAPPING_SCHEMA_VERSION = 1;
export const MAPPING_TOOL = 'brick-lab-local/p6';
export const MAX_MAPPING_BYTES = 1024 * 1024;

const MAX_BOOKLETS = 20;
const MAX_STEPS = 5_000;
const MAX_ASSIGNMENTS = 20_000;
const MAX_PAGE = 10_000;
const MAX_REPEAT = 99;
const MAX_TEXT = 200;
const MAX_OCCURRENCE_ID = 512;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type MappingStepProvenance = 'manual' | 'verified';

export interface MappingModelRef {
  /** SHA-256 of the exact model file bytes. */
  readonly sha256: string;
  readonly fileName: string;
  /** Occurrence ids depend on the chosen main model. */
  readonly rootName: string;
  readonly occurrenceCount: number;
}

export interface Booklet {
  readonly id: string;
  readonly label: string;
  readonly fileName: string;
  /** SHA-256 of the exact PDF bytes; null while the booklet is not bound to a file. */
  readonly sha256: string | null;
  readonly pageCount: number | null;
}

export interface InstructionStep {
  readonly id: string;
  readonly bookletId: string;
  /** Page index IN THE PDF FILE (1-based), not the number printed on the page. */
  readonly page: number;
  /** Step number as printed in the booklet. Not unique: numbering restarts (alternative models, inserted sequences). */
  readonly printedStep: string;
  /** Sub-step inside an inset box, as printed ("1", "2"). */
  readonly callout?: string;
  /** Printed multiplier ("2x" → 2). Informative, checked against the number of occurrences. */
  readonly repeat?: number;
  readonly occurrenceIds: readonly string[];
  /** `verified`: the user checked this step visually against the page. */
  readonly provenance: MappingStepProvenance;
  readonly note?: string;
}

export interface InstructionMapping {
  readonly format: typeof MAPPING_FORMAT;
  readonly schemaVersion: typeof MAPPING_SCHEMA_VERSION;
  readonly model: MappingModelRef;
  readonly booklets: readonly Booklet[];
  readonly steps: readonly InstructionStep[];
  readonly provenance: { readonly method: 'manual'; readonly tool: string; readonly createdAtIso: string; readonly updatedAtIso: string };
}

/** What the mapping is checked against: the model as imported now. */
export interface MappingTarget {
  readonly sha256: string;
  readonly fileName: string;
  readonly rootName: string;
  readonly occurrences: readonly Pick<BrickOccurrence, 'occurrenceId'>[];
}

export function createMapping(target: MappingTarget, now: Date = new Date()): InstructionMapping {
  return {
    format: MAPPING_FORMAT,
    schemaVersion: MAPPING_SCHEMA_VERSION,
    model: { sha256: target.sha256, fileName: target.fileName, rootName: target.rootName, occurrenceCount: target.occurrences.length },
    booklets: [],
    steps: [],
    provenance: { method: 'manual', tool: MAPPING_TOOL, createdAtIso: now.toISOString(), updatedAtIso: now.toISOString() },
  };
}

// ---------------------------------------------------------------------------------------------
// Parsing of untrusted data (localStorage or a user file): structure only, no model check here.
// ---------------------------------------------------------------------------------------------

export type ParseMappingResult =
  | { readonly ok: true; readonly mapping: InstructionMapping }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseMappingText(text: string): ParseMappingResult {
  const t = msgs().domain.mapping;
  if (text.length > MAX_MAPPING_BYTES) return { ok: false, errors: [t.fileTooLarge(MAX_MAPPING_BYTES / 1024)] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: [t.unreadableJson] };
  }
  return parseMapping(raw);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;
const positiveInt = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;

export function parseMapping(raw: unknown): ParseMappingResult {
  const t = msgs().domain.mapping;
  const errors: string[] = [];
  const fail = (msg: string): ParseMappingResult => ({ ok: false, errors: [...errors, msg] });
  if (!isRecord(raw)) return fail(t.objectExpected);
  if (raw.format !== MAPPING_FORMAT) return fail(t.notAMappingFile);
  if (raw.schemaVersion !== MAPPING_SCHEMA_VERSION) return fail(t.unsupportedSchema(String(raw.schemaVersion), MAPPING_SCHEMA_VERSION));

  const m = raw.model;
  if (!isRecord(m) || !text(m.sha256) || !SHA256_PATTERN.test(m.sha256) || !text(m.fileName) || !text(m.rootName, MAX_OCCURRENCE_ID)
    || typeof m.occurrenceCount !== 'number' || !Number.isInteger(m.occurrenceCount) || m.occurrenceCount < 0 || m.occurrenceCount > MAX_ASSIGNMENTS) {
    return fail(t.invalidModelFingerprint);
  }

  if (!Array.isArray(raw.booklets) || raw.booklets.length > MAX_BOOKLETS) return fail(t.invalidBookletList(MAX_BOOKLETS));
  const booklets: Booklet[] = [];
  for (const [i, b] of raw.booklets.entries()) {
    if (!isRecord(b) || !text(b.id) || !ID_PATTERN.test(b.id) || !text(b.label) || !text(b.fileName)) return fail(t.invalidBooklet(i + 1));
    if (b.sha256 !== null && !(text(b.sha256) && SHA256_PATTERN.test(b.sha256))) return fail(t.invalidBookletFingerprint(b.label));
    if (b.pageCount !== null && !positiveInt(b.pageCount, MAX_PAGE)) return fail(t.invalidBookletPageCount(b.label));
    booklets.push({ id: b.id, label: b.label, fileName: b.fileName, sha256: b.sha256, pageCount: b.pageCount });
  }

  if (!Array.isArray(raw.steps) || raw.steps.length > MAX_STEPS) return fail(t.invalidStepList(MAX_STEPS));
  const steps: InstructionStep[] = [];
  let assignments = 0;
  for (const [i, s] of raw.steps.entries()) {
    const where = t.stepNumber(i + 1);
    if (!isRecord(s) || !text(s.id) || !ID_PATTERN.test(s.id) || !text(s.bookletId) || !ID_PATTERN.test(s.bookletId)) return fail(t.stepInvalidId(where));
    if (!positiveInt(s.page, MAX_PAGE)) return fail(t.stepInvalidPage(where));
    if (!text(s.printedStep, 40) || s.printedStep.trim() === '') return fail(t.stepMissingPrinted(where));
    if (s.callout !== undefined && !text(s.callout, 40)) return fail(t.stepInvalidCallout(where));
    if (s.repeat !== undefined && !positiveInt(s.repeat, MAX_REPEAT)) return fail(t.stepInvalidRepeat(where));
    if (s.note !== undefined && !text(s.note, 1000)) return fail(t.stepInvalidNote(where));
    if (s.provenance !== 'manual' && s.provenance !== 'verified') return fail(t.stepUnknownProvenance(where));
    if (!Array.isArray(s.occurrenceIds)) return fail(t.stepInvalidPieceList(where));
    assignments += s.occurrenceIds.length;
    if (assignments > MAX_ASSIGNMENTS) return fail(t.tooManyAssignments(MAX_ASSIGNMENTS));
    if (!s.occurrenceIds.every((id): id is string => text(id, MAX_OCCURRENCE_ID) && id.length > 0)) return fail(t.stepInvalidPieceId(where));
    steps.push({
      id: s.id,
      bookletId: s.bookletId,
      page: s.page,
      printedStep: s.printedStep.trim(),
      ...(typeof s.callout === 'string' && s.callout.trim() !== '' ? { callout: s.callout.trim() } : {}),
      ...(typeof s.repeat === 'number' && s.repeat > 1 ? { repeat: s.repeat } : {}),
      occurrenceIds: [...s.occurrenceIds],
      provenance: s.provenance,
      ...(typeof s.note === 'string' && s.note.trim() !== '' ? { note: s.note.trim() } : {}),
    });
  }

  const p = raw.provenance;
  if (!isRecord(p) || p.method !== 'manual' || !text(p.tool) || !text(p.createdAtIso, 40) || !text(p.updatedAtIso, 40)) return fail(t.invalidProvenance);

  return {
    ok: true,
    mapping: {
      format: MAPPING_FORMAT,
      schemaVersion: MAPPING_SCHEMA_VERSION,
      model: { sha256: m.sha256, fileName: m.fileName, rootName: m.rootName, occurrenceCount: m.occurrenceCount },
      booklets,
      steps,
      provenance: { method: 'manual', tool: p.tool, createdAtIso: p.createdAtIso, updatedAtIso: p.updatedAtIso },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Validation against the imported model. Warnings are always recomputed, never read from a file.
// ---------------------------------------------------------------------------------------------

export type MappingIssueCode =
  | 'MODEL_MISMATCH'
  | 'NO_STEPS'
  | 'DUPLICATE_STEP_ID'
  | 'UNKNOWN_BOOKLET'
  | 'BOOKLET_UNBOUND'
  | 'PAGE_OUT_OF_RANGE'
  | 'UNKNOWN_OCCURRENCE'
  | 'DUPLICATE_OCCURRENCE'
  | 'UNASSIGNED_OCCURRENCE'
  | 'EMPTY_STEP'
  | 'PAGE_ORDER'
  | 'DUPLICATE_LABEL'
  | 'REPEAT_MISMATCH'
  | 'NOT_VERIFIED';

export interface MappingIssue {
  readonly code: MappingIssueCode;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly stepId?: string;
  readonly occurrenceIds?: readonly string[];
}

export interface MappingReport {
  /** True when the synchronised mode may be activated (no error). */
  readonly ok: boolean;
  readonly issues: readonly MappingIssue[];
  readonly total: number;
  /** Distinct known occurrences assigned at least once. */
  readonly assigned: number;
  readonly unassigned: readonly string[];
  /** Occurrences assigned more than once, with the steps involved. */
  readonly duplicates: ReadonlyMap<string, readonly string[]>;
}

export function stepLabel(step: Pick<InstructionStep, 'printedStep' | 'callout' | 'repeat'>): string {
  return msgs().domain.mapping.stepLabel(step.printedStep, step.callout, step.repeat);
}

export function validateMapping(mapping: InstructionMapping, target: MappingTarget): MappingReport {
  const t = msgs().domain.mapping;
  const issues: MappingIssue[] = [];
  const err = (code: MappingIssueCode, message: string, extra: Partial<MappingIssue> = {}) => issues.push({ code, severity: 'error', message, ...extra });
  const warn = (code: MappingIssueCode, message: string, extra: Partial<MappingIssue> = {}) => issues.push({ code, severity: 'warning', message, ...extra });
  const known = new Set(target.occurrences.map((o) => o.occurrenceId));

  if (mapping.model.sha256 !== target.sha256) err('MODEL_MISMATCH', t.otherFile(mapping.model.fileName, mapping.model.sha256.slice(0, 12)));
  else if (mapping.model.rootName !== target.rootName) err('MODEL_MISMATCH', t.otherRoot(mapping.model.rootName, target.rootName));
  else if (mapping.model.occurrenceCount !== target.occurrences.length) err('MODEL_MISMATCH', t.pieceCountDiffers(mapping.model.occurrenceCount, target.occurrences.length));

  if (mapping.steps.length === 0) err('NO_STEPS', t.noSteps);

  const booklets = new Map(mapping.booklets.map((b, i) => [b.id, { b, order: i }] as const));
  for (const b of mapping.booklets) {
    if (b.sha256 === null) err('BOOKLET_UNBOUND', t.bookletUnbound(b.label));
  }

  const seenStepIds = new Set<string>();
  const labels = new Map<string, string>();
  const stepsByOccurrence = new Map<string, string[]>();
  let previous: { order: number; page: number } | null = null;
  for (const s of mapping.steps) {
    const at = { stepId: s.id };
    if (seenStepIds.has(s.id)) err('DUPLICATE_STEP_ID', t.duplicateStepId(s.id), at);
    seenStepIds.add(s.id);
    const booklet = booklets.get(s.bookletId);
    if (!booklet) err('UNKNOWN_BOOKLET', t.unknownBooklet(stepLabel(s), s.bookletId), at);
    else {
      if (booklet.b.pageCount !== null && s.page > booklet.b.pageCount) err('PAGE_OUT_OF_RANGE', t.pageOutOfRange(stepLabel(s), s.page, booklet.b.label, booklet.b.pageCount), at);
      if (previous && (booklet.order < previous.order || (booklet.order === previous.order && s.page < previous.page))) {
        warn('PAGE_ORDER', t.pageOrder(stepLabel(s), s.page), at);
      }
      previous = { order: booklet.order, page: s.page };
    }
    const label = `${s.bookletId}|${s.page}|${s.printedStep}|${s.callout ?? ''}`;
    if (labels.has(label)) warn('DUPLICATE_LABEL', t.duplicateLabel(stepLabel(s), s.page), at);
    labels.set(label, s.id);

    if (s.occurrenceIds.length === 0) warn('EMPTY_STEP', t.emptyStep(stepLabel(s), s.page), at);
    if (s.repeat && s.occurrenceIds.length % s.repeat !== 0) {
      warn('REPEAT_MISMATCH', t.repeatMismatch(stepLabel(s), s.occurrenceIds.length, s.repeat), at);
    }
    const unknown = s.occurrenceIds.filter((id) => !known.has(id));
    if (unknown.length > 0) err('UNKNOWN_OCCURRENCE', t.unknownOccurrences(stepLabel(s), unknown.length), { ...at, occurrenceIds: unknown });
    for (const id of s.occurrenceIds) {
      if (!known.has(id)) continue;
      const list = stepsByOccurrence.get(id) ?? [];
      list.push(s.id);
      stepsByOccurrence.set(id, list);
    }
  }

  const duplicates = new Map([...stepsByOccurrence].filter(([, steps]) => steps.length > 1));
  if (duplicates.size > 0) err('DUPLICATE_OCCURRENCE', t.duplicateOccurrences(duplicates.size), { occurrenceIds: [...duplicates.keys()] });
  const unassigned = target.occurrences.map((o) => o.occurrenceId).filter((id) => !stepsByOccurrence.has(id));
  if (unassigned.length > 0) err('UNASSIGNED_OCCURRENCE', t.unassignedOccurrences(unassigned.length), { occurrenceIds: unassigned });

  const notVerified = mapping.steps.filter((s) => s.provenance !== 'verified').length;
  if (notVerified > 0) issues.push({ code: 'NOT_VERIFIED', severity: 'info', message: t.notVerified(notVerified, mapping.steps.length) });

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    total: target.occurrences.length,
    assigned: stepsByOccurrence.size,
    unassigned,
    duplicates,
  };
}

// ---------------------------------------------------------------------------------------------
// From a validated mapping to the build plan used by the existing engine.
// ---------------------------------------------------------------------------------------------

export interface InstructionRef {
  readonly stepId: string;
  readonly bookletId: string;
  readonly page: number;
  readonly label: string;
  /** Position of its printed step among the printed steps of the same page (1-based), and their count. */
  readonly positionOnPage: number;
  readonly stepsOnPage: number;
}

/** Only call on a mapping whose report is ok. Empty steps are left out (they have nothing to place). */
export function mappingToStepPlan(mapping: InstructionMapping): StepPlan {
  const played = mapping.steps.filter((s) => s.occurrenceIds.length > 0);
  // position among the PRINTED steps of the page: callouts belong to their printed step
  const printedOnPage = new Map<string, string[]>();
  for (const s of played) {
    const key = `${s.bookletId}|${s.page}`;
    const list = printedOnPage.get(key) ?? [];
    if (!list.includes(s.printedStep)) list.push(s.printedStep);
    printedOnPage.set(key, list);
  }
  const steps: BuildStep[] = played.map((s, index) => {
    const printed = printedOnPage.get(`${s.bookletId}|${s.page}`)!;
    return {
      id: `notice-${s.id}`,
      index,
      occurrenceIds: [...s.occurrenceIds],
      provenance: 'USER_EDITED',
      instanceId: null,
      instruction: { stepId: s.id, bookletId: s.bookletId, page: s.page, label: stepLabel(s), positionOnPage: printed.indexOf(s.printedStep) + 1, stepsOnPage: printed.length },
    };
  });
  const skipped = mapping.steps.length - played.length;
  return {
    kind: 'INSTRUCTION_STEPS',
    steps,
    notes: [
      msgs().domain.mapping.planNote(steps.length, skipped),
    ],
  };
}

/**
 * Deterministic fingerprint of the playable content (step order and assignments), stored with the
 * progress to detect that the mapping changed since. FNV-1a 32 bits: change detection, not security.
 */
export function mappingDigest(mapping: InstructionMapping): string {
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(mapping.model.sha256);
  for (const s of mapping.steps) feed(`|${s.id}:${s.bookletId}:${s.page}:${s.occurrenceIds.join(',')}`);
  return h.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------------------------
// Pure editing operations used by the editor. They never create duplicates on their own.
// ---------------------------------------------------------------------------------------------

function nextId(prefix: string, used: Iterable<string>): string {
  const ids = new Set(used);
  let n = ids.size + 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Map occurrence id → ids of the steps it is assigned to. */
export function assignmentIndex(mapping: InstructionMapping): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of mapping.steps) {
    for (const id of s.occurrenceIds) {
      const list = out.get(id) ?? [];
      list.push(s.id);
      out.set(id, list);
    }
  }
  return out;
}

export function addBooklet(mapping: InstructionMapping, file: { label: string; fileName: string; sha256: string; pageCount: number }): { mapping: InstructionMapping; bookletId: string } {
  const id = nextId('b', mapping.booklets.map((b) => b.id));
  return { mapping: { ...mapping, booklets: [...mapping.booklets, { id, ...file }] }, bookletId: id };
}

export function bindBooklet(mapping: InstructionMapping, bookletId: string, file: { fileName: string; sha256: string; pageCount: number }): InstructionMapping {
  return { ...mapping, booklets: mapping.booklets.map((b) => (b.id === bookletId ? { ...b, ...file } : b)) };
}

export function renameBooklet(mapping: InstructionMapping, bookletId: string, label: string): InstructionMapping {
  return { ...mapping, booklets: mapping.booklets.map((b) => (b.id === bookletId ? { ...b, label: label.slice(0, MAX_TEXT) } : b)) };
}

/** A booklet still used by a step cannot be removed. */
export function removeBooklet(mapping: InstructionMapping, bookletId: string): InstructionMapping | null {
  if (mapping.steps.some((s) => s.bookletId === bookletId)) return null;
  return { ...mapping, booklets: mapping.booklets.filter((b) => b.id !== bookletId) };
}

const incremented = (printed: string) => (/^\d+$/.test(printed) ? String(Number(printed) + 1) : printed);

/** Inserts a new empty step after `afterStepId` (or at the end), prefilled from its neighbour. */
export function addStep(
  mapping: InstructionMapping,
  afterStepId: string | null,
  init: Partial<Pick<InstructionStep, 'bookletId' | 'page' | 'printedStep' | 'callout' | 'repeat'>> = {},
): { mapping: InstructionMapping; stepId: string } {
  const at = afterStepId ? mapping.steps.findIndex((s) => s.id === afterStepId) : mapping.steps.length - 1;
  const ref = mapping.steps[at];
  const bookletId = init.bookletId ?? ref?.bookletId ?? mapping.booklets[0]?.id;
  if (!bookletId) throw new Error(msgs().domain.mapping.addBookletFirst);
  const id = nextId('s', mapping.steps.map((s) => s.id));
  const step: InstructionStep = {
    id,
    bookletId,
    page: init.page ?? ref?.page ?? 1,
    printedStep: init.printedStep ?? (ref ? (ref.callout ? ref.printedStep : incremented(ref.printedStep)) : '1'),
    ...(init.callout ? { callout: init.callout } : {}),
    ...(init.repeat && init.repeat > 1 ? { repeat: init.repeat } : {}),
    occurrenceIds: [],
    provenance: 'manual',
  };
  const steps = [...mapping.steps];
  steps.splice(at + 1, 0, step);
  return { mapping: { ...mapping, steps }, stepId: id };
}

export type StepPatch = Partial<Pick<InstructionStep, 'bookletId' | 'page' | 'printedStep' | 'callout' | 'repeat' | 'provenance' | 'note'>>;

export function updateStep(mapping: InstructionMapping, stepId: string, patch: StepPatch): InstructionMapping {
  return {
    ...mapping,
    steps: mapping.steps.map((s) => {
      if (s.id !== stepId) return s;
      const next: Record<string, unknown> = { ...s, ...patch };
      if (!next.callout) delete next.callout;
      if (!next.repeat || (next.repeat as number) < 2) delete next.repeat;
      if (!next.note) delete next.note;
      // any change of what the step contains invalidates its visual check
      if (patch.provenance === undefined && (patch.page !== undefined || patch.bookletId !== undefined)) next.provenance = 'manual';
      return next as unknown as InstructionStep;
    }),
  };
}

export function removeStep(mapping: InstructionMapping, stepId: string): InstructionMapping {
  return { ...mapping, steps: mapping.steps.filter((s) => s.id !== stepId) };
}

export function moveStep(mapping: InstructionMapping, stepId: string, delta: -1 | 1): InstructionMapping {
  const i = mapping.steps.findIndex((s) => s.id === stepId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= mapping.steps.length) return mapping;
  const steps = [...mapping.steps];
  [steps[i], steps[j]] = [steps[j]!, steps[i]!];
  return { ...mapping, steps };
}

/**
 * Adds occurrences to a step. Occurrences already assigned to ANOTHER step are left where they are
 * unless `move` is set (then they are taken out of their step): never a silent duplicate.
 */
export function assignToStep(
  mapping: InstructionMapping,
  stepId: string,
  occurrenceIds: readonly string[],
  options: { move?: boolean } = {},
): { mapping: InstructionMapping; added: string[]; alreadyElsewhere: string[] } {
  const index = assignmentIndex(mapping);
  const added: string[] = [];
  const alreadyElsewhere: string[] = [];
  for (const id of new Set(occurrenceIds)) {
    const owners = index.get(id) ?? [];
    if (owners.includes(stepId)) continue;
    if (owners.length > 0 && !options.move) alreadyElsewhere.push(id);
    else added.push(id);
  }
  if (added.length === 0) return { mapping, added, alreadyElsewhere };
  const moving = new Set(added);
  const steps = mapping.steps.map((s) => {
    if (s.id === stepId) return { ...s, occurrenceIds: [...s.occurrenceIds, ...added], provenance: 'manual' as const };
    if (options.move && s.occurrenceIds.some((id) => moving.has(id))) return { ...s, occurrenceIds: s.occurrenceIds.filter((id) => !moving.has(id)), provenance: 'manual' as const };
    return s;
  });
  return { mapping: { ...mapping, steps }, added, alreadyElsewhere };
}

/** Removes occurrences from one step (all their copies in it, which also fixes an in-step duplicate). */
export function unassignFromStep(mapping: InstructionMapping, stepId: string, occurrenceIds: readonly string[]): InstructionMapping {
  const drop = new Set(occurrenceIds);
  return {
    ...mapping,
    steps: mapping.steps.map((s) => (s.id === stepId && s.occurrenceIds.some((id) => drop.has(id))
      ? { ...s, occurrenceIds: s.occurrenceIds.filter((id) => !drop.has(id)), provenance: 'manual' as const }
      : s)),
  };
}

/** Keeps each duplicated occurrence only in the FIRST step that has it. */
export function resolveDuplicatesKeepFirst(mapping: InstructionMapping): InstructionMapping {
  const seen = new Set<string>();
  return {
    ...mapping,
    steps: mapping.steps.map((s) => {
      const kept = s.occurrenceIds.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
      return kept.length === s.occurrenceIds.length ? s : { ...s, occurrenceIds: kept, provenance: 'manual' as const };
    }),
  };
}

export function touch(mapping: InstructionMapping, now: Date = new Date()): InstructionMapping {
  return { ...mapping, provenance: { ...mapping.provenance, updatedAtIso: now.toISOString() } };
}

export function serializeMapping(mapping: InstructionMapping): string {
  return `${JSON.stringify(mapping, null, 2)}\n`;
}
