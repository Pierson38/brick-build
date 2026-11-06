'use client';

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  clampSide, DEFAULT_SIDE, keyResize, LAYOUT_STORAGE_KEY, parseLayout, ratioOf, sideBounds, sideWidth, SPLITTER,
  type PanelContext, type StoredLayout,
} from '@/domain/ui/panel-layout';

// Browser preference only (per browser, like the zoom of a page): never sent to the library.
function readLayout(): StoredLayout {
  try {
    return parseLayout(window.localStorage.getItem(LAYOUT_STORAGE_KEY));
  } catch {
    return parseLayout(null);
  }
}
function writeLayout(layout: StoredLayout) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // private browsing or storage full: the width still applies to this page
  }
}

/** Width of the side panel of a workspace, measured and remembered per context (atelier / editor). */
export function useSidePanel(context: PanelContext) {
  const ref = useRef<HTMLElement>(null);
  const [total, setTotal] = useState(0);
  const [layout, setLayout] = useState<StoredLayout>(readLayout);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setTotal(el.clientWidth);
    const ro = new ResizeObserver(() => setTotal(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const side = total > 0 ? sideWidth(layout[context], total, context) : DEFAULT_SIDE[context];
  /** `persist`: write the preference (end of a drag, keyboard, reset); null = default width. */
  const setSide = useCallback((width: number | null, persist: boolean) => {
    setLayout((cur) => {
      const next = { ...cur, [context]: width === null || total <= 0 ? null : ratioOf(clampSide(width, total), total) };
      if (persist) writeLayout(next);
      return next;
    });
  }, [context, total]);
  return { ref, side, total, setSide, gridTemplateColumns: `minmax(0, 1fr) ${SPLITTER}px ${side}px` };
}

/**
 * Vertical separator between the 3D view and the side panel: drag (mouse, trackpad, pen),
 * keyboard (← → 16 px, Shift 80 px, Home / End, Entrée = défaut), double-click = default width.
 */
export function Splitter({ side, total, context, onResize }: { side: number; total: number; context: PanelContext; onResize: (width: number | null, persist: boolean) => void }) {
  const drag = useRef<{ x: number; side: number; last: number } | null>(null);
  const bounds = sideBounds(total);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { x: e.clientX, side, last: side };
    document.body.classList.add('resizing-panels');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.last = clampSide(d.side - (e.clientX - d.x), total);
    onResize(d.last, false);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    document.body.classList.remove('resizing-panels');
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.last !== d.side) onResize(d.last, true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keyResize(e.key, e.shiftKey, side, total, context);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onResize(e.key === 'Enter' ? null : next, true);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionner : espace 3D / panneau latéral"
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={side}
      aria-valuetext={`Panneau latéral : ${side} px`}
      title="Glisser pour redimensionner · double-clic : largeur par défaut · clavier : ← →, Maj pour aller plus vite, Entrée : défaut"
      tabIndex={0}
      className="splitter"
      data-testid="splitter"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onResize(null, true)}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden className="splitter-grip" />
    </div>
  );
}
