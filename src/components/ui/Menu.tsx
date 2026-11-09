'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface MenuItem {
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly testId?: string;
}

/**
 * Button + list of actions (role=menu): opens on click, Enter, Space or ↓; ↑/↓ move, Escape or a
 * click outside closes and gives the focus back to the button.
 */
export function Menu({ label, icon, items, side = 'down', className = 'ghost icon', testId }: {
  label: string;
  icon: ReactNode;
  items: readonly MenuItem[];
  side?: 'up' | 'down';
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away);
    root.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus();
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const entries = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])];
    const i = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); entries[(i + 1) % entries.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); entries[(i - 1 + entries.length) % entries.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div className="menu" ref={root}>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={label}
        data-tip={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-testid={testId}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        {icon}
      </button>
      {open && (
        <ul className={`menu-list ${side}`} role="menu" id={id} aria-label={label} onKeyDown={onKey}>
          {items.map((item, i) => (
            <li key={i} role="none">
              <button type="button" role="menuitem" className={item.danger ? 'danger' : undefined} disabled={item.disabled}
                data-testid={item.testId} onClick={() => { setOpen(false); item.onSelect(); }}>
                {item.icon}{item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
