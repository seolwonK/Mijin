// 공개 페이지 카피가 마지막으로 "의미 있게" 바뀐 날짜 — 사이트맵 lastmod, WebPage.dateModified,
// 화면의 "최종 수정일" 표기가 전부 이 값을 읽는다. 빌드 시각을 쓰지 않는 이유는 sitemap.ts 참조.
// 페이지 카피를 고칠 때 함께 갱신할 것(약관·방침은 COMPANY 시행일과 연동).
import { COMPANY } from '@/lib/company';

export const PAGE_UPDATED = {
  home: '2026-09-16',
  requestNew: '2026-08-23',
  about: '2026-09-15',
  support: '2026-09-15',
  lookup: '2026-08-14',
  terms: COMPANY.termsEffectiveDate,
  privacy: COMPANY.privacyEffectiveDate,
  guideIndex: '2026-09-15',
  areaSeongnam: '2026-09-16',
  areasIndex: '2026-09-16',
} as const;

/** '2026-09-15' → '2026년 9월 15일' */
export function formatKoreanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
