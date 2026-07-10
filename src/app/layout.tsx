import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavDepthTracker from '@/components/useNavDepthTracker';

export const metadata: Metadata = {
  title: '전기 출동 서비스',
  description: '전기 고장 접수 및 출동 업체 매칭 서비스',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 노치/홈바 영역까지 사용 — 하단 고정 버튼은 safe-area-inset 패딩으로 보호
  viewportFit: 'cover',
  themeColor: '#ffffff',
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
