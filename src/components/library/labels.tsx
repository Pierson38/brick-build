'use client';

import type { BuildMode } from '@/domain/build/engine';
import type { BuildStatus, BuildView } from '@/domain/library/types';
import { useT } from '@/i18n/I18nProvider';
import type { Locale } from '@/i18n/locale';
import { currentLocale, msgs, type Messages } from '@/i18n/runtime';

export function StatusBadge({ status }: { status: BuildStatus }) {
  const t = useT();
  return <span className={`status status-${status}`} data-testid="status">{t.library.labels.status[status]}</span>;
}

export function ProgressBar({ placed, total, label }: { placed: number; total: number; label?: string }) {
  const t = useT();
  const pct = total > 0 ? Math.round((100 * placed) / total) : 0;
  return (
    <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={placed} aria-label={label ?? t.library.labels.piecesPlaced}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ModeChips({ modes }: { modes: readonly BuildMode[] }) {
  const t = useT();
  if (modes.length === 0) return <span className="small error">{t.library.labels.noMode}</span>;
  return (
    <ul className="chips modes" aria-label={t.library.labels.modesAria}>
      {modes.map((m) => <li key={m} className={`mode-${m}`}>{t.library.labels.modeShort[m]}</li>)}
    </ul>
  );
}

/** "Construire" for a build never started, "Reprendre" otherwise. */
export const actionLabel = (b: Pick<BuildView, 'status'>, t: Messages = msgs()) => {
  const a = t.library.labels.action;
  return b.status === 'NOT_STARTED' ? a.build : b.status === 'DONE' ? a.review : a.resume;
};

const DATE_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' };

export const formatDate = (iso: string, locale: Locale = currentLocale()) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(DATE_LOCALE[locale], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const formatBytes = (n: number, t: Messages = msgs()) =>
  (n >= 1e6 ? t.library.labels.megabytes((n / 1e6).toFixed(1)) : t.library.labels.kilobytes(Math.max(1, Math.round(n / 1e3))));
