import PortalHistory from '@/components/PortalHistory';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.slice(0, 100) : '';
  return <PortalHistory key={query} scope="partner" initialQuery={query} />;
}
