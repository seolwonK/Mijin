import type { Metadata } from 'next';

// page.tsx 가 클라이언트 컴포넌트라 metadata 를 여기서 낸다.
// canonical 을 쿼리 없는 경로로 고정 — 홈 증상 버튼의 ?symptom=* 7종은 같은 HTML 이므로 이 URL 로 합친다.
export const metadata: Metadata = {
  title: '전기 고장 접수 · 무료 접수, 가까운 출동 업체 연결',
  description:
    '전기 고장을 무료로 접수하면 가까운 승인 출동 업체·전기기사를 연결해 드립니다. 정전·누전·콘센트·조명·두꺼비집(차단기)·가전 고장 접수.',
  alternates: { canonical: '/request/new' },
};

export default function RequestNewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
