// 관리자 알림(확인요망·새 접수)의 수신처 결정 규칙과 새 접수 문자 본문.
//
// 관리자 계정의 전화번호를 바꾸는 화면이 없어서, 계정 번호로 보내면 시드 번호 01000000000 으로
// 나가 아무에게도 닿지 않는다(운영에서 실제로 그랬다). 그래서 환경변수 → 코드 기본 번호 순으로만
// 정하고 관리자 계정은 조회하지 않는다 — findMany 가 불리지 않는 것까지 여기서 고정한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendSms = vi.fn();
const findMany = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { user: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock('@/lib/sms', () => ({ sendSms: (...a: unknown[]) => sendSms(...a) }));

const { notifyAdminAttention, notifyNewRequest } = await import('@/lib/adminAlerts');
const { VOICE_PLACEHOLDER } = await import('@/lib/stt');
const REQ = { lookupCode: '123456', urgency: 'CRITICAL' };

beforeEach(() => {
  sendSms.mockReset();
  findMany.mockReset();
  delete process.env.ADMIN_ALERT_PHONES;
  delete process.env.REQUEST_ALERT_PHONES;
  delete process.env.ADMIN_ATTENTION_SMS;
});
afterEach(() => {
  delete process.env.ADMIN_ALERT_PHONES;
  delete process.env.REQUEST_ALERT_PHONES;
  delete process.env.ADMIN_ATTENTION_SMS;
});

describe('notifyAdminAttention 발송 스위치', () => {
  it('기본은 꺼져 있어 문자를 보내지 않는다', async () => {
    await notifyAdminAttention(REQ, '담당 지역 배정 후보 없음');
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('ADMIN_ATTENTION_SMS=on 이 아니면 보내지 않는다', async () => {
    process.env.ADMIN_ATTENTION_SMS = 'true';
    await notifyAdminAttention(REQ, '담당 지역 배정 후보 없음');
    expect(sendSms).not.toHaveBeenCalled();
  });
});

describe('notifyAdminAttention 수신처 (ADMIN_ATTENTION_SMS=on)', () => {
  beforeEach(() => { process.env.ADMIN_ATTENTION_SMS = 'on'; });

  it('환경변수가 없으면 기본 번호로 보내고 관리자 계정 번호(시드 01000000000)는 쓰지 않는다', async () => {
    await notifyAdminAttention(REQ, '담당 지역 배정 후보 없음');
    expect(findMany).not.toHaveBeenCalled();
    expect(sendSms.mock.calls.map((c) => c[0])).toEqual(['01079971644']);
    expect(sendSms.mock.calls[0][1]).toBe(
      '[전기아저씨/관리] 접수 123456(초긴급) 확인요망 — 담당 지역 배정 후보 없음. 관제탑에서 조치해 주세요.',
    );
  });

  it('환경변수가 있으면 그 번호로만 보낸다', async () => {
    process.env.ADMIN_ALERT_PHONES = '010-5555-6666, 01077778888';
    await notifyAdminAttention(REQ, '무응답 회수');
    expect(sendSms.mock.calls.map((c) => c[0])).toEqual(['01055556666', '01077778888']);
  });

  it('환경변수에 쓸모없는 값만 있으면 기본 번호로 되돌아간다', async () => {
    process.env.ADMIN_ALERT_PHONES = ' , 123, ';
    await notifyAdminAttention(REQ, '지역 판별 불가');
    expect(sendSms.mock.calls.map((c) => c[0])).toEqual(['01079971644']);
  });

  it('발송이 실패해도 예외를 던지지 않는다', async () => {
    sendSms.mockRejectedValue(new Error('boom'));
    await expect(notifyAdminAttention(REQ, '후보 없음')).resolves.toBeUndefined();
  });
});

describe('notifyNewRequest', () => {
  const NEW = {
    id: 'req_1',
    lookupCode: '654321',
    urgency: 'URGENT',
    customerName: '홍길동',
    customerPhone: '01012345678',
    address: '경기도 성남시 분당구 정자일로 1',
    lat: 37.36,
    description: '차단기가 계속\n내려가요',
    voiceFileId: null,
  };

  it('환경변수가 없으면 기본 번호로 접수 내용을 보낸다', async () => {
    await notifyNewRequest(NEW, 2);
    expect(findMany).not.toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalledOnce();
    const [to, text, requestId] = sendSms.mock.calls[0];
    expect(to).toBe('01079971644');
    expect(requestId).toBeUndefined();
    expect(text).toBe(
      [
        '[전기아저씨/관리] 새 접수 654321 (긴급·2시간 내)',
        '고객: 홍길동 010-1234-5678',
        '주소: 경기도 성남시 분당구 정자일로 1',
        '내용: 차단기가 계속 내려가요',
        '첨부: 사진 2장',
        'https://xn--ok0bp94bnc26kra.com/admin/requests/req_1',
      ].join('\n'),
    );
  });

  it('환경변수가 있으면 그 번호로만 보낸다', async () => {
    process.env.REQUEST_ALERT_PHONES = '010-5555-6666, 01077778888';
    await notifyNewRequest(NEW, 0);
    expect(sendSms.mock.calls.map((c) => c[0])).toEqual(['01055556666', '01077778888']);
  });

  it('음성만 있는 접수·좌표만 있는 접수를 구분해 적는다', async () => {
    await notifyNewRequest({ ...NEW, address: null, description: VOICE_PLACEHOLDER, voiceFileId: 'f1' }, 0);
    const text = sendSms.mock.calls[0][1] as string;
    expect(text).toContain('주소: 미입력 (위치 좌표로 접수)');
    expect(text).toContain('내용: 음성 접수 — 관리자 화면에서 들어 주세요');
    expect(text).toContain('첨부: 음성');
    expect(text).not.toContain(VOICE_PLACEHOLDER);
  });

  it('긴 고장 내용은 잘라서 싣는다', async () => {
    await notifyNewRequest({ ...NEW, description: '가'.repeat(500) }, 0);
    const text = sendSms.mock.calls[0][1] as string;
    expect(text).toContain(`내용: ${'가'.repeat(300)}…`);
    expect(text).not.toContain('첨부:');
  });

  it('발송이 실패해도 예외를 던지지 않는다', async () => {
    sendSms.mockRejectedValue(new Error('boom'));
    await expect(notifyNewRequest(NEW, 0)).resolves.toBeUndefined();
  });
});
