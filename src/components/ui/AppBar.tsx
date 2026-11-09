'use client';

import Link from 'next/link';
import { Blocks, ChevronRight, Monitor, Moon, Sun } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { nextTheme, THEME_LABEL, useThemeChoice, type ThemeChoice } from './theme';

const THEME_ICON: Record<ThemeChoice, ReactNode> = { system: <Monitor size={16} aria-hidden />, light: <Sun size={16} aria-hidden />, dark: <Moon size={16} aria-hidden /> };

/** Light / dark / system switch (browser preference). */
export function ThemeToggle() {
  const { choice, choose } = useThemeChoice();
  const next = nextTheme(choice);
  const label = `Thème : ${THEME_LABEL[choice]} (passer à ${THEME_LABEL[next]})`;
  return (
    <button type="button" className="ghost icon" aria-label={label} data-tip={label} data-tip-side="bottom" data-testid="theme-toggle" onClick={() => choose(next)}>
      {THEME_ICON[choice]}
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
 * page's own tools (`children`), and the theme switch.
 */
export function AppBar({ crumbs = [], children }: { crumbs?: readonly Crumb[]; children?: ReactNode }) {
  return (
    <header className="appbar topbar">
      <Link href="/" className="brand" aria-label="Brick Lab Local — Ma collection">
        <span className="brand-mark" aria-hidden><Blocks size={14} /></span>
        <span className="brand-name">Brick Lab</span>
      </Link>
      {crumbs.length > 0 && (
        <nav className="crumbs" aria-label="Fil d’Ariane">
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
      <span className="appbar-tools"><ThemeToggle /></span>
    </header>
  );
}
