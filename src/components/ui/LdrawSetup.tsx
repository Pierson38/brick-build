'use client';

import { Check, Copy, ExternalLink, PackageOpen, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

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
      .then((b) => live && setProblem(b.configured ? null : b.reason ?? 'Bibliothèque LDraw non configurée.'), () => live && setProblem('Serveur local injoignable.'));
    return () => {
      live = false;
    };
  }, [round]);
  return { problem, retry: () => setRound((r) => r + 1) };
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="command">
      <code>{command}</code>
      <button type="button" className="ghost icon small" aria-label="Copier la commande" data-tip={copied ? 'Copiée' : 'Copier'}
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
  return (
    <section className={compact ? 'ldraw-setup compact' : 'ldraw-setup'} data-testid="ldraw-setup" aria-labelledby="ldraw-setup-title">
      <span className="empty-icon" aria-hidden><PackageOpen size={20} /></span>
      <h2 id="ldraw-setup-title">Bibliothèque de pièces introuvable</h2>
      <p className="muted">
        Le rendu 3D a besoin de la bibliothèque de pièces LDraw, installée une fois sur ce Mac. Ce n’est pas ton fichier qui est en cause.
        {' '}<span className="error">Raison : {reason}</span>
      </p>
      <ol className="setup-steps">
        <li>
          Télécharge <a href="https://library.ldraw.org/library/updates/complete.zip" target="_blank" rel="noreferrer noopener">complete.zip <ExternalLink size={12} aria-hidden /></a> (bibliothèque officielle, CC BY 4.0) et décompresse-le dans <code>~/Documents/brick-lab-data/</code>.
        </li>
        <li>À la racine du projet, crée <code>.env.local</code> puis relance <code>npm run dev</code> :<CopyCommand command={ENV_COMMAND} /></li>
        <li>Vérifie l’installation :<CopyCommand command={CHECK_COMMAND} /></li>
      </ol>
      {onRetry && <button type="button" className="primary" onClick={onRetry}><RefreshCw size={16} aria-hidden /> Réessayer</button>}
    </section>
  );
}
