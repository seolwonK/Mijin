// 정기 점검 홍보 팝업의 **노출 빈도 규칙**. 컴포넌트에서 떼어 둔 이유는 두 가지다 —
// 이 규칙이 "얼마나 귀찮게 굴 것인가"를 정하는 제품 결정이라 한눈에 보여야 하고,
// localStorage 없이 단위 테스트할 수 있어야 하기 때문이다.
//
// 값 하나가 저장의 전부다: "이 시각까지는 띄우지 않는다"는 epoch ms.
// 플래그를 여러 개 두면 "봤음/닫음/눌렀음" 조합이 늘어 상태가 꼬인다.

export const PROMO_STORAGE_KEY = 'ajeossi_inspection_promo_until';

/**
 * 팝업이 닫힌 사유. 사유마다 다시 보여주기까지의 간격이 다르다 —
 * 그냥 닫은 사람에게는 2주 뒤 한 번 더, 내용을 보러 간 사람에게는 분기 뒤,
 * 명시적으로 거절한 사람에게는 사실상 영구히 띄우지 않는다.
 */
export type PromoDismissReason = 'close' | 'cta' | 'never';

export const PROMO_SNOOZE_DAYS: Record<PromoDismissReason, number> = {
  close: 14,
  cta: 90,
  never: 3650,
};

/** 팝업을 띄우기 전 기다리는 시간(ms). 첫 화면을 먼저 보여 주고 나서 말을 건다. */
export const PROMO_DELAY_MS = 2_200;

const DAY_MS = 24 * 60 * 60 * 1000;

export function nextSnoozeUntil(
  reason: PromoDismissReason,
  now: number = Date.now(),
): number {
  return now + PROMO_SNOOZE_DAYS[reason] * DAY_MS;
}

/**
 * 저장된 값을 보고 지금 팝업을 눌러 둬야 하는지 판단한다.
 * 값이 없거나(첫 방문) 깨졌으면 **띄우는 쪽**으로 기운다 — 저장소를 못 읽는 상황
 * (사생활 보호 모드 등)에서 홍보가 통째로 사라지는 것보다 한 번 더 보이는 쪽이 낫다.
 */
export function isSnoozed(raw: string | null, now: number = Date.now()): boolean {
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && until > now;
}
