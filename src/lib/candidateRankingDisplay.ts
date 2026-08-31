// 접수 상세 후보 목록(AC-1b) — 근거 배지 파생. matching.ts의 compareCandidates와
// 동일한 단계 우선순위·`!==` 동치(엡실론 금지)로 "이 후보가 왜 바로 이전
// 후보보다 아래인가"를 UI 측에서 재유도한다.
//
// Principle-1 명시 예외(carve-out, .omc/plans/assign-viz-portals.md 25행): 이는 comparator
// 로직의 파생 복제다. parity 단위 테스트(matching-eggs.test.ts)가 이 함수 출력을
// compareCandidates 실제 정렬과 상시 대조하며, matching.ts의 단계 순서가 바뀌면 이 함수도
// 함께 갱신해야 한다(의도된 안전망). 알 크레딧 통합(ralplan-egg-credit.md B-2) 반영:
// non-CRITICAL은 지역 다음 알 보유량, CRITICAL은 같은구→(동급 내)알.
export type RankedCandidateLike = {
  rejectedThisRequest: boolean;
  coversRegion: boolean;
  assigned30d: number;
  avgRating: number;
  distanceKm: number | null;
  eggBalance: number;
  sameDistrict: boolean;
};

// 인접 후보(prev = 바로 앞 순위, curr = 대상) 비교로 첫 차이 단계를 배지 라벨로 반환.
// CRITICAL 접수는 실제 정렬이 순환·별점을 건너뛰고 같은구→알 단계를 타므로(compareCandidates)
// 이 함수도 동일하게 분기한다 — 그렇지 않으면 배지가 거짓말하게 된다(특히 유료 순위는
// 금전 분쟁 표면 — 알 때문에 밀렸는데 "30일 배정에서 뒤짐"으로 표기되면 안 된다).
// 전 단계 동률이면(실무상 희귀) null — 최종 안정 키 비교는 배지 대상이 아니다.
export function deriveRankingBadge(
  prev: RankedCandidateLike,
  curr: RankedCandidateLike,
  urgency: string,
): string | null {
  if (prev.rejectedThisRequest !== curr.rejectedThisRequest) return '거절·무응답·회수 이력';
  if (prev.coversRegion !== curr.coversRegion) return '지역';
  if (urgency === 'CRITICAL') {
    if (prev.sameDistrict !== curr.sameDistrict) return '같은 지역 우선에서 뒤짐';
    if (prev.eggBalance !== curr.eggBalance) return '알 보유량에서 뒤짐';
  } else {
    if (prev.eggBalance !== curr.eggBalance) return '알 보유량에서 뒤짐';
    if (prev.assigned30d !== curr.assigned30d) return '30일 배정에서 뒤짐';
    if (prev.avgRating !== curr.avgRating) return '별점 우위';
  }
  // 거리 단계 — compareCandidates와 동일한 null 규칙(한쪽만 null이어도 거리 단계로 판정).
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
