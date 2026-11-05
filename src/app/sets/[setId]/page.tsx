import { SetDetailRoot } from '../../ClientRoot';

export default async function Page({ params }: { params: Promise<{ setId: string }> }) {
  return <SetDetailRoot setId={(await params).setId} />;
}
