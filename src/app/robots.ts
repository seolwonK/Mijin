import type { MetadataRoute } from 'next';
import { COMPANY } from '@/lib/company';

// /robots.txt — Next 메타데이터 파일 규약(app/robots.ts).
// Disallow 는 크롤 예산 낭비 방지용으로 "공개 콘텐츠가 아예 아닌" 경로만 건다.
// /login·/partner/login·/tech/login 은 푸터·홈에서 링크되므로 여기서 막지 않는다 — 막으면 Google 이
// 각 페이지의 noindex 메타를 읽지 못해 "설명 없는 URL" 로 색인할 수 있다. 그 페이지들은 metadata.robots
// noindex 로만 뺀다(로그인 page.tsx / admin layout.tsx).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api',
        // 로그인 뒤에서만 쓰는 업체·기사 포털 화면(미인증 시 307 → 로그인). 가입 신청(/partner/signup,
        // /tech/signup)은 모집 페이지라 열어 둔다.
        '/partner/jobs',
        '/partner/history',
        '/partner/profile',
        '/partner/commissions',
        '/partner/eggs',
        '/tech/jobs',
        '/tech/history',
        '/tech/profile',
        '/tech/commissions',
        '/tech/eggs',
        '/tech/contract',
        // 접수자 본인용 화면 — 토큰·ID 로만 도달한다.
        '/survey',
        '/request/complete',
      ],
    },
    // 어느 호스트(CloudType 원본 포함)에서 서빙되든 정식 도메인의 사이트맵만 가리킨다.
    sitemap: `${COMPANY.siteUrl}/sitemap.xml`,
  };
}
