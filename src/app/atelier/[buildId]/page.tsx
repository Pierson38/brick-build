import type { Metadata } from 'next';
import { getServerMessages } from '@/i18n/server';
import { LibraryAtelierRoot } from '../../ClientRoot';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getServerMessages()).app.title.atelier };
}

export default async function Page({ params }: { params: Promise<{ buildId: string }> }) {
  return <LibraryAtelierRoot buildId={(await params).buildId} />;
}
