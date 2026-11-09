import type { Metadata } from 'next';
import { SetDetailRoot } from '../../ClientRoot';

export const metadata: Metadata = { title: 'Détail du set' };

export default async function Page({ params }: { params: Promise<{ setId: string }> }) {
  return <SetDetailRoot setId={(await params).setId} />;
}
