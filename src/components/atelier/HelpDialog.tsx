'use client';

import { Keyboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { SHORTCUTS } from './shortcuts';

/** « ? » (or the keyboard button): every shortcut and gesture of the atelier, by context. */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button type="button" className="ghost icon" aria-label="Raccourcis et gestes (?)" data-tip="Raccourcis et gestes (?)" data-tip-side="bottom" data-tip-align="end" data-testid="help-open" onClick={() => setOpen(true)}>
        <Keyboard size={16} aria-hidden />
      </button>
      <Dialog open={open} title="Raccourcis et gestes" onClose={() => setOpen(false)} wide testId="help-dialog">
        <div className="shortcuts">
          {SHORTCUTS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.items.map(([keys, what]) => (
                  <div key={keys} className="shortcut">
                    <dt>{keys.split(' / ').map((k, i) => <span key={k}>{i > 0 && ' / '}<kbd>{k}</kbd></span>)}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Dialog>
    </>
  );
}
