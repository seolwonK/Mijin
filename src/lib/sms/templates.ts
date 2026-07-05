// 발송 정책: 문자는 "접수 완료" 시점에 고객에게 1건만 발송한다.
// (배정·수락·완료·가입 심사 알림은 화면 내 확인으로 대체 — 비용 절감)
// 한글 45자(90바이트)를 넘으면 SMS→LMS로 전환되어 단가가 약 3배가 되므로 길이 주의.

export function smsRequestReceived(customerName: string): string {
  return `[전기출동] ${customerName}님, 접수가 완료되었습니다. 배정된 업체에서 곧 연락드립니다.`;
}
