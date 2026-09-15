// 지역 출동 안내 레지스트리 — /areas(목록)·사이트맵·브레드크럼·가이드 CTA 가 읽는다.
// 전기아저씨는 전국 시/도·시/군/구 단위로 접수받는 플랫폼이고, 여기 등재된 지역은 "집중 운영 지역"이다.
// 새 지역을 늘릴 때는 이 배열에 항목을 추가하고 src/app/(mobile)/areas/<slug>/ 페이지를 만든다(성남 패턴 참조).
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

export const FOCUS_AREAS: readonly FocusArea[] = [
  {
    slug: 'seongnam',
    name: '성남시',
    sido: '경기도',
    label: '성남 전기 수리 출동',
    summary: '분당·판교·위례·수정·중원 — 가장 먼저 집중 운영하는 지역입니다. 구별 동 목록과 주거 형태별 전기 환경, 자주 접수되는 고장을 안내합니다.',
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
