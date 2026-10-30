// 업체·전기기사 배정/회수 문자 발송 스위치(ASSIGNEE_SMS).
//
// 단독 운영 중 승인된 계정이 테스트 계정(전화 01012345678)뿐이라, 실고객 이름·전화·주소가 담긴
// 배정 문자가 그 번호로 나갔다(2026-10-31 운영 확인). 기본은 꺼짐 — 문자는 고객과 운영 담당자에게만.
// 관리자 회수 라우트로 스위치가 실제 발송을 막는지까지 고정한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const sendSms = vi.fn();
const findFirst = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { assignment: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'ADMIN' })) }));
vi.mock('@/lib/assignment', () => ({ transitionPendingAssignment: vi.fn(async () => true) }));
vi.mock('@/lib/assignee', () => ({ ASSIGNEE_INCLUDE: {}, resolveAssignee: () => ({ phone: '01012345678' }) }));
vi.mock('@/lib/sms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sms')>()),
  sendSms: (...a: unknown[]) => sendSms(...a),
}));

const { assigneeSmsEnabled } = await import('@/lib/sms');
const { POST: unassign } = await import('@/app/api/admin/requests/[id]/unassign/route');

function callUnassign() {
  return unassign(new NextRequest('http://localhost/api/admin/requests/r1/unassign', { method: 'POST' }), {
    params: Promise.resolve({ id: 'r1' }),
  });
}

beforeEach(() => {
  sendSms.mockReset();
  findFirst.mockReset().mockResolvedValue({ id: 'a1', requestId: 'r1', status: 'REQUESTED' });
  delete process.env.ASSIGNEE_SMS;
});
afterEach(() => {
  delete process.env.ASSIGNEE_SMS;
});

describe('assigneeSmsEnabled', () => {
  it('기본은 꺼져 있고 on 일 때만 켜진다', () => {
    expect(assigneeSmsEnabled()).toBe(false);
    process.env.ASSIGNEE_SMS = 'true';
    expect(assigneeSmsEnabled()).toBe(false);
    process.env.ASSIGNEE_SMS = 'on';
    expect(assigneeSmsEnabled()).toBe(true);
  });
});

describe('관리자 회수 문자', () => {
  it('기본은 회수는 하되 담당자에게 문자를 보내지 않는다', async () => {
    const res = await callUnassign();
    expect(res.status).toBe(200);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('ASSIGNEE_SMS=on 이면 담당자에게 회수 문자를 보낸다', async () => {
    process.env.ASSIGNEE_SMS = 'on';
    const res = await callUnassign();
    expect(res.status).toBe(200);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms.mock.calls[0][0]).toBe('01012345678');
  });
});
