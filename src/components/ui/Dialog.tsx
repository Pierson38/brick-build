'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/i18n/I18nProvider';

/**
 * Modal dialog on the native <dialog>: focus trapped and Escape handled by the browser (same in
 * Chromium and WebKit). Mounted only while open (a closed dialog leaves nothing in the page) and
 * the focus goes back to what had it before. `onClose` runs on Escape, on the close button and on
 * a click on the backdrop.
 */
export function Dialog(props: DialogProps) {
  return props.open ? <OpenDialog {...props} /> : null;
}

interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}

function OpenDialog({ title, onClose, children, footer, wide = false, testId }: DialogProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog-modal wide' : 'dialog-modal'}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <span className="spacer" />
        <button type="button" className="ghost icon small" aria-label={t.common.close} onClick={onClose}><X size={16} aria-hidden /></button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-foot">{footer}</div>}
    </dialog>
  );
}

/** Confirmation of a destructive action: the safe choice has the focus. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel, onConfirm, onCancel, testId, confirmTestId }: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
  confirmTestId?: string;
}) {
  const t = useT();
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      {...(testId ? { testId } : {})}
      footer={(
        <>
          <button type="button" onClick={onCancel} autoFocus>{cancelLabel ?? t.common.cancel}</button>
          <button type="button" className="danger solid" onClick={onConfirm} data-testid={confirmTestId}>{confirmLabel}</button>
        </>
      )}
    >
      {children}
    </Dialog>
  );
}
