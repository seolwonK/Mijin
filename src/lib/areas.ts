// 지역 출동 안내 레지스트리 — /areas(목록)·사이트맵·지역 페이지 브레드크럼이 읽는다.
// 분리 원칙(사용자 지시 2026-10-29, 2026-11-23 재확인): 사이트 본편(홈·소개·가이드·푸터·접수)은 "전국" 서비스로만 보이고,
// 지역 페이지(/areas/**)는 검색으로만 들어오는 별도 섹션이다. 본편에서 /areas 로 가는 링크나 특정 지역명을 넣지 않는다
// (src/lib/__tests__/areasIsolation.test.ts 가 막는다). 지역 페이지끼리의 링크·사이트맵·llms.txt 는 유지한다.
// 새 지역은 src/lib/regionPages.ts 의 REGION_PAGES 에 항목을 추가한다(성남만 구 하위 페이지가 있어 별도 폴더).
import { SEONGNAM_GU } from '@/lib/seongnamDistricts';
import { REGION_PAGES } from '@/lib/regionPages';

export type FocusArea = {
  slug: string;
  name: string; // 성남시
  sido: string; // 경기도
  label: string; // 목록 카드 제목
  summary: string; // 목록 카드 설명
  updated: string;
  children: readonly { slug: string; gu: string; note: string }[];
};

/** /areas 목록의 권역 묶음 — 시/도로 나눈다. */
export const AREA_ZONES = [
  { id: 'capital', label: '서울·경기', sidos: ['서울특별시', '경기도', '경기도·서울특별시'] },
  { id: 'honam', label: '광주·전남·전북', sidos: ['전남광주통합특별시', '전북특별자치도'] },
] as const;

export const FOCUS_AREAS: readonly FocusArea[] = [
  {
    slug: 'seongnam',
    name: '성남시',
    sido: '경기도',
    label: '성남 전기 수리 출동',
    summary: '분당·판교·위례·수정·중원 — 구별 동 목록과 주거 형태별 전기 환경, 자주 접수되는 고장을 안내합니다.',
    updated: '2026-09-15',
    children: SEONGNAM_GU.map((g) => ({ slug: g.slug, gu: g.gu, note: g.note })),
  },
  ...REGION_PAGES.map((r) => ({
    slug: r.slug,
    name: r.name,
    sido: r.sido,
    label: `${r.shortName} 전기 수리 출동`,
    summary: r.note,
    updated: r.updated,
    children: [],
  })),
] as const;

export const AREAS_PATH = '/areas';

// 파트너 집계 줄 노출 하한 — 이 값 미만이면 숫자를 보여 주지 않는다(홈 리뷰 위젯 MIN_REVIEWS_TO_SHOW 와 같은 사고방식:
// 작은 숫자는 신뢰를 깎고, 지역 확대 초기에는 배정이 시/도 전체 담당 파트너와 관리자 확인으로 이뤄진다).
export const MIN_PARTNERS_TO_SHOW = 3;
