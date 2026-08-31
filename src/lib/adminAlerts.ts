import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsAdminAttention } from '@/lib/sms/templates';

const URGENCY_LABEL: Record<string, string> = {
  CRITICAL: '초긴급',
  URGENT: '긴급',
  NORMAL: '일반',
};

// 확인요망(needsAttention) 전환 시 관리자에게 능동 통지.
// 대시보드 빨간 표시는 화면을 열어야만 보이므로, 자동배정이 처리하지 못한 접수
// (후보 없음·지역 판별 불가·무응답 회수·거절)는 문자로도 알린다.
//
// 중복 발송 방지는 호출부 책임: needsAttention 이 false → true 로 "전환되는 순간"에만
// 호출할 것. (워커는 30초 주기라 상태 기반 재발송이면 문자 폭탄이 된다.)
// 문자 실패는 접수 처리에 영향을 주지 않는다(sendSms 내부 로깅·SmsLog 기록).
export async function notifyAdminAttention(
  request: { lookupCode: string; urgency: string },
  reason: string,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', phone: { not: '' } },
      select: { phone: true },
    });
    const text = smsAdminAttention({
      lookupCode: request.lookupCode,
      urgencyLabel: URGENCY_LABEL[request.urgency] ?? request.urgency,
      reason,
    });
    await Promise.all(admins.map((a) => sendSms(a.phone, text)));
  } catch (e) {
    console.error('[adminAlerts] 관리자 알림 실패', e);
  }
}
