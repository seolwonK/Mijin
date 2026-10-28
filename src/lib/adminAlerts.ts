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

// 수신 번호를 정하는 곳: 환경변수(쉼표 구분)가 있으면 그 번호로만 보내고, 없으면 아래
// 기본 번호로 보낸다. 확인요망 알림은 ADMIN_ALERT_PHONES, 새 접수 알림은 REQUEST_ALERT_PHONES.
//
// 예전에는 확인요망 알림을 관리자 계정 전화번호로 보냈는데, 그 번호를 바꾸는 화면이 없어
// 시드 번호 01000000000 으로 나가고 있었다(운영 8건 무수신, 2026-10-28 확인). 배포 환경변수를
// 건드리지 않아도 운영 담당자가 바로 받도록 기본 번호를 코드에 둔다.
const DEFAULT_ALERT_PHONES = ['01079971644'];

function alertPhones(envName: 'ADMIN_ALERT_PHONES' | 'REQUEST_ALERT_PHONES'): string[] {
  const configured = (process.env[envName] ?? '')
    .split(',')
    .map((p) => p.replace(/[^0-9]/g, ''))
    .filter((p) => p.length >= 9);
  return configured.length ? configured : DEFAULT_ALERT_PHONES;
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
    await Promise.all(alertPhones('REQUEST_ALERT_PHONES').map((phone) => sendSms(phone, text)));
  } catch (e) {
    console.error('[adminAlerts] 새 접수 알림 실패', e);
  }
}

export async function notifyAdminAttention(
  request: { lookupCode: string; urgency: string },
  reason: string,
): Promise<void> {
  try {
    const text = smsAdminAttention({
      lookupCode: request.lookupCode,
      urgencyLabel: URGENCY_LABEL[request.urgency] ?? request.urgency,
      reason,
    });
    await Promise.all(alertPhones('ADMIN_ALERT_PHONES').map((phone) => sendSms(phone, text)));
  } catch (e) {
    console.error('[adminAlerts] 관리자 알림 실패', e);
  }
}
