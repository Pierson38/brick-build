'use client';

import type { BuildMode } from '@/domain/build/engine';
import type { BuildStatus, BuildView, FileState } from '@/domain/library/types';

export const STATUS_LABEL: Record<BuildStatus, string> = { NOT_STARTED: 'Jamais commencé', IN_PROGRESS: 'En cours', DONE: 'Terminé' };
export const MODE_SHORT: Record<BuildMode, string> = { synced: 'Notice synchronisée', guided: 'Guidé (étapes LDraw)', freeManual: 'Montage libre' };
export const FILE_STATE_LABEL: Record<FileState, string> = {
  OK: 'disponible', MISSING: 'introuvable', SIZE_CHANGED: 'modifié (taille)', HASH_MISMATCH: 'modifié (empreinte)', UNREADABLE: 'illisible',
};

export function StatusBadge({ status }: { status: BuildStatus }) {
  return <span className={`status status-${status}`} data-testid="status">{STATUS_LABEL[status]}</span>;
}

export function ProgressBar({ placed, total }: { placed: number; total: number }) {
  const pct = total > 0 ? Math.round((100 * placed) / total) : 0;
  return (
    <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={placed} aria-label="Pièces posées">
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ModeChips({ modes }: { modes: readonly BuildMode[] }) {
  if (modes.length === 0) return <span className="small error">Aucun mode : fichier à réparer</span>;
  return (
    <ul className="chips modes" aria-label="Modes de construction disponibles">
      {modes.map((m) => <li key={m} className={`mode-${m}`}>{MODE_SHORT[m]}</li>)}
    </ul>
  );
}

/** "Construire" for a build never started, "Reprendre" otherwise. */
export const actionLabel = (b: Pick<BuildView, 'status'>) => (b.status === 'NOT_STARTED' ? 'Construire' : b.status === 'DONE' ? 'Revoir' : 'Reprendre');

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const formatBytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);
