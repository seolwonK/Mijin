import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { getWebPageGraph } from '@/lib/schema';
import { PAGE_UPDATED } from '@/lib/pageDates';

// page.tsx 가 클라이언트 컴포넌트라 metadata 를 여기서 낸다. 브랜드 내비게이션 검색("전기아저씨 접수 조회")
// 대응 페이지이므로 색인을 허용하고 사이트맵에도 넣는다(2026-09-14 감사 확정).
export const metadata: Metadata = {
  title: '접수 내역 조회 · 전화번호로 진행 상황 확인',
  description: '접수 시 등록한 전화번호로 접수 내역과 배정·출동 진행 상황을 확인합니다.',
  alternates: { canonical: '/lookup' },
};

export default function LookupLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <JsonLd data={getWebPageGraph({ path: '/lookup', name: '접수 내역 조회', description: String(metadata.description), dateModified: PAGE_UPDATED.lookup })} />
      {children}
    </>
  );
}
