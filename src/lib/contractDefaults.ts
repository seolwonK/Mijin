import type { EmploymentType } from '@prisma/client';

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
    return {
      workStartTime: null,
      workEndTime: null,
      breakStartTime: null,
      breakEndTime: null,
      hoursNote: '소정근로시간 1일 8시간',
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
