import type { Messages } from '@/i18n/catalogs';
import { msgs } from '@/i18n/runtime';

/**
 * Every keyboard shortcut and pointer gesture of the atelier, by context, for the help dialog
 * (« ? »). Kept next to the key handler of BrickLabApp: a new key must be listed here too (its
 * text lives in the `workshop.shortcuts` catalog).
 */
export interface ShortcutGroup {
  readonly title: string;
  readonly items: readonly (readonly [keys: string, what: string])[];
}

/** The groups in the language of `t` (default: the current language, read at call time). */
export function shortcutGroups(t: Messages = msgs()): readonly ShortcutGroup[] {
  const s = t.workshop.shortcuts;
  return [
    { title: s.everywhere.title, items: [s.everywhere.help, s.everywhere.undo, s.everywhere.orbit, s.everywhere.zoom, s.everywhere.pan] },
    { title: s.held.title, items: [s.held.hover, s.held.click, s.held.quarterTurn, s.held.orientation, s.held.autoHeight, s.held.escape] },
    { title: s.guided.title, items: [s.guided.level, s.guided.rotate] },
    { title: s.freeHeld.title, items: [s.freeHeld.rotate, s.freeHeld.lift, s.freeHeld.remove, s.freeHeld.noSnap, s.freeHeld.grid] },
    {
      title: s.freeSelection.title,
      items: [
        s.freeSelection.click, s.freeSelection.shiftClick, s.freeSelection.doubleClick, s.freeSelection.shiftDoubleClick,
        s.freeSelection.drag, s.freeSelection.gizmoMode, s.freeSelection.gizmoSpace, s.freeSelection.gizmoDrag,
        s.freeSelection.take, s.freeSelection.rotate, s.freeSelection.remove, s.freeSelection.escape,
      ],
    },
    { title: s.mapping.title, items: [s.mapping.click, s.mapping.altClick] },
    { title: s.sidePanel.title, items: [s.sidePanel.arrows, s.sidePanel.reset] },
  ];
}
