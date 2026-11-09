'use client';

import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/feedback';

// WebGL and PDF.js are browser-only: every view is rendered on the client.
const loading = () => <div className="route-loading"><Loading>Chargement…</Loading></div>;
const BrickLabApp = dynamic(() => import('@/components/BrickLabApp'), { ssr: false, loading });
const CollectionView = dynamic(() => import('@/components/library/CollectionView'), { ssr: false, loading });
const SetDetail = dynamic(() => import('@/components/library/SetDetail'), { ssr: false, loading });
const AddSetPage = dynamic(() => import('@/components/library/add/AddSetPage'), { ssr: false, loading });
const LibraryAtelier = dynamic(() => import('@/components/library/LibraryAtelier'), { ssr: false, loading });

export function ClientRoot() {
  return <CollectionView />;
}

/** P5/P6 atelier without the collection: files imported by hand, progress in this browser. */
export function StandaloneAtelier() {
  return <BrickLabApp crumbs={[{ label: 'Ma collection', href: '/', testId: 'back-to-collection' }, { label: 'Atelier sans collection' }]} />;
}

export function SetDetailRoot({ setId }: { setId: string }) {
  return <SetDetail setId={setId} />;
}

/** P8: search by set number, quick local import, compatibility sheet, one-step confirmation. */
export function AddSetRoot() {
  return <AddSetPage />;
}

export function LibraryAtelierRoot({ buildId }: { buildId: string }) {
  return <LibraryAtelier key={buildId} buildId={buildId} />;
}
