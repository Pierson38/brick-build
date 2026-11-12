import type { Metadata } from 'next';
import { getServerMessages } from '@/i18n/server';
import { StandaloneAtelier } from '../ClientRoot';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getServerMessages()).app.title.standaloneAtelier };
}

export default function Page() {
  return <StandaloneAtelier />;
}
