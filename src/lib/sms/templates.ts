import { TIME_SLOT_LABEL, type TimeSlot } from '@/lib/inspection';

// 발송 정책:
//  1) 접수 완료 → 고객에게 1건
//  2) 배정 → 담당 업체에게 1건 (고객 연락처·주소 포함)
//  3) 완료 → 고객에게 1건 (만족도 조사)
// (수락·가입 심사 알림은 화면 내 확인으로 대체 — 비용 절감)
// 한글 45자(90바이트)를 넘으면 SMS→LMS로 전환되어 단가가 약 3배가 된다.
//
// 머리말은 서비스 이름과 같은 [전기아저씨] 로 통일한다 — 예전 표기 [전기출동] 은 수신자가
// 어디서 온 문자인지 알아보기 어려워 스팸으로 오인될 소지가 있었다(2026-09-07).
// 표기가 2바이트 길어졌지만 SMS 로 나가는 두 건(접수 완료 78B·배정 회수 70B)은 90바이트
// 안에 남는다. 나머지 두 건은 이전부터 LMS 였다.

export function smsRequestReceived(customerName: string): string {
  return `[전기아저씨] ${customerName}님, 접수가 완료되었습니다. 배정된 업체에서 곧 연락드립니다.`;
}

const URGENCY_LABEL: Record<string, string> = {
  CRITICAL: '초긴급·1시간 내',
  URGENT: '긴급·2시간 내',
  NORMAL: '일반',
};

// 숫자만 저장된 전화번호를 읽기 좋게 하이픈 표기
function formatPhone(digits: string): string {
  if (/^01\d{9}$/.test(digits)) return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (/^01\d{8}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  if (/^02\d{8}$/.test(digits)) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (/^02\d{7}$/.test(digits)) return digits.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1-$2-$3');
  if (/^0\d{9}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  return digits;
}

// 배정 회수 안내 — 업체가 배정 문자만 보고 출동하지 않도록 즉시 알린다 (단문 유지)
export function smsAssignmentRecalled(): string {
  return '[전기아저씨] 안내드린 배정이 회수되었습니다. 출동하지 않으셔도 됩니다.';
}

// 관리자 확인요망 알림 — 자동배정이 처리하지 못한 접수를 능동 통지한다 (단문 유지).
// 사유: 후보 없음 / 지역 판별 불가 / 무응답 회수 / 배정 거절.
export function smsAdminAttention(p: {
  lookupCode: string;
  urgencyLabel: string;
  reason: string;
}): string {
  return `[전기아저씨/관리] 접수 ${p.lookupCode}(${p.urgencyLabel}) 확인요망 — ${p.reason}. 관제탑에서 조치해 주세요.`;
}

// 업체 배정 알림 — 고객 연락처·주소 포함 (장문이라 LMS 단가 적용 가능)
export function smsProviderAssigned(p: {
  customerName: string;
  customerPhone: string;
  address: string | null;
  urgency: string;
  distanceKm?: number | null;
}): string {
  const lines = [
    `[전기아저씨] 새 출동 배정 (${URGENCY_LABEL[p.urgency] ?? p.urgency})`,
    `고객: ${p.customerName} ${formatPhone(p.customerPhone)}`,
    `주소: ${p.address ?? '미확인 — 업체 포털에서 위치 확인'}`,
  ];
  if (p.distanceKm != null) lines.push(`거리: 약 ${p.distanceKm.toFixed(1)}km`);
  lines.push('업체 포털에서 수락/거절을 눌러 주세요.');
  return lines.join('\n');
}

// 완료 후 만족도 조사 안내 — 고객에게 참여 링크 전달 (단문 유지)
export function smsSurveyRequest(url: string): string {
  return `[전기아저씨] 수리가 완료되었습니다. 만족도 조사 참여: ${url}`;
}

// ── 정기 전기점검 구독 ──────────────────────────────────────────────────────
// 구독은 계좌이체라 "입금해 달라 → 입금을 확인했다" 두 통지가 돈의 흐름을 잇는다.
// 이 두 건은 금액·계좌가 들어가 LMS 가 되지만, 결제 관련 통지를 화면 확인에만
// 맡기면 입금 누락·중복 입금이 생기므로 비용을 감수한다.

/**
 * 'YYYY-MM-DD' → 'M월 D일'. 문장 안에서 조사가 붙는 자리에 쓴다 — ISO 표기 뒤의 "로"는
 * 끝 숫자에 따라 "으로"가 맞는 경우가 있지만("23으로"), "…일로"는 언제나 맞다.
 */
function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 해를 넘기는 날짜(구독 종료일)에 쓴다. 형식이 아니면 그대로. */
function monthDayYear(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return `${Number(date.slice(0, 4))}년 ${monthDay(date)}`;
}

/**
 * 사용자가 적은 값을 문자 본문에 넣기 전에 줄을 바꿀 수 있는 문자를 걷어낸다.
 * \p{Cc}(제어문자, \n·\r 포함)만으로는 U+2028/U+2029(줄·문단 구분자)가 빠진다 —
 * 수신 단말에 따라 새 줄로 보이므로 Zl·Zp 와 서식 문자(Cf, 방향 제어 등)까지 함께 본다.
 * 신청 스키마(api/inspection/apply)의 SINGLE_LINE 과 같은 범주다.
 */
function oneLine(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ').trim();
}

export function smsInspectionApplied(p: {
  customerName: string;
  priceWon: number;
  account: { bankName: string; accountNumber: string; accountHolder: string } | null;
  depositorName: string;
}): string {
  const lines = [
    `[전기아저씨] ${oneLine(p.customerName)}님, 정기 전기점검 신청이 접수되었습니다.`,
    `연회비 ${p.priceWon.toLocaleString('ko-KR')}원을 입금해 주시면 점검이 시작됩니다.`,
  ];
  if (p.account) {
    lines.push(`${p.account.bankName} ${p.account.accountNumber} (예금주 ${p.account.accountHolder})`);
  }
  lines.push(`입금자명: ${oneLine(p.depositorName)}`);
  return lines.join('\n');
}

export function smsInspectionActivated(p: {
  customerName: string;
  endDate: string;
  firstVisitDate: string | null;
  /** 1회차 방문 시간대 — 다른 점검 문자처럼 날짜와 함께 알린다. 모르면 날짜만 싣는다. */
  firstVisitTimeSlot?: TimeSlot | null;
  /** 고객 포털(/my) 주소 — 날짜를 다시 골라야 할 때만 본문에 싣는다. */
  portalUrl: string;
}): string {
  const lines = [
    `[전기아저씨] ${oneLine(p.customerName)}님, 입금이 확인되어 정기 전기점검이 시작되었습니다.`,
    `이용 기간: ${monthDayYear(p.endDate)}까지 · 분기마다 1회씩 총 4회 방문합니다.`,
  ];
  lines.push(
    p.firstVisitDate
      ? `1회차 방문 예정일: ${monthDay(p.firstVisitDate)}${
          p.firstVisitTimeSlot ? ` ${TIME_SLOT_LABEL[p.firstVisitTimeSlot]}` : ''
        }`
      : `희망하신 날짜에는 방문이 어려워 1회차 방문일을 다시 선택해 주세요. ${p.portalUrl}`,
  );
  return lines.join('\n');
}

export function smsInspectionVisitBooked(p: {
  quarter: number;
  date: string;
}): string {
  return `[전기아저씨] ${p.quarter}회차 전기점검 방문일이 ${monthDay(p.date)}로 예약되었습니다.`;
}

// 아래 세 건은 **관리자가 고객 대신 움직인 결과**를 알린다. 고객은 그 변화를 화면에서
// 보고 있지 않으므로, 알리지 않으면 취소된 날에 집에서 기다리게 된다.

// 조사까지 붙여 둔다 — 받침 유무가 제각각이라("오전으로"/"오후로") 뒤에서 한 가지로 붙일 수 없다.
const SLOT_TO = { MORNING: '오전으로', AFTERNOON: '오후로', ANY: '시간 무관으로' } as const;

export function smsInspectionVisitRescheduled(p: {
  quarter: number;
  date: string;
  /** 시간대가 바뀌었을 때만 넘긴다 — 날짜만 말하면 고객은 여전히 오전에 기다린다. */
  timeSlot: keyof typeof SLOT_TO | null;
}): string {
  const when = p.timeSlot ? `${monthDay(p.date)} ${SLOT_TO[p.timeSlot]}` : `${monthDay(p.date)}로`;
  return `[전기아저씨] ${p.quarter}회차 전기점검 방문이 ${when} 변경되었습니다.`;
}

export function smsInspectionVisitCanceled(p: {
  quarter: number;
  date: string;
  portalUrl: string;
}): string {
  return `[전기아저씨] ${p.quarter}회차 전기점검(${monthDay(p.date)}) 방문이 취소되었습니다. 새 날짜를 선택해 주세요. ${p.portalUrl}`;
}

export function smsInspectionPlanCanceled(p: { customerName: string; tel: string }): string {
  return `[전기아저씨] ${oneLine(p.customerName)}님, 정기 전기점검 구독이 취소되었습니다. 문의 ${p.tel}`;
}
