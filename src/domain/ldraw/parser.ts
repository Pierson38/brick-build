import { determinant3, fromLDraw } from './matrix';
import {
  DEFAULT_LIMITS,
  type Diagnostic,
  type LDrawDocument,
  type LDrawSection,
  type ParseLimits,
  type SectionMeta,
  type SectionReference,
} from './types';

/**
 * Structural parser for .ldr / .mpd text. It only reads what the build game needs
 * (sections, type-1 references, STEP markers, a few metadata lines) and never throws
 * on malformed input: problems are reported as diagnostics.
 */

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
// LDraw colour numbers, or direct colours 0x2RRGGBB.
const COLOUR_RE = /^(\d{1,6}|0x2[0-9A-Fa-f]{6})$/;
const MAX_REFERENCE_LENGTH = 255;

export function referenceKey(fileName: string): string {
  return fileName.trim().replace(/\\/g, '/').toLowerCase();
}

/** Returns a reason when a referenced file name must be refused, otherwise null. */
export function unsafeReferenceReason(fileName: string): string | null {
  if (fileName.length === 0) return 'nom vide';
  if (fileName.length > MAX_REFERENCE_LENGTH) return 'nom trop long';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(fileName)) return 'caractère de contrôle';
  if (fileName.startsWith('/')) return 'chemin absolu';
  if (/^[a-zA-Z]:/.test(fileName)) return 'lecteur Windows';
  if (fileName.split('/').some((segment) => segment === '..')) return 'remontée de dossier « .. »';
  return null;
}

interface MutableSection {
  name: string;
  key: string;
  firstLine: number;
  refs: SectionReference[];
  hasStepMarkers: boolean;
  meta: { -readonly [K in keyof SectionMeta]: SectionMeta[K] };
  currentStep: number;
  currentStepHasRefs: boolean;
  directGeometryReported: boolean;
  ignored: boolean;
}

export function parseLDraw(text: string, fileName: string, limits: ParseLimits = DEFAULT_LIMITS): LDrawDocument {
  const diagnostics: Diagnostic[] = [];
  const sections: MutableSection[] = [];
  const byKey = new Map<string, MutableSection>();

  const fail = (d: Diagnostic): LDrawDocument => ({ fileName, isMpd: false, sections: [], diagnostics: [d] });

  if (text.length > limits.maxBytes) {
    return fail({ code: 'FILE_TOO_LARGE', severity: 'error', message: `Fichier trop volumineux (limite ${limits.maxBytes} octets).` });
  }
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  if (lines.length > limits.maxLines) {
    return fail({ code: 'TOO_MANY_LINES', severity: 'error', message: `Trop de lignes (limite ${limits.maxLines}).` });
  }
  if (lines.every((l) => l.trim() === '')) {
    return fail({ code: 'EMPTY_FILE', severity: 'error', message: 'Fichier vide.' });
  }

  const isMpd = lines.some((l) => /^\s*0\s+FILE\s+\S/.test(l));
  let current: MutableSection | null = null;
  let outsideReported = false;
  let tooManySections = false;

  const openSection = (name: string, line: number, ignored = false): MutableSection | null => {
    if (sections.length >= limits.maxSections) {
      if (!tooManySections) {
        diagnostics.push({ code: 'TOO_MANY_SECTIONS', severity: 'error', line, message: `Trop de sections (limite ${limits.maxSections}) : les suivantes sont ignorées.` });
        tooManySections = true;
      }
      return null;
    }
    const key = referenceKey(name);
    const section: MutableSection = {
      name, key, firstLine: line, refs: [], hasStepMarkers: false, meta: {},
      currentStep: 0, currentStepHasRefs: false, directGeometryReported: false, ignored,
    };
    if (ignored) return section;
    if (byKey.has(key)) {
      diagnostics.push({ code: 'DUPLICATE_SECTION', severity: 'warning', line, section: name, message: `Section « ${name} » déjà définie (comparaison sans casse) : seule la première est utilisée.` });
      section.ignored = true;
      return section;
    }
    byKey.set(key, section);
    sections.push(section);
    return section;
  };

  if (!isMpd) current = openSection(fileName, 1);

  for (let index = 0; index < lines.length; index++) {
    const lineNo = index + 1;
    const raw = lines[index]!;
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    const typeMatch = /^(\S+)\s*(.*)$/.exec(trimmed)!;
    const lineType = typeMatch[1]!;
    const rest = typeMatch[2]!;

    if (lineType === '0') {
      const meta = /^(\S+)\s*(.*)$/.exec(rest);
      const command = meta?.[1] ?? '';
      const argument = (meta?.[2] ?? '').trim();
      if (isMpd && command === 'FILE') {
        current = argument ? openSection(argument, lineNo) : null;
        if (!argument) diagnostics.push({ code: 'MALFORMED_LINE', severity: 'warning', line: lineNo, message: '« 0 FILE » sans nom.' });
        continue;
      }
      if (isMpd && command === 'NOFILE') {
        current = null;
        continue;
      }
      if (isMpd && command === '!DATA') {
        // Embedded binary data (images): not part of the model.
        current = openSection(argument || `data@${lineNo}`, lineNo, true);
        continue;
      }
      if (!current || current.ignored) continue;
      if (command === 'STEP' || command === 'ROTSTEP') {
        current.hasStepMarkers = true;
        if (current.currentStepHasRefs) {
          current.currentStep += 1;
          current.currentStepHasRefs = false;
        }
        if (command === 'ROTSTEP') {
          diagnostics.push({ code: 'META_IGNORED', severity: 'info', line: lineNo, section: current.name, message: 'ROTSTEP traité comme STEP ; la rotation de vue est ignorée.' });
        }
        continue;
      }
      if (command === 'Name:') current.meta.name ??= argument;
      else if (command === 'Author:') current.meta.author ??= argument;
      else if (command === '!LICENSE') current.meta.license ??= argument;
      else if (current.meta.title === undefined && current.refs.length === 0 && !command.startsWith('!') && command !== 'BFC') {
        current.meta.title = rest.trim();
      }
      continue;
    }

    if (!current) {
      if (!outsideReported) {
        diagnostics.push({ code: 'CONTENT_OUTSIDE_SECTION', severity: 'warning', line: lineNo, message: 'Contenu hors de toute section « 0 FILE » : ignoré.' });
        outsideReported = true;
      }
      continue;
    }
    if (current.ignored) continue;

    if (lineType === '1') {
      const ref = parseType1(rest, lineNo, current, diagnostics);
      if (ref) {
        current.refs.push(ref);
        current.currentStepHasRefs = true;
      }
      continue;
    }
    if (lineType === '2' || lineType === '3' || lineType === '4' || lineType === '5') {
      if (!current.directGeometryReported) {
        diagnostics.push({ code: 'DIRECT_GEOMETRY_IGNORED', severity: 'info', line: lineNo, section: current.name, message: 'Géométrie directe (lignes 2–5) dans le modèle : non manipulable, ignorée par le jeu.' });
        current.directGeometryReported = true;
      }
      continue;
    }
    diagnostics.push({ code: 'UNKNOWN_LINE_TYPE', severity: 'warning', line: lineNo, section: current.name, message: `Type de ligne inconnu « ${lineType.slice(0, 20)} » : ignoré.` });
  }

  const finalSections: LDrawSection[] = sections.map((s) => ({
    name: s.name, key: s.key, firstLine: s.firstLine, refs: s.refs, hasStepMarkers: s.hasStepMarkers, meta: s.meta,
  }));
  return { fileName, isMpd, sections: finalSections, diagnostics };
}

function parseType1(rest: string, line: number, section: MutableSection, diagnostics: Diagnostic[]): SectionReference | null {
  // colour + 12 numbers, then the file name (rest of the line, may contain spaces)
  const match = /^(\S+)((?:\s+\S+){12})\s+(.+)$/.exec(rest);
  if (!match) {
    diagnostics.push({ code: 'MALFORMED_LINE', severity: 'error', line, section: section.name, message: 'Ligne type 1 incomplète : ignorée.' });
    return null;
  }
  const colorCode = match[1]!;
  if (!COLOUR_RE.test(colorCode)) {
    diagnostics.push({ code: 'INVALID_COLOUR', severity: 'error', line, section: section.name, message: `Couleur invalide « ${colorCode.slice(0, 20)} » : ligne ignorée.` });
    return null;
  }
  const tokens = match[2]!.trim().split(/\s+/);
  if (!tokens.every((t) => NUMBER_RE.test(t))) {
    diagnostics.push({ code: 'NON_FINITE_NUMBER', severity: 'error', line, section: section.name, message: 'Nombre invalide ou non fini dans la transformation : ligne ignorée.' });
    return null;
  }
  const values = tokens.map(Number);
  if (!values.every(Number.isFinite)) {
    diagnostics.push({ code: 'NON_FINITE_NUMBER', severity: 'error', line, section: section.name, message: 'Nombre non fini dans la transformation : ligne ignorée.' });
    return null;
  }
  const fileName = match[3]!.trim().replace(/\\/g, '/');
  const unsafe = unsafeReferenceReason(fileName);
  if (unsafe) {
    diagnostics.push({ code: 'UNSAFE_REFERENCE', severity: 'error', line, section: section.name, message: `Référence refusée (${unsafe}) : « ${fileName.slice(0, 80)} ».` });
    return null;
  }
  const localMatrix = fromLDraw(values);
  const det = determinant3(localMatrix);
  if (Math.abs(det) < 1e-9) {
    diagnostics.push({ code: 'SINGULAR_MATRIX', severity: 'warning', line, section: section.name, message: 'Matrice singulière (échelle nulle) : la pièce ne pourra pas être aimantée en rotation.' });
  } else if (det < 0) {
    diagnostics.push({ code: 'MIRRORED_MATRIX', severity: 'warning', line, section: section.name, message: 'Matrice miroir : pièce non manipulable en rotation simple.' });
  } else if (Math.abs(det - 1) > 0.01) {
    diagnostics.push({ code: 'SCALED_MATRIX', severity: 'warning', line, section: section.name, message: 'Matrice avec mise à l’échelle : pièce non manipulable en rotation simple.' });
  }
  return {
    refIndex: section.refs.length,
    line,
    colorCode,
    localMatrix,
    fileName,
    fileKey: referenceKey(fileName),
    stepIndex: section.currentStep,
  };
}
