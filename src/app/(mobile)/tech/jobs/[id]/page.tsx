'use client';
import { use } from 'react';
import PortalJobDetail from '@/components/PortalJobDetail';
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PortalJobDetail id={id} scope="tech" />;
}
