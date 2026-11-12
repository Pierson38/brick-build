'use client';

import Link from 'next/link';
import { Blocks, ChevronRight, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useI18n, useT } from '@/i18n/I18nProvider';
import { LOCALE_NAME } from '@/i18n/locale';
import { nextTheme, useThemeChoice, type ThemeChoice } from './theme';

const THEME_ICON: Record<ThemeChoice, ReactNode> = { system: <Monitor size={16} aria-hidden />, light: <Sun size={16} aria-hidden />, dark: <Moon size={16} aria-hidden /> };

/** Light / dark / system switch (browser preference). */
export function ThemeToggle() {
  const t = useT();
  const { choice, choose } = useThemeChoice();
  const next = nextTheme(choice);
  const label = t.app.theme.toggle(t.app.theme[choice], t.app.theme[next]);
  return (
    <button type="button" className="ghost icon" aria-label={label} data-tip={label} data-tip-side="bottom" data-tip-align="end" data-testid="theme-toggle" onClick={() => choose(next)}>
      {THEME_ICON[choice]}
    </button>
  );
}

/** French / English switch: stored in a same-origin cookie, applied at once. */
export function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();
  const next = locale === 'fr' ? 'en' : 'fr';
  const label = t.app.language.toggle(LOCALE_NAME[locale], LOCALE_NAME[next]);
  return (
    <button type="button" className="ghost icon locale-toggle" aria-label={label} data-tip={label} data-tip-side="bottom" data-tip-align="end" data-testid="locale-toggle" lang={locale} onClick={() => setLocale(next)}>
      <Languages size={16} aria-hidden /><span className="locale-code">{locale.toUpperCase()}</span>
    </button>
  );
}

export interface Crumb {
  readonly label: ReactNode;
  readonly href?: string;
  readonly testId?: string;
  /** Accessible name / tooltip when the label is shortened. */
  readonly title?: string;
}

/**
 * Bar at the top of every page: the brand (link to the collection), the breadcrumb, then the
 * page's own tools (`children`), and the language and theme switches.
 */
export function AppBar({ crumbs = [], children }: { crumbs?: readonly Crumb[]; children?: ReactNode }) {
  const t = useT();
  return (
    <header className="appbar topbar">
      <Link href="/" className="brand" aria-label={t.app.brandLabel}>
        <span className="brand-mark" aria-hidden><Blocks size={14} /></span>
        <span className="brand-name">Brick Lab</span>
      </Link>
      {crumbs.length > 0 && (
        <nav className="crumbs" aria-label={t.app.breadcrumb}>
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              <ChevronRight size={14} className="sep" aria-hidden />
              {c.href
                ? <Link href={c.href} data-testid={c.testId} title={c.title}>{c.label}</Link>
                : <span className={i === crumbs.length - 1 ? 'current' : undefined} title={c.title} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
            </Fragment>
          ))}
        </nav>
      )}
      <span className="spacer" />
      {children}
      <span className="appbar-tools"><LocaleToggle /><ThemeToggle /></span>
    </header>
  );
}
