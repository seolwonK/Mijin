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

const { notifyAdminAttention } = await import('@/lib/adminAlerts');
const REQ = { lookupCode: '123456', urgency: 'CRITICAL' };

beforeEach(() => { sendSms.mockReset(); findMany.mockReset(); delete process.env.ADMIN_ALERT_PHONES; });
afterEach(() => { delete process.env.ADMIN_ALERT_PHONES; });

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
