import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextTheme, parseTheme, THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from '../../src/components/ui/theme';

/**
 * Design tokens of the UI redesign (REFONTE): one source of truth (src/app/tokens.css), the dark
 * theme identical for the system setting and the manual choice, WCAG AA contrasts, and no colour
 * written outside the tokens in the global stylesheet.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const TOKENS = read('src/app/tokens.css');
const GLOBALS = read('src/app/globals.css');

/** Custom properties declared in the first block that matches `selector` (after `from`). */
function block(selector: string, from = 0): Map<string, string> {
  const start = TOKENS.indexOf(selector, from);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = TOKENS.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < TOKENS.length; end++) {
    if (TOKENS[end] === '{') depth++;
    if (TOKENS[end] === '}' && --depth === 0) break;
  }
  const body = TOKENS.slice(open + 1, end);
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const light = new Map([...block(':root {'), ...block(':root {', TOKENS.indexOf('couleurs : thème clair'))]);
const darkSystem = block(':root:not([data-theme="light"])');
const darkManual = block(':root[data-theme="dark"]');

const lum = (hex: string) => {
  const c = hex.replace('#', '').match(/../g)!.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('design tokens', () => {
  it('the dark theme is the same for the system setting and the manual choice', () => {
    expect(darkSystem.size).toBeGreaterThan(25);
    expect(Object.fromEntries(darkManual)).toEqual(Object.fromEntries(darkSystem));
  });

  it('every colour redefined by the dark theme exists in the light theme', () => {
    for (const name of darkSystem.keys()) expect(light.has(name), name).toBe(true);
  });

  for (const [theme, t] of [['clair', light], ['sombre', new Map([...light, ...darkSystem])]] as const) {
    it(`WCAG AA contrasts — thème ${theme}`, () => {
      const v = (n: string) => t.get(n)!;
      const text: [string, string][] = [
        ['--color-ink', '--color-bg'], ['--color-ink', '--color-surface'], ['--color-ink-2', '--color-bg'], ['--color-ink-2', '--color-surface'],
        ['--color-ink-3', '--color-surface'], ['--color-ink-3', '--color-surface-2'], ['--color-accent-ink', '--color-accent'], ['--color-accent', '--color-surface'],
        ['--color-ok', '--color-ok-soft'], ['--color-warn', '--color-warn-soft'], ['--color-danger', '--color-danger-soft'], ['--color-info', '--color-info-soft'],
        ['--color-danger', '--color-surface'], ['--color-accent', '--color-accent-soft'],
      ];
      for (const [fg, bg] of text) expect(contrast(v(fg), v(bg)), `${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
      // non-text: control borders and the focus ring (WCAG 1.4.11)
      for (const [fg, bg] of [['--color-border-control', '--color-surface'], ['--color-focus', '--color-bg'], ['--color-focus', '--color-surface']]) {
        expect(contrast(v(fg!), v(bg!)), `${fg} / ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('reduced motion sets every duration to 0', () => {
    const reduced = block(':root {', TOKENS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(Object.fromEntries(reduced)).toEqual({ '--duration-fast': '0ms', '--duration': '0ms', '--duration-slow': '0ms' });
  });

  it('globals.css writes no colour, radius or duration of its own', () => {
    const css = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css.match(/\brgba?\(/g) ?? []).toEqual([]);
    expect(css.match(/border-radius:\s*\d+px/g)?.filter((r) => r !== 'border-radius: 2px') ?? []).toEqual([]);
    // durations come from --duration-*, except the two looping loaders (spinner, skeleton shimmer)
    expect(css.match(/(?<![\d.])\d+(\.\d+)?m?s\s+(ease|linear|cubic)/g)?.filter((d) => !/^(900ms|1\.4s) /.test(d)) ?? []).toEqual([]);
  });
});

describe('theme choice', () => {
  it('parses the stored value, defaults to the system theme', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('sepia')).toBe('system');
  });
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
  it('the boot script reads the same key and only applies light or dark', () => {
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    const root = { dataset: {} as Record<string, string> };
    for (const [stored, expected] of [['dark', 'dark'], ['light', 'light'], ['system', undefined], [null, undefined]] as const) {
      root.dataset = {};
      new Function('localStorage', 'document', THEME_BOOT_SCRIPT)({ getItem: () => stored }, { documentElement: root });
      expect(root.dataset.theme).toBe(expected);
    }
  });
});
