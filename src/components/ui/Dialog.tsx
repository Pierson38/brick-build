'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Modal dialog on the native <dialog>: focus trapped and Escape handled by the browser (same in
 * Chromium and WebKit), focus given back to the opener on close. `onClose` runs on Escape, on the
 * close button and on a click on the backdrop.
 */
export function Dialog({ open, title, onClose, children, footer, wide = false, testId }: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog-modal wide' : 'dialog-modal'}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <span className="spacer" />
            <button type="button" className="ghost icon small" aria-label="Fermer" onClick={onClose}><X size={16} aria-hidden /></button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/** Confirmation of a destructive action: the safe choice has the focus. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Annuler', onConfirm, onCancel, testId }: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      {...(testId ? { testId } : {})}
      footer={(
        <>
          <button type="button" onClick={onCancel} autoFocus>{cancelLabel}</button>
          <button type="button" className="danger solid" onClick={onConfirm}>{confirmLabel}</button>
        </>
      )}
    >
      {children}
    </Dialog>
  );
}
