import type { Metadata } from 'next';
import { AddSetRoot } from '../ClientRoot';

export const metadata: Metadata = { title: 'Ajouter un set' };

export default function Page() {
  return <AddSetRoot />;
}
