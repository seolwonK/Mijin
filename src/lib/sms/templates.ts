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

export function smsInspectionApplied(p: {
  customerName: string;
  priceWon: number;
  account: { bankName: string; accountNumber: string; accountHolder: string } | null;
  depositorName: string;
}): string {
  const lines = [
    `[전기아저씨] ${p.customerName}님, 정기 전기점검 신청이 접수되었습니다.`,
    `연회비 ${p.priceWon.toLocaleString('ko-KR')}원을 입금해 주시면 점검이 시작됩니다.`,
  ];
  if (p.account) {
    lines.push(`${p.account.bankName} ${p.account.accountNumber} (예금주 ${p.account.accountHolder})`);
  }
  lines.push(`입금자명: ${p.depositorName}`);
  return lines.join('\n');
}

export function smsInspectionActivated(p: {
  customerName: string;
  endDate: string;
  firstVisitDate: string | null;
}): string {
  const lines = [
    `[전기아저씨] ${p.customerName}님, 입금이 확인되어 정기 전기점검이 시작되었습니다.`,
    `이용 기간: ${p.endDate}까지 · 분기마다 1회씩 총 4회 방문합니다.`,
  ];
  lines.push(
    p.firstVisitDate
      ? `1회차 방문 예정일: ${p.firstVisitDate}`
      : '희망하신 날짜가 지나 1회차 방문일을 다시 선택해 주세요.',
  );
  return lines.join('\n');
}

export function smsInspectionVisitBooked(p: {
  quarter: number;
  date: string;
}): string {
  return `[전기아저씨] ${p.quarter}회차 전기점검 방문일이 ${p.date}로 예약되었습니다.`;
}
