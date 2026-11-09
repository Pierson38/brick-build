import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { THEME_BOOT_SCRIPT } from '@/components/ui/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Brick Lab Local', template: '%s — Brick Lab' },
  description: 'Reconstruction virtuelle locale de modèles LDraw. Non affilié à LEGO.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set by the boot script before hydration (stored light/dark choice)
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
