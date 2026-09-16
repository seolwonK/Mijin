import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavDepthTracker from '@/components/useNavDepthTracker';
import JsonLd from '@/components/JsonLd';
import Analytics from '@/components/Analytics';
import { COMPANY } from '@/lib/company';
import { getSiteGraph } from '@/lib/schema';

const SITE_TITLE = '전기아저씨 — 전기 수리 출동 접수, 누전·두꺼비집·정전·콘센트';
const SITE_DESCRIPTION =
  '정전·누전·콘센트·조명·두꺼비집 고장을 무료로 접수하면 전기아저씨가 가까운 승인 출동 업체·전기기사를 연결합니다. 전국 시/군/구 접수, 수리비는 현장에서 안내.';

export const metadata: Metadata = {
  // canonical·og:image 같은 URL 필드를 상대경로로 쓰기 위한 기준. 어느 호스트(CloudType 원본 포함)에서
  // 서빙되든 정식 도메인으로 고정돼, 각 페이지의 alternates.canonical 이 이중 도메인 노출을 해소한다.
  metadataBase: new URL(COMPANY.siteUrl),
  title: {
    default: SITE_TITLE,
    // 하위 페이지가 title 을 지정하면 "페이지명 — 전기아저씨" 로 붙는다. 페이지 쪽 title 에 브랜드명을 넣지 말 것.
    template: `%s — ${COMPANY.name}`,
  },
  description: SITE_DESCRIPTION,
  // og:title / og:description 은 일부러 비운다 — 비워 두면 Next 가 각 페이지의 title·description 을 채운다.
  // 여기서 지정하면 하위 페이지 전부가 그 값을 상속해 카카오톡 미리보기가 모두 홈 제목이 된다.
  // 하위 페이지가 openGraph 를 직접 지정하면 images 까지 통째로 대체되니 그때는 images 도 다시 넣을 것.
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: COMPANY.name,
    images: [
      {
        url: '/brand/og-default.png',
        width: 1200,
        height: 630,
        alt: '전기아저씨 — 전기가 고장나면, 아저씨가 갑니다',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  // 네이버 서치어드바이저 소유 확인(HTML 태그 방식). public/naver*.html 파일 방식과 병행한다 —
  // 둘 중 하나만 살아 있어도 소유 확인이 유지된다. 값은 서치어드바이저 사이트 등록 시 발급된 토큰.
  verification: { other: { 'naver-site-verification': 'd0f5639eea329196053917c35a4650a8d32f4c52' } },
  // 스니펫·이미지 미리보기 길이 제한을 풀어 둔다(AI Overviews·Discover 노출용). 로그인·관리자 화면은 각자 noindex 로 덮어쓴다.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
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
        {/* RSS 자동 발견. metadata.alternates 로 넣으면 각 페이지의 alternates.canonical 이 객체째 덮어써
            대부분 페이지에서 사라지므로, React 가 <head> 로 끌어올리는 link 요소로 직접 렌더한다. */}
        <link rel="alternate" type="application/rss+xml" title="전기아저씨 전기 상식" href="/rss.xml" />
        {/* 사이트 공통 구조화 데이터(Organization·WebSite·Service) — 모델링 원칙은 src/lib/schema.ts */}
        <JsonLd data={getSiteGraph()} />
        {children}
        <NavDepthTracker />
        <Analytics />
      </body>
    </html>
  );
}
