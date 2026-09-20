import { z } from 'zod';

// 정기 전기점검 구독료 입금 계좌 — 알 충전 계좌(lib/eggChargeAccount.ts)와 같은 계약을
// 같은 모양으로 쓴다. 세 필드를 함께 등록하거나 함께 비우고, 부분 입력은 저장하지 않는다.
// 계좌가 없으면 신청 화면이 "계좌 준비 중"으로 떨어지므로, 반쯤 입력된 계좌가 고객에게
// 노출되는 상태를 아예 만들지 않는 것이 요점이다.

// 빈 문자열은 계좌 미등록으로 통일.
const optionalText = (max: number) => z.string().trim().max(max).nullable()
  .transform(value => value || null);

export const inspectionAccountSchema = z.object({
  inspectionBankName: optionalText(50),
  inspectionBankAccountNumber: optionalText(50).refine(
    value => value == null || /^[0-9][0-9 -]*[0-9]$/.test(value),
    '계좌번호는 숫자와 하이픈, 공백으로 입력해 주세요.',
  ),
  inspectionBankAccountHolder: optionalText(100),
}).refine(value => {
  const count = Object.values(value).filter(Boolean).length;
  return count === 0 || count === 3;
}, '은행명·계좌번호·예금주를 모두 입력하거나 모두 비워 주세요.');

export const inspectionAccountSelect = {
  inspectionBankName: true,
  inspectionBankAccountNumber: true,
  inspectionBankAccountHolder: true,
} as const;

export type InspectionAccountSettings = z.infer<typeof inspectionAccountSchema>;

/** 화면에 내려보낼 공개 형태. 세 값이 모두 있을 때만 계좌로 인정한다. */
export type PublicBankAccount = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export function toPublicAccount(
  settings: {
    inspectionBankName: string | null;
    inspectionBankAccountNumber: string | null;
    inspectionBankAccountHolder: string | null;
  } | null,
): PublicBankAccount | null {
  if (!settings) return null;
  const { inspectionBankName, inspectionBankAccountNumber, inspectionBankAccountHolder } = settings;
  if (!inspectionBankName || !inspectionBankAccountNumber || !inspectionBankAccountHolder) {
    return null;
  }
  return {
    bankName: inspectionBankName,
    accountNumber: inspectionBankAccountNumber,
    accountHolder: inspectionBankAccountHolder,
  };
}

/**
 * 입금 계좌를 읽는다. **DB 가 없는 빌드 환경에서도 터지지 않아야 한다** —
 * CloudType 은 `next build` 시점에 DATABASE_URL 을 주입하지 않으므로, 이 값을 읽는
 * 공개 페이지가 프리렌더되면 빌드가 통째로 실패한다. 계좌를 못 읽으면 화면은
 * "계좌 준비 중"으로 내려가고(기능 손실 없음), 런타임에는 정상적으로 다시 읽힌다.
 */
export async function readInspectionAccount(): Promise<PublicBankAccount | null> {
  try {
    const { prisma } = await import('@/lib/db');
    const settings = await prisma.appSettings.findUnique({
      where: { id: 1 },
      select: inspectionAccountSelect,
    });
    return toPublicAccount(settings);
  } catch {
    return null;
  }
}
