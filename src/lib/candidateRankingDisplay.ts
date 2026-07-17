// 접수 상세 후보 목록(AC-1b) — 근거 배지 파생. matching.ts의 comparator(matching.ts:118-131)와
// 동일한 단계 우선순위·`!==` 동치(엡실론 금지, matching.ts:123)로 "이 후보가 왜 바로 이전
// 후보보다 아래인가"를 UI 측에서 재유도한다.
//
// Principle-1 명시 예외(carve-out, .omc/plans/assign-viz-portals.md 25행): 이는 comparator
// 로직의 파생 복제다. E-4③ 드리프트 가드(시드 후보 재유도 대조)가 이 함수 출력을
// matching.ts 실제 정렬과 상시 대조해야 하며, matching.ts의 단계 순서가 바뀌면 이 함수도
// 함께 갱신해야 한다(의도된 안전망).
export type RankedCandidateLike = {
  rejectedThisRequest: boolean;
  coversRegion: boolean;
  assigned30d: number;
  avgRating: number;
  distanceKm: number | null;
};

// 인접 후보(prev = 바로 앞 순위, curr = 대상) 비교로 첫 차이 단계를 배지 라벨로 반환.
// CRITICAL 접수는 실제 정렬이 ③30일 배정·④평균 별점 단계를 건너뛰므로(matching.ts:121)
// 이 함수도 동일하게 건너뛴다 — 그렇지 않으면 CRITICAL 건에서 배지가 거짓말하게 된다.
// 5단계 모두 동률이면(실무상 희귀) null — 최종 안정 키(⑥) 비교는 배지 대상이 아니다.
export function deriveRankingBadge(
  prev: RankedCandidateLike,
  curr: RankedCandidateLike,
  urgency: string,
): string | null {
  if (prev.rejectedThisRequest !== curr.rejectedThisRequest) return '거절이력';
  if (prev.coversRegion !== curr.coversRegion) return '지역';
  if (urgency !== 'CRITICAL') {
    if (prev.assigned30d !== curr.assigned30d) return '30일 배정에서 뒤짐';
    if (prev.avgRating !== curr.avgRating) return '별점 우위';
  }
  // 거리 단계 — matching.ts:125-129와 동일한 null 규칙(한쪽만 null이어도 거리 단계로 판정).
  if (prev.distanceKm != null || curr.distanceKm != null) {
    if (prev.distanceKm == null || curr.distanceKm == null || prev.distanceKm !== curr.distanceKm) {
      return '거리';
    }
  }
  return null;
}

// "자동배정 예정" 하이라이트(AC-1a) — autoAssign.ts:46-49의 실제 선택 규칙과 동일:
// coversRegion && !rejectedThisRequest인 첫 후보. candidates[0]을 그냥 쓰면 안 된다
// (0순위가 거절이력 있음/지역 미담당일 수 있음).
export function findAutoAssignCandidateIndex(
  candidates: { coversRegion: boolean; rejectedThisRequest: boolean }[],
): number {
  return candidates.findIndex((c) => c.coversRegion && !c.rejectedThisRequest);
}
