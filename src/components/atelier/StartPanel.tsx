'use client';

import type { BuildMode } from '@/domain/build/engine';
import { MODE_ICON } from './ModeSwitch';

const MODE_TITLE: Record<BuildMode, string> = { synced: 'Notice synchronisée', guided: 'Mode guidé', freeManual: 'Montage libre' };
const MODE_TEXT: Record<BuildMode, string> = {
  synced: 'La page de ta notice suit l’étape en cours ; seules les pièces de l’étape sont proposées.',
  guided: 'Les étapes du fichier LDraw, une à une : les emplacements s’affichent et chaque pièce s’aimante à sa cible.',
  freeManual: 'Dans l’ordre de ton choix, en suivant ta notice : pose chaque pièce où tu veux, rien n’est imposé.',
};
/** Accessible names kept from the first version (used by the E2E suites). */
const START_LABEL: Record<BuildMode, string> = { synced: 'Commencer — notice synchronisée', guided: 'Commencer — mode guidé', freeManual: 'Montage libre (avec notice)' };

/**
 * The three ways to build, before a game starts: each one explained, the recommended one first in
 * emphasis. A mode that cannot be played shows why, without any button.
 */
export function StartPanel({ unavailable, onStart }: {
  /** Reason per unavailable mode (absent = playable). */
  unavailable: Partial<Record<BuildMode, string>>;
  onStart: (mode: BuildMode) => void;
}) {
  const order: BuildMode[] = ['synced', 'guided', 'freeManual'];
  const recommended = order.find((m) => !unavailable[m]);
  return (
    <section className="start-panel" aria-labelledby="start-title">
      <h3 id="start-title" className="section-title">Choisir un mode</h3>
      <ul className="mode-cards">
        {order.map((m) => {
          const reason = unavailable[m];
          return (
            <li key={m} className={`mode-card${reason ? ' unavailable' : ''}${m === recommended ? ' recommended' : ''}`} data-testid={`start-${m}`}>
              <div className="mode-card-head">
                <span className="mode-card-icon" aria-hidden>{MODE_ICON[m]}</span>
                <strong>{MODE_TITLE[m]}</strong>
                {m === recommended && <span className="badge q-GUIDED_PLAYABLE">Recommandé</span>}
              </div>
              <p className="small muted">{MODE_TEXT[m]}</p>
              {reason
                ? <p className="small mode-card-reason">{reason}</p>
                : <button type="button" className={m === recommended ? 'button primary' : 'button secondary'} onClick={() => onStart(m)}>{START_LABEL[m]}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
