'use client';

import { BookOpen, Footprints, Hand } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { BuildMode } from '@/domain/build/engine';

export const MODE_ORDER: readonly BuildMode[] = ['synced', 'guided', 'freeManual'];
export const MODE_SHORT_LABEL: Record<BuildMode, string> = { synced: 'Notice synchro', guided: 'Guidé', freeManual: 'Libre' };
export const MODE_ICON: Record<BuildMode, ReactNode> = {
  synced: <BookOpen size={15} aria-hidden />,
  guided: <Footprints size={15} aria-hidden />,
  freeManual: <Hand size={15} aria-hidden />,
};

/**
 * The build mode, always visible in the app bar: a radio group (←/→). A mode that is not available
 * stays shown, disabled, with the reason in its tooltip — never offered as playable.
 */
export function ModeSwitch({ value, labels, unavailable, onChange }: {
  value: BuildMode;
  labels: Record<BuildMode, string>;
  /** Reason per unavailable mode (absent = available). */
  unavailable: Partial<Record<BuildMode, string>>;
  onChange: (mode: BuildMode) => void;
}) {
  const enabled = MODE_ORDER.filter((m) => !unavailable[m] || m === value);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = enabled[(enabled.indexOf(value) + d + enabled.length) % enabled.length]!;
    if (next !== value) onChange(next);
    (e.currentTarget.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="segmented mode-switch" role="radiogroup" aria-label="Mode de construction" data-testid="mode-select" data-value={value} onKeyDown={onKey}>
      {MODE_ORDER.map((m) => {
        const reason = m === value ? undefined : unavailable[m];
        const tip = reason ? `${labels[m]} indisponible : ${reason}` : labels[m];
        return (
          <button key={m} type="button" role="radio" data-value={m} aria-checked={m === value} aria-disabled={reason ? true : undefined}
            aria-label={labels[m]} data-tip={tip} data-tip-side="bottom" tabIndex={m === value ? 0 : -1}
            onClick={() => { if (!reason && m !== value) onChange(m); }}>
            {MODE_ICON[m]}<span>{MODE_SHORT_LABEL[m]}</span>
          </button>
        );
      })}
    </div>
  );
}
