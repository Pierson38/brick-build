import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { THEME_BOOT_SCRIPT } from '@/components/ui/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import { CATALOGS } from '@/i18n/catalogs';
import { getServerLocale } from '@/i18n/server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = CATALOGS[await getServerLocale()];
  return {
    title: { default: t.common.appName, template: '%s — Brick Lab' },
    description: t.app.metaDescription,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Language: explicit choice (cookie), else the browser's Accept-Language (see src/i18n/locale.ts)
  const locale = await getServerLocale();
  return (
    // data-theme is set by the boot script before hydration (stored light/dark choice)
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body><I18nProvider initialLocale={locale}>{children}</I18nProvider></body>
    </html>
  );
}
