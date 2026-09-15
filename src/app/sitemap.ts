import type { MetadataRoute } from 'next';
import { COMPANY } from '@/lib/company';
import { PAGE_UPDATED } from '@/lib/pageDates';
import { GUIDES } from '@/lib/guides';
import { SEONGNAM_GU } from '@/lib/seongnamDistricts';

// lastmod 는 빌드 시각(new Date())이 아니라 페이지 카피의 실제 변경일(src/lib/pageDates.ts)을 쓴다 —
// Google 은 lastmod 를 재크롤 우선순위 신호로 쓰는데 매 배포마다 바뀌는 값은 거짓 신호가 되어 오히려 무시당한다.

// 공개 색인 대상 7개만 등재한다. 로그인·포털·관리자·설문·접수완료 화면과 /request/new?symptom=*
// 쿼리 변형은 넣지 않는다(각각 noindex 또는 canonical 로 처리).
// changeFrequency·priority 는 Google/Bing 이 무시한다고 공식 명시해 넣지 않는다.
export default function sitemap(): MetadataRoute.Sitemap {
  // 요청 host 에서 절대 유추하지 않는다 — CloudType 원본 호스트로 서빙돼도 정식 도메인만 나열.
  const base = COMPANY.siteUrl;
  return [
    { url: `${base}/`, lastModified: PAGE_UPDATED.home },
    { url: `${base}/request/new`, lastModified: PAGE_UPDATED.requestNew },
    { url: `${base}/about`, lastModified: PAGE_UPDATED.about },
    { url: `${base}/support`, lastModified: PAGE_UPDATED.support },
    { url: `${base}/lookup`, lastModified: PAGE_UPDATED.lookup },
    { url: `${base}/areas/seongnam`, lastModified: PAGE_UPDATED.areaSeongnam },
    ...SEONGNAM_GU.map((g) => ({ url: `${base}/areas/seongnam/${g.slug}`, lastModified: g.updated })),
    { url: `${base}/guide`, lastModified: PAGE_UPDATED.guideIndex },
    ...GUIDES.map((g) => ({ url: `${base}/guide/${g.slug}`, lastModified: g.updated })),
    { url: `${base}/terms`, lastModified: PAGE_UPDATED.terms },
    { url: `${base}/privacy`, lastModified: PAGE_UPDATED.privacy },
  ];
}
