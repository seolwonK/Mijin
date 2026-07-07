// 발송 정책:
//  1) 접수 완료 → 고객에게 1건
//  2) 배정 → 담당 업체에게 1건 (고객 연락처·주소 포함)
// (수락·완료·가입 심사 알림은 화면 내 확인으로 대체 — 비용 절감)
// 한글 45자(90바이트)를 넘으면 SMS→LMS로 전환되어 단가가 약 3배가 된다.

export function smsRequestReceived(customerName: string): string {
  return `[전기출동] ${customerName}님, 접수가 완료되었습니다. 배정된 업체에서 곧 연락드립니다.`;
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

// 업체 배정 알림 — 고객 연락처·주소 포함 (장문이라 LMS 단가 적용 가능)
export function smsProviderAssigned(p: {
  customerName: string;
  customerPhone: string;
  address: string | null;
  urgency: string;
  distanceKm?: number | null;
}): string {
  const lines = [
    `[전기출동] 새 출동 배정 (${URGENCY_LABEL[p.urgency] ?? p.urgency})`,
    `고객: ${p.customerName} ${formatPhone(p.customerPhone)}`,
    `주소: ${p.address ?? '미확인 — 업체 포털에서 위치 확인'}`,
  ];
  if (p.distanceKm != null) lines.push(`거리: 약 ${p.distanceKm.toFixed(1)}km`);
  lines.push('업체 포털에서 수락/거절을 눌러 주세요.');
  return lines.join('\n');
}
