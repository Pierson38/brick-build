/**
 * Width of the atelier side panel (notice, model, mapping editor) next to the 3D view.
 * Pure rules shared by the separator component and its tests: the user's choice is kept as a
 * PROPORTION of the workspace (so it follows a window resize), and both panels keep a usable size.
 */

export type PanelContext = 'atelier' | 'editor';

/** Default widths of P5–P7 (px), used until the user moves the separator. */
export const DEFAULT_SIDE: Record<PanelContext, number> = { atelier: 400, editor: 520 };
export const MIN_SIDE = 280;
export const MIN_VIEW = 320;
export const SPLITTER = 8;
/** Keyboard steps (px). */
export const STEP = 16;
export const BIG_STEP = 80;

export interface Bounds {
  readonly min: number;
  readonly max: number;
}

/** Side widths allowed in a workspace of `total` px. On a narrow window the 3D view keeps priority. */
export function sideBounds(total: number): Bounds {
  const available = Math.max(0, total - SPLITTER);
  const max = Math.max(0, available - MIN_VIEW);
  const min = Math.min(MIN_SIDE, max, Math.floor(available / 2));
  return { min, max: Math.max(min, max) };
}

export const clampSide = (width: number, total: number) => {
  const b = sideBounds(total);
  return Math.round(Math.min(b.max, Math.max(b.min, width)));
};

/** Side width for a stored proportion (null = default width). */
export function sideWidth(ratio: number | null, total: number, context: PanelContext): number {
  return clampSide(ratio === null ? DEFAULT_SIDE[context] : ratio * Math.max(0, total - SPLITTER), total);
}

export const ratioOf = (side: number, total: number) => (total > SPLITTER ? side / (total - SPLITTER) : 0);

/** New side width for a key pressed on the separator (null: key not handled). The separator moves; the side panel is on the right. */
export function keyResize(key: string, shift: boolean, side: number, total: number, context: PanelContext): number | null {
  const step = shift ? BIG_STEP : STEP;
  const b = sideBounds(total);
  switch (key) {
    case 'ArrowLeft': return clampSide(side + step, total);
    case 'ArrowRight': return clampSide(side - step, total);
    case 'Home': return b.max;
    case 'End': return b.min;
    case 'Enter': return clampSide(DEFAULT_SIDE[context], total);
    default: return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Local preference (browser): { atelier: ratio | null, editor: ratio | null }, untrusted.
// ---------------------------------------------------------------------------------------------

export const LAYOUT_STORAGE_KEY = 'brick-lab:atelier-layout:v1';
export type StoredLayout = Record<PanelContext, number | null>;

export function parseLayout(text: string | null): StoredLayout {
  const out: StoredLayout = { atelier: null, editor: null };
  if (!text || text.length > 1000) return out;
  try {
    const raw = JSON.parse(text) as unknown;
    if (typeof raw !== 'object' || raw === null) return out;
    for (const k of ['atelier', 'editor'] as const) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1) out[k] = v;
    }
  } catch {
    // unreadable preference: defaults
  }
  return out;
}
