import type { Metadata } from 'next';
import { LibraryAtelierRoot } from '../../ClientRoot';

export const metadata: Metadata = { title: 'Atelier' };

export default async function Page({ params }: { params: Promise<{ buildId: string }> }) {
  return <LibraryAtelierRoot buildId={(await params).buildId} />;
}
