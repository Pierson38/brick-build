import type { Metadata } from 'next';
import { ClientRoot } from './ClientRoot';

export const metadata: Metadata = { title: 'Ma collection' };

export default function Page() {
  return <ClientRoot />;
}
