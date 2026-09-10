import { z } from 'zod';

// 빈 문자열은 계좌 미등록으로 통일. 부분 입력은 저장하지 않는다.
const optionalText = (max: number) => z.string().trim().max(max).nullable()
  .transform(value => value || null);

export const eggChargeAccountSchema = z.object({
  eggBankName: optionalText(50),
  eggBankAccountNumber: optionalText(50).refine(
    value => value == null || /^[0-9][0-9 -]*[0-9]$/.test(value),
    '계좌번호는 숫자와 하이픈, 공백으로 입력해 주세요.',
  ),
  eggBankAccountHolder: optionalText(100),
}).refine(value => {
  const count = Object.values(value).filter(Boolean).length;
  return count === 0 || count === 3;
}, '은행명·계좌번호·예금주를 모두 입력하거나 모두 비워 주세요.');

export const eggChargeAccountSelect = {
  eggBankName: true,
  eggBankAccountNumber: true,
  eggBankAccountHolder: true,
} as const;

export type EggChargeAccountSettings = z.infer<typeof eggChargeAccountSchema>;
