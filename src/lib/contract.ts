import { z } from 'zod';

// 기술자가 작성하는 근로계약서 항목 (인적사항 + 근무장소·업무·근로개시일).
// 소정근로시간·근무일·주휴일은 서버가 근로형태에 따라 세팅하므로 여기에 없다.
export const techContractSchema = z.object({
  contractStartDate: z
    .string()
    .trim()
    .min(1, '근로개시일을 입력해 주세요')
    .refine((s) => !Number.isNaN(Date.parse(s)), '날짜 형식이 올바르지 않습니다'),
  workLocation: z.string().trim().min(1, '근무장소를 입력해 주세요').max(200),
  jobDescription: z.string().trim().min(1, '업무 내용을 입력해 주세요').max(500),
  workerAddress: z.string().trim().min(1, '주소를 입력해 주세요').max(200),
  workerSignatureName: z.string().trim().min(1, '성명을 입력해 주세요').max(50),
});

export type TechContractInput = z.infer<typeof techContractSchema>;

// 관리자가 입력하는 임금·4대보험 항목 + 확정 여부.
export const adminWageSchema = z.object({
  wageType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).nullish(),
  wageAmount: z.coerce.number().int().nonnegative().nullish(),
  bonusExists: z.boolean().default(false),
  bonusAmount: z.coerce.number().int().nonnegative().nullish(),
  otherPayExists: z.boolean().default(false),
  otherPayDesc: z.string().trim().max(200).nullish(),
  otherPayAmount: z.coerce.number().int().nonnegative().nullish(),
  payDate: z.string().trim().max(50).nullish(),
  payMethod: z.enum(['BANK_TRANSFER', 'DIRECT']).nullish(),
  insuranceEmployment: z.boolean().default(true),
  insuranceAccident: z.boolean().default(true),
  insurancePension: z.boolean().default(true),
  insuranceHealth: z.boolean().default(true),
  // true 이면 계약을 확정(CONFIRMED)하며, 이때 임금 필수 항목을 검증한다.
  confirm: z.boolean().default(false),
});

export type AdminWageInput = z.infer<typeof adminWageSchema>;

export const WAGE_TYPE_LABEL: Record<string, string> = {
  MONTHLY: '월급',
  DAILY: '일급',
  HOURLY: '시급',
};

export const PAY_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: '예금통장 입금',
  DIRECT: '근로자에게 직접 지급',
};

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  DAILY: '일일 근로자',
  PERMANENT: '상시 근로자',
};

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  DRAFT: '작성 중',
  SUBMITTED: '제출됨 (임금 입력 대기)',
  CONFIRMED: '확정',
};
