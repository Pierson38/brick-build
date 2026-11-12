'use client';

import { useEffect, useState } from 'react';

/**
 * Light / dark theme: `system` follows prefers-color-scheme; `light` and `dark` force it through
 * <html data-theme>. A browser preference only (like the width of the side panel), never sent to
 * the library. The same key is read by the inline script of layout.tsx before the first paint.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'brick-lab:theme';
export const THEME_ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export const parseTheme = (raw: unknown): ThemeChoice => (raw === 'light' || raw === 'dark' ? raw : 'system');
export const nextTheme = (t: ThemeChoice): ThemeChoice => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]!;

/** Inline script of layout.tsx: applies the stored choice before React renders (no flash). */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

function applyTheme(t: ThemeChoice) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => {
    try {
      setChoice(parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      // storage unavailable: the system theme applies
    }
  }, []);
  const choose = (t: ThemeChoice) => {
    setChoice(t);
    applyTheme(t);
    try {
      if (t === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // private browsing: the choice still applies to this page
    }
  };
  return { choice, choose };
}

/**
 * Current values of CSS custom properties (design tokens), read again when the theme changes
 * (manual choice or system setting). For what CSS cannot reach: the 3D scene helpers.
 */
export function useTokenValues<const K extends readonly string[]>(names: K, fallback: readonly string[]): readonly string[] {
  const [values, setValues] = useState<readonly string[]>(fallback);
  const key = names.join(',');
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next = names.map((n, i) => style.getPropertyValue(n).trim() || fallback[i]!);
      setValues((cur) => (cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', read);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', read);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return values;
}
