import { MAX_MAPPING_BYTES, parseMappingText, serializeMapping, type InstructionMapping, type ParseMappingResult } from '@/domain/instructions/mapping';

// Browser-only store of the user's booklet ↔ 3D mappings, one per model file (SHA-256).
// It holds ids, printed numbers and fingerprints only; values are untrusted on read.

const PREFIX = 'brick-lab:mapping:';

export function loadStoredMapping(modelSha256: string): ParseMappingResult | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + modelSha256);
    return raw ? parseMappingText(raw) : null;
  } catch {
    return null;
  }
}

export function saveMapping(mapping: InstructionMapping): boolean {
  try {
    const raw = serializeMapping(mapping);
    if (raw.length > MAX_MAPPING_BYTES) return false;
    window.localStorage.setItem(PREFIX + mapping.model.sha256, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearMapping(modelSha256: string): void {
  try {
    window.localStorage.removeItem(PREFIX + modelSha256);
  } catch {
    // storage unavailable: nothing to clear
  }
}

/** Personal export: a local download, nothing leaves the machine. */
export function downloadMapping(mapping: InstructionMapping): void {
  const blob = new Blob([serializeMapping(mapping)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${mapping.model.fileName.replace(/\.(mpd|ldr)$/i, '')}.brick-mapping.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
