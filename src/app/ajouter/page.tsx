import type { Metadata } from 'next';
import { getServerMessages } from '@/i18n/server';
import { AddSetRoot } from '../ClientRoot';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getServerMessages()).app.title.addSet };
}

export default function Page() {
  return <AddSetRoot />;
}
