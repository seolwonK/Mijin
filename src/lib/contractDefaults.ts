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

// 근로형태별 기본 임금 — 계약서 생성 시 AppSettings 값으로 자동 기입.
// 금액이 없으면 wageType만 세팅되고, 인쇄물에는 "추후 협의"로 표기된다.
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
  wageAmount: number | null;
  payDate: string | null;
  payMethod: PayMethod | null;
} {
  const isDaily = type === 'DAILY';
  return {
    wageType: isDaily ? 'DAILY' : 'MONTHLY',
    wageAmount: (isDaily ? settings?.defaultDailyWage : settings?.defaultMonthlyWage) ?? null,
    payDate: settings?.defaultPayDate ?? null,
    payMethod: settings?.defaultPayMethod ?? null,
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
