'use client';

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/I18nProvider';

export type Tone = 'ok' | 'error' | 'info' | 'warning';

const TONE_ICON: Record<Tone, ReactNode> = {
  ok: <CircleCheck size={16} aria-hidden />,
  error: <CircleAlert size={16} aria-hidden />,
  info: <Info size={16} aria-hidden />,
  warning: <TriangleAlert size={16} aria-hidden />,
};

/** Activity indicator with its text (the text is what is announced). */
export function Loading({ children, className = 'loading' }: { children: ReactNode; className?: string }) {
  return (
    <p className={className} role="status">
      <LoaderCircle className="spinner" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Inline note (info, warning, error, ok) with its icon. */
export function Note({ tone = 'info', children, role, testId, className }: { tone?: Tone; children: ReactNode; role?: 'alert' | 'note' | 'status'; testId?: string; className?: string }) {
  return (
    <div className={`note ${tone}${className ? ` ${className}` : ''}`} role={role} data-testid={testId}>
      {TONE_ICON[tone]}
      <div>{children}</div>
    </div>
  );
}

/**
 * Message of the last action. Errors are announced at once (role=alert), the rest politely; it
 * stays until the next message or until it is closed (no timer: decision A7 of the redesign).
 */
export function Toast({ tone, children, onClose, className = '', testId = 'message' }: { tone: Exclude<Tone, 'warning'>; children: ReactNode; onClose?: () => void; className?: string; testId?: string }) {
  const t = useT();
  return (
    <div className={`toast ${tone} ${className}`.trim()} role={tone === 'error' ? 'alert' : 'status'} data-testid={testId}>
      {TONE_ICON[tone]}
      <span>{children}</span>
      {onClose && <button type="button" className="ghost icon small toast-close" aria-label={t.workshop.feedback.closeMessage} onClick={onClose}><X size={14} aria-hidden /></button>}
    </div>
  );
}

/** Empty state: an icon, a title, a sentence, and the actions that fill it. */
export function EmptyState({ icon, title, children, actions, testId }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <div className="empty-state" data-testid={testId}>
      {icon && <span className="empty-icon" aria-hidden>{icon}</span>}
      <h2 className="empty-title">{title}</h2>
      {children && <div className="muted">{children}</div>}
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}
