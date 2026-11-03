'use client';

import type { TrayItem } from '@/domain/build/engine';

interface Props {
  readonly items: readonly TrayItem[];
  readonly heldKey: string | null;
  readonly colourOf: (code: string) => string | null;
  readonly onPick: (item: TrayItem) => void;
}

export function PartsTray({ items, heldKey, colourOf, onPick }: Props) {
  if (items.length === 0) return <p className="muted">Aucune pièce à placer.</p>;
  return (
    <ul className="tray-items" aria-label="Pièces à placer">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            className={item.key === heldKey ? 'tray-item held' : 'tray-item'}
            aria-pressed={item.key === heldKey}
            data-testid={`tray-${item.partKey}-${item.colorCode}`}
            onClick={() => onPick(item)}
          >
            <span className="swatch" style={{ background: colourOf(item.colorCode) ?? '#999' }} />
            <span>{item.partRef.replace(/\.dat$/i, '')}</span>
            <span className="muted small">couleur {item.colorCode}</span>
            <span className="count">×{item.remaining}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
