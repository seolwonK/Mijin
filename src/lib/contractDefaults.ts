import type { EmploymentType, PayMethod, WageType } from '@prisma/client';

// 근로형태에 따라 서버가 강제하는 소정근로시간·근무일 기본값.
// 일일 근로자(DAILY): 하루 8시간.
// 상시 근로자(PERMANENT): 평일 09:00~18:00, "추후 협의 변동 가능".
// 이 값들은 기술자가 수정할 수 없고, 계약서 GET/제출 시 서버가 다시 세팅한다.
export type ContractDefaults = {
  workStartTime: string | null;
  workEndTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  hoursNote: string | null;
  workDays: string;
  weeklyHoliday: string | null;
};

export function contractDefaults(type: EmploymentType): ContractDefaults {
  if (type === 'DAILY') {
    // 1일 8시간 = 09:00~18:00 중 휴게 1시간 (근로기준법 제54조: 8시간 근로 시 1시간 휴게)
    return {
      workStartTime: '09:00',
      workEndTime: '18:00',
      breakStartTime: '12:00',
      breakEndTime: '13:00',
      hoursNote: '1일 소정근로 8시간',
      workDays: '근로개시일 당일',
      weeklyHoliday: null,
    };
  }
  // PERMANENT
  return {
    workStartTime: '09:00',
    workEndTime: '18:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00',
    hoursNote: '추후 협의 변동 가능',
    workDays: '월~금(주5일)',
    weeklyHoliday: '일요일',
  };
}

// 관리자가 AppSettings 에 기본 임금을 설정하지 않았을 때 사용하는 폴백 기본값.
// 개인기술자가 가입 직후 관리자를 기다리지 않고 바로 계약서에 서명할 수 있도록,
// 임금은 항상 이 값들로 채워진다(비워두지 않는다). 법정 최저임금 위의 안전한 값이며,
// 관리자가 [설정]에서 실제 조건으로 언제든지 수정할 수 있는 임시 기본값이다.
// (일급 8시간 최저임금 ≈ 8만원, 상시 월 최저임금 ≈ 210만원 대비 안전하게 상향)
export const FALLBACK_DAILY_WAGE = 100_000; // 일용 기본 일급 (원)
export const FALLBACK_MONTHLY_WAGE = 2_300_000; // 상시 기본 월급 (원)
const FALLBACK_PAY_METHOD: PayMethod = 'BANK_TRANSFER'; // 예금통장 입금

// 근로형태별 기본 임금 — 계약서 생성 시 자동 기입.
// AppSettings 값이 있으면 그 값을, 없으면 위 폴백 기본값을 쓰므로 항상 서명 가능하다.
type WageDefaultsSource = {
  defaultDailyWage: number | null;
  defaultMonthlyWage: number | null;
  defaultPayDate: string | null;
  defaultPayMethod: PayMethod | null;
} | null;

export function wageDefaultsFor(
  type: EmploymentType,
  settings: WageDefaultsSource,
): {
  wageType: WageType;
  wageAmount: number;
  payDate: string;
  payMethod: PayMethod;
} {
  const isDaily = type === 'DAILY';
  return {
    wageType: isDaily ? 'DAILY' : 'MONTHLY',
    wageAmount:
      (isDaily ? settings?.defaultDailyWage : settings?.defaultMonthlyWage) ??
      (isDaily ? FALLBACK_DAILY_WAGE : FALLBACK_MONTHLY_WAGE),
    payDate: settings?.defaultPayDate ?? (isDaily ? '근로 당일' : '매월 25일'),
    payMethod: settings?.defaultPayMethod ?? FALLBACK_PAY_METHOD,
  };
}

// 소정근로시간 표시용 문자열 (계약서·인쇄 공용)
export function workHoursText(d: {
  workStartTime: string | null;
  workEndTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  hoursNote: string | null;
}): string {
  const parts: string[] = [];
  if (d.workStartTime && d.workEndTime) {
    parts.push(`${d.workStartTime} ~ ${d.workEndTime}`);
  }
  if (d.breakStartTime && d.breakEndTime) {
    parts.push(`(휴게 ${d.breakStartTime} ~ ${d.breakEndTime})`);
  }
  if (d.hoursNote) parts.push(d.hoursNote);
  return parts.join(' ');
}
