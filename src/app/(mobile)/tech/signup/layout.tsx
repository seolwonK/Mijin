import type { Metadata } from 'next';

// page.tsx 가 클라이언트 컴포넌트라 metadata 를 여기서 낸다. 전기기사 모집 페이지라 색인을 허용한다.
export const metadata: Metadata = {
  title: '전기기사 가입 신청',
  description: '전기아저씨 전기기사 가입 신청. 휴대폰 본인인증으로 가입하고 근로확인서 서명 후 출동 배정을 받습니다.',
  alternates: { canonical: '/tech/signup' },
};

export default function TechSignupLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
