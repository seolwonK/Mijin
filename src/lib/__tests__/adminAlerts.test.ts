// 확인요망 알림의 수신처 결정 규칙.
//
// 관리자 계정의 전화번호를 바꾸는 화면이 없어서, 시드 계정의 01000000000 이 그대로 남으면
// 알림이 아무에게도 닿지 않는다. ADMIN_ALERT_PHONES 환경변수는 그 상황을 DB 수정 없이
// 벗어나기 위한 것이고, 여기서 검증하는 것은 "환경변수가 DB 조회를 대신하는가"이다.
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
});
afterEach(() => { delete process.env.ADMIN_ALERT_PHONES; delete process.env.REQUEST_ALERT_PHONES; });

describe('notifyAdminAttention 수신처', () => {
  it('환경변수가 없으면 관리자 계정 전화번호로 보낸다', async () => {
    findMany.mockResolvedValue([{ phone: '01011112222' }, { phone: '01033334444' }]);
    await notifyAdminAttention(REQ, '담당 지역 배정 후보 없음');
    expect(findMany).toHaveBeenCalledOnce();
    expect(sendSms.mock.calls.map((c) => c[0])).toEqual(['01011112222', '01033334444']);
    expect(sendSms.mock.calls[0][1]).toContain('[전기아저씨/관리]');
  });

  it('환경변수가 있으면 그 번호로만 보내고 DB를 조회하지 않는다', async () => {
    process.env.ADMIN_ALERT_PHONES = '010-5555-6666, 01077778888';
    await notifyAdminAttention(REQ, '무응답 회수');
    expect(findMany).not.toHaveBeenCalled();
    expect(sendSms.mock.calls.map((c) => c[0])).toEqual(['01055556666', '01077778888']);
  });

  it('환경변수에 쓸모없는 값만 있으면 관리자 계정으로 되돌아간다', async () => {
    process.env.ADMIN_ALERT_PHONES = ' , 123, ';
    findMany.mockResolvedValue([{ phone: '01099998888' }]);
    await notifyAdminAttention(REQ, '지역 판별 불가');
    expect(sendSms.mock.calls.map((c) => c[0])).toEqual(['01099998888']);
  });

  it('보낼 번호가 하나도 없으면 발송하지 않는다', async () => {
    findMany.mockResolvedValue([]);
    await notifyAdminAttention(REQ, '후보 없음');
    expect(sendSms).not.toHaveBeenCalled();
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
