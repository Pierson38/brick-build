import type { Metadata } from 'next';
import { getServerMessages } from '@/i18n/server';
import { ClientRoot } from './ClientRoot';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getServerMessages()).app.title.collection };
}

export default function Page() {
  return <ClientRoot />;
}
