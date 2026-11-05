import { LibraryAtelierRoot } from '../../ClientRoot';

export default async function Page({ params }: { params: Promise<{ buildId: string }> }) {
  return <LibraryAtelierRoot buildId={(await params).buildId} />;
}
