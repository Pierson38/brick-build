'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

// WebGL and PDF.js are browser-only: every view is rendered on the client.
const loading = () => <p style={{ padding: 24 }}>Chargement…</p>;
const BrickLabApp = dynamic(() => import('@/components/BrickLabApp'), { ssr: false, loading });
const CollectionView = dynamic(() => import('@/components/library/CollectionView'), { ssr: false, loading });
const SetDetail = dynamic(() => import('@/components/library/SetDetail'), { ssr: false, loading });
const LibraryAtelier = dynamic(() => import('@/components/library/LibraryAtelier'), { ssr: false, loading });

export function ClientRoot() {
  return <CollectionView />;
}

/** P5/P6 atelier without the collection: files imported by hand, progress in this browser. */
export function StandaloneAtelier() {
  return <BrickLabApp nav={<><Link href="/" className="button secondary small">← Ma collection</Link><strong>Atelier sans collection</strong></>} />;
}

export function SetDetailRoot({ setId }: { setId: string }) {
  return <SetDetail setId={setId} />;
}

export function LibraryAtelierRoot({ buildId }: { buildId: string }) {
  return <LibraryAtelier key={buildId} buildId={buildId} />;
}
