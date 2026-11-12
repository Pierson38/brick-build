import type { Metadata } from 'next';
import { getServerMessages } from '@/i18n/server';
import { SetDetailRoot } from '../../ClientRoot';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getServerMessages()).app.title.setDetail };
}

export default async function Page({ params }: { params: Promise<{ setId: string }> }) {
  return <SetDetailRoot setId={(await params).setId} />;
}
