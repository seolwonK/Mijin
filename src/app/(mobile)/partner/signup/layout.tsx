import type { Metadata } from 'next';

// page.tsx 가 클라이언트 컴포넌트라 metadata 를 여기서 낸다. 파트너 모집 페이지라 색인을 허용한다.
export const metadata: Metadata = {
  title: '출동 업체 가입 신청',
  description: '전기아저씨 출동 업체 가입 신청. 사업자 정보로 신청하고 승인 후 지역 접수를 배정받습니다.',
  alternates: { canonical: '/partner/signup' },
};

export default function PartnerSignupLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
