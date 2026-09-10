// 업체·기사 충전 안내와 관리자 지급에서 함께 쓰는 충전 규칙.
export const EGG_PACK_SIZE = 30;
export const EGG_PRICE_WON = 1_000;
export const MIN_CHARGE_EGGS = EGG_PACK_SIZE;
// PostgreSQL Int에 저장할 수 있는 최대 30알 배수.
export const MAX_CHARGE_EGGS = Math.floor(2_147_483_647 / EGG_PACK_SIZE) * EGG_PACK_SIZE;
export const EGG_CHARGE_RULE = '최소 충전 수량은 30알이며, 30알 단위로 충전할 수 있습니다.';

export function isValidEggCharge(count: number): boolean {
  return Number.isSafeInteger(count) && count >= MIN_CHARGE_EGGS &&
    count <= MAX_CHARGE_EGGS && count % EGG_PACK_SIZE === 0;
}
