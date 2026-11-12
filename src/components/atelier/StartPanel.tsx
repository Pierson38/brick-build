'use client';

import type { BuildMode } from '@/domain/build/engine';
import { useT } from '@/i18n/I18nProvider';
import { MODE_ICON } from './ModeSwitch';

/**
 * The three ways to build, before a game starts: each one explained, the recommended one first in
 * emphasis. A mode that cannot be played shows why, without any button.
 */
export function StartPanel({ unavailable, onStart }: {
  /** Reason per unavailable mode (absent = playable). */
  unavailable: Partial<Record<BuildMode, string>>;
  onStart: (mode: BuildMode) => void;
}) {
  const t = useT();
  const modes = t.workshop.modes;
  const order: BuildMode[] = ['synced', 'guided', 'freeManual'];
  const recommended = order.find((m) => !unavailable[m]);
  return (
    <section className="start-panel" aria-labelledby="start-title">
      <h3 id="start-title" className="section-title">{modes.chooseTitle}</h3>
      <ul className="mode-cards">
        {order.map((m) => {
          const reason = unavailable[m];
          return (
            <li key={m} className={`mode-card${reason ? ' unavailable' : ''}${m === recommended ? ' recommended' : ''}`} data-testid={`start-${m}`}>
              <div className="mode-card-head">
                <span className="mode-card-icon" aria-hidden>{MODE_ICON[m]}</span>
                <strong>{modes.title[m]}</strong>
                {m === recommended && <span className="badge q-GUIDED_PLAYABLE">{modes.recommended}</span>}
              </div>
              <p className="small muted">{modes.text[m]}</p>
              {reason
                ? <p className="small mode-card-reason">{reason}</p>
                : <button type="button" className={m === recommended ? 'button primary' : 'button secondary'} onClick={() => onStart(m)}>{modes.start[m]}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
