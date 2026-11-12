'use client';

import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/feedback';
import { useT } from '@/i18n/I18nProvider';

// WebGL and PDF.js are browser-only: every view is rendered on the client.
function RouteLoading() {
  const t = useT();
  return <div className="route-loading"><Loading>{t.common.loading}</Loading></div>;
}
const loading = () => <RouteLoading />;
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
  const t = useT();
  return <BrickLabApp crumbs={[{ label: t.common.myCollection, href: '/', testId: 'back-to-collection' }, { label: t.app.standaloneAtelierCrumb }]} />;
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
