'use client';

import { Check, Copy, ExternalLink, PackageOpen, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import { msgs } from '@/i18n/runtime';

const ENV_COMMAND = `printf 'LDRAW_LIBRARY_DIR=%s/Documents/brick-lab-data/ldraw\\n' "$HOME" > .env.local`;
const CHECK_COMMAND = 'npm run check:ldraw';

/** State of the local LDraw parts library, as the local server sees it (null = configured). */
export function useLdrawProblem(): { problem: string | null | undefined; retry: () => void } {
  const [problem, setProblem] = useState<string | null | undefined>(undefined);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    fetch('/api/ldraw-status', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ configured: boolean; reason?: string }>)
      .then((b) => live && setProblem(b.configured ? null : b.reason ?? msgs().workshop.ldrawSetup.notConfigured), () => live && setProblem(msgs().workshop.ldrawSetup.serverUnreachable));
    return () => {
      live = false;
    };
  }, [round]);
  return { problem, retry: () => setRound((r) => r + 1) };
}

function CopyCommand({ command }: { command: string }) {
  const tr = useT().workshop.ldrawSetup;
  const [copied, setCopied] = useState(false);
  return (
    <div className="command">
      <code>{command}</code>
      <button type="button" className="ghost icon small" aria-label={tr.copyCommand} data-tip={copied ? tr.copied : tr.copy}
        onClick={() => void navigator.clipboard?.writeText(command).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
    </div>
  );
}

/**
 * What to do when the LDraw parts library is missing or misconfigured: the exact reason, the
 * three installation steps of the README, and « Réessayer ». The download link only opens the
 * official page in the browser; nothing is fetched by the application.
 */
export function LdrawSetup({ reason, onRetry, compact = false }: { reason: string; onRetry?: () => void; compact?: boolean }) {
  const tr = useT().workshop.ldrawSetup;
  return (
    <section className={compact ? 'ldraw-setup compact' : 'ldraw-setup'} data-testid="ldraw-setup" aria-labelledby="ldraw-setup-title">
      <span className="empty-icon" aria-hidden><PackageOpen size={20} /></span>
      <h2 id="ldraw-setup-title">{tr.title}</h2>
      <p className="muted">
        {tr.intro}
        {' '}<span className="error">{tr.reason(reason)}</span>
      </p>
      <ol className="setup-steps">
        <li>
          {tr.downloadBefore}<a href="https://library.ldraw.org/library/updates/complete.zip" target="_blank" rel="noreferrer noopener">complete.zip <ExternalLink size={12} aria-hidden /></a>{tr.downloadAfter}<code>~/Documents/brick-lab-data/</code>{tr.downloadEnd}
        </li>
        <li>{tr.envBefore}<code>.env.local</code>{tr.envMiddle}<code>npm run dev</code>{tr.envAfter}<CopyCommand command={ENV_COMMAND} /></li>
        <li>{tr.check}<CopyCommand command={CHECK_COMMAND} /></li>
      </ol>
      {onRetry && <button type="button" className="primary" onClick={onRetry}><RefreshCw size={16} aria-hidden /> {tr.retry}</button>}
    </section>
  );
}
