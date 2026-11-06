'use client';

import { useEffect, useState } from 'react';
import type { Group } from 'three';
import type { TrayItem } from '@/domain/build/engine';
import { partThumbnails, THUMB_SIZE } from '@/infra/ldraw/part-thumbnails';

interface Props {
  readonly items: readonly TrayItem[];
  readonly heldKey: string | null;
  readonly colourOf: (code: string) => string | null;
  readonly colourName?: (code: string) => string | null;
  /** Geometry used by the 3D view, by tray key: the thumbnail is drawn from it. */
  readonly templates?: ReadonlyMap<string, Group>;
  readonly onPick: (item: TrayItem) => void;
}

/** Thumbnail of the real LDraw part/colour, or an explicit fallback when its geometry is missing. */
function PartThumb({ template, colour }: { template: Group | undefined; colour: string | null }) {
  const [src, setSrc] = useState<string | null | undefined>(template ? undefined : null);
  useEffect(() => {
    if (!template) {
      setSrc(null);
      return;
    }
    let alive = true;
    setSrc(undefined);
    void partThumbnails.thumbnail(template).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [template]);
  if (src) return <img src={src} alt="" className="part-thumb" width={THUMB_SIZE} height={THUMB_SIZE} data-thumb="ok" draggable={false} />;
  return (
    <span className={src === null ? 'part-thumb fallback' : 'part-thumb loading'} data-thumb={src === null ? 'missing' : 'loading'} aria-hidden>
      <span className="swatch" style={{ background: colour ?? '#999' }} />
      {src === null && <span className="small">forme indisponible</span>}
    </span>
  );
}

export function PartsTray({ items, heldKey, colourOf, colourName, templates, onPick }: Props) {
  if (items.length === 0) return <p className="muted">Aucune pièce à placer.</p>;
  return (
    <ul className="tray-items" aria-label="Pièces à placer">
      {items.map((item) => {
        const ref = item.partRef.replace(/\.dat$/i, '');
        const name = colourName?.(item.colorCode) ?? null;
        const template = templates?.get(item.key);
        const held = item.key === heldKey;
        return (
          <li key={item.key}>
            <button
              type="button"
              className={held ? 'tray-item held' : 'tray-item'}
              aria-pressed={held}
              aria-label={`Pièce ${ref}, ${name ?? `couleur ${item.colorCode}`}, ${item.remaining} à poser${template ? '' : ' (forme indisponible)'}`}
              title={`${ref} · ${name ?? 'couleur'} (${item.colorCode}) · ${item.remaining}/${item.total} à poser`}
              data-testid={`tray-${item.partKey}-${item.colorCode}`}
              onClick={() => onPick(item)}
            >
              <PartThumb template={template} colour={colourOf(item.colorCode)} />
              <span className="count">×{item.remaining}</span>
              <span className="ref">{ref}</span>
              {held && <span className="held-badge" aria-hidden>en main</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
