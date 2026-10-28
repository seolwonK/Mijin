import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsAdminAttention, smsNewRequestAlert } from '@/lib/sms/templates';
import { VOICE_PLACEHOLDER } from '@/lib/stt';
import { COMPANY } from '@/lib/company';

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

// 수신 번호를 정하는 곳: ADMIN_ALERT_PHONES 환경변수(쉼표 구분)가 있으면 그 번호로만 보내고,
// 없으면 관리자 계정에 등록된 전화번호로 보낸다.
//
// 환경변수를 둔 이유는 관리자 계정의 전화번호를 바꾸는 화면이 없기 때문이다. 시드로 만든
// 관리자 계정의 번호는 01000000000 이라, 그대로 두면 확인요망 알림이 아무에게도 닿지 않는다.
// 배포 환경변수에 실제 담당자 번호를 넣으면 DB 를 건드리지 않고 수신처를 바꿀 수 있다.
function phonesFromEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((p) => p.replace(/[^0-9]/g, ''))
    .filter((p) => p.length >= 9);
}

function alertPhonesFromEnv(): string[] {
  return phonesFromEnv('ADMIN_ALERT_PHONES');
}

// 새 접수 알림 수신 번호: REQUEST_ALERT_PHONES 환경변수(쉼표 구분)가 있으면 그 번호로,
// 없으면 아래 기본 번호로 보낸다. 배포 환경변수를 건드리지 않아도 바로 받도록 기본값을 둔다.
const DEFAULT_REQUEST_ALERT_PHONES = ['01079971644'];

function requestAlertPhones(): string[] {
  const configured = phonesFromEnv('REQUEST_ALERT_PHONES');
  return configured.length ? configured : DEFAULT_REQUEST_ALERT_PHONES;
}

// 접수가 들어오면 운영 담당자에게 접수 내용을 문자로 보낸다. 확인요망 알림과 달리
// 매 접수마다 1회 — 호출부(POST /api/requests)가 접수 행 생성 직후 한 번만 부른다.
// SmsLog 에 requestId 를 붙이지 않는 것은 확인요망 알림과 같다: 접수별 문자 기록은
// 고객·업체에게 나간 것만 모은다.
export async function notifyNewRequest(
  request: {
    id: string;
    lookupCode: string;
    urgency: string;
    customerName: string;
    customerPhone: string;
    address: string | null;
    lat: number | null;
    description: string;
    voiceFileId: string | null;
  },
  photoCount: number,
): Promise<void> {
  try {
    const text = smsNewRequestAlert({
      lookupCode: request.lookupCode,
      urgency: request.urgency,
      customerName: request.customerName,
      customerPhone: request.customerPhone,
      address: request.address,
      hasCoords: request.lat != null,
      description: request.description === VOICE_PLACEHOLDER ? null : request.description,
      hasVoice: request.voiceFileId != null,
      photoCount,
      adminUrl: `${COMPANY.siteUrl}/admin/requests/${request.id}`,
    });
    await Promise.all(requestAlertPhones().map((phone) => sendSms(phone, text)));
  } catch (e) {
    console.error('[adminAlerts] 새 접수 알림 실패', e);
  }
}

export async function notifyAdminAttention(
  request: { lookupCode: string; urgency: string },
  reason: string,
): Promise<void> {
  try {
    const configured = alertPhonesFromEnv();
    const phones = configured.length
      ? configured
      : (
          await prisma.user.findMany({
            where: { role: 'ADMIN', phone: { not: '' } },
            select: { phone: true },
          })
        ).map((a) => a.phone);
    if (phones.length === 0) {
      console.warn('[adminAlerts] 확인요망 알림 수신 번호가 없습니다 — ADMIN_ALERT_PHONES 확인');
      return;
    }
    const text = smsAdminAttention({
      lookupCode: request.lookupCode,
      urgencyLabel: URGENCY_LABEL[request.urgency] ?? request.urgency,
      reason,
    });
    await Promise.all(phones.map((phone) => sendSms(phone, text)));
  } catch (e) {
    console.error('[adminAlerts] 관리자 알림 실패', e);
  }
}
