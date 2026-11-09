import type { Metadata } from 'next';
import { StandaloneAtelier } from '../ClientRoot';

export const metadata: Metadata = { title: 'Atelier sans collection' };

export default function Page() {
  return <StandaloneAtelier />;
}
