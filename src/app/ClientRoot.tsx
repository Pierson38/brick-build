'use client';

import dynamic from 'next/dynamic';

// WebGL and PDF.js are browser-only.
const BrickLabApp = dynamic(() => import('@/components/BrickLabApp'), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Chargement…</p>,
});

export function ClientRoot() {
  return <BrickLabApp />;
}
