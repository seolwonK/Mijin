import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavDepthTracker from '@/components/useNavDepthTracker';

export const metadata: Metadata = {
  title: '전기아저씨 — 전기 출동 서비스',
  description: '전기아저씨가 전기 고장 접수부터 가까운 출동 업체 연결까지 빠르게 도와드립니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 노치/홈바 영역까지 사용 — 하단 고정 버튼은 safe-area-inset 패딩으로 보호
  viewportFit: 'cover',
  // brand-50(인디고 틴트 화이트, G2 팔레트) — 전면 화이트 베이스 위에 얹히는 실제 헤더 톤과
  // 부딪히지 않으면서도, 순수 '#ffffff' 추측값 대신 확정 팔레트에서 값을 가져온다.
  themeColor: '#f2f5ff',
  // 라이트 전용 선언 — UA 강제 다크 변환(안드로이드 자동 다크 등) 옵트아웃.
  // globals.css 의 `:root { color-scheme: only light }` 와 쌍.
  colorScheme: 'only light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 폭 제약은 라우트 그룹별 레이아웃에서 지정한다.
  // (mobile) 그룹: 고객·업체용 모바일 프레임 / admin: 데스크톱 대응 넓은 프레임
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-surface text-fg">
        {children}
        <NavDepthTracker />
      </body>
    </html>
  );
}
