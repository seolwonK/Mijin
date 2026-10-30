// 관리자 직접 처리 완료(POST /api/admin/requests/[id]/complete) — 실제 PostgreSQL 필수.
import { config as loadEnv } from 'dotenv';
import { afterAll, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

loadEnv({ quiet: true });
if (!process.env.DATABASE_URL) throw new Error('[admin-request-complete.db.test] DATABASE_URL 필수');

const admin = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async (role: string) => (admin.signedIn && role === 'ADMIN' ? { role: 'ADMIN', userId: 'complete-test', name: '검증' } : null)),
}));
// 경합 테스트의 배정 통지가 실제 문자로 나가지 않게 막는다.
vi.mock('@/lib/sms', () => ({ sendSms: vi.fn(async () => {}), assigneeSmsEnabled: () => true }));

import { prisma } from '@/lib/db';
import { claimAndAssign } from '@/lib/assignment';
import { POST as complete } from '@/app/api/admin/requests/[id]/complete/route';
import { FixtureFactory } from '../../../tests/helpers/fixtures';

const fixtures = new FixtureFactory(prisma);
afterAll(async () => { await fixtures.cleanupAll(); await prisma.$disconnect(); });

const call = (id: string) => complete(new NextRequest('http://localhost/api/admin/requests/x/complete', { method: 'POST' }), { params: Promise.resolve({ id }) });
const state = (id: string) => prisma.serviceRequest.findUniqueOrThrow({ where: { id }, include: { assignments: true } });
const REJECTED_MESSAGE = { error: '배정 대기 상태의 접수만 바로 완료할 수 있습니다' };

it('배정 대기 접수를 완료로 닫고 확인 필요 표시를 내린다', async () => {
  const req = await fixtures.createRequestFixture({ status: 'RECEIVED' });
  await prisma.serviceRequest.update({ where: { id: req.id }, data: { needsAttention: true } });
  const res = await call(req.id);
  expect(res.status).toBe(200);
  const s = await state(req.id);
  expect(s.status).toBe('COMPLETED');
  expect(s.completedAt).toBeInstanceOf(Date);
  expect(s.needsAttention).toBe(false);
  expect(s.assignments).toEqual([]);
});

it('업체가 낀 접수(배정됨·수락·출동중)는 409 이고 접수·배정을 건드리지 않는다', async () => {
  const p = await fixtures.createPartnerFixture({ isActive: false });
  const cases = [['ASSIGNED', 'REQUESTED'], ['ACCEPTED', 'ACCEPTED'], ['DISPATCHED', 'ACCEPTED']] as const;
  for (const [status, assignmentStatus] of cases) {
    const req = await fixtures.createRequestFixture({ status });
    await prisma.assignment.create({ data: { requestId: req.id, providerId: p.providerId, assignedBy: 'ADMIN', status: assignmentStatus } });
    const res = await call(req.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(REJECTED_MESSAGE);
    const s = await state(req.id);
    expect(s.status).toBe(status);
    expect(s.completedAt).toBeNull();
    expect(s.assignments.map((a) => a.status)).toEqual([assignmentStatus]);
  }
});

it('이미 닫힌 접수·없는 접수는 409, 비관리자는 401', async () => {
  for (const status of ['COMPLETED', 'CANCELED'] as const) {
    const req = await fixtures.createRequestFixture({ status });
    const res = await call(req.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(REJECTED_MESSAGE);
    expect((await state(req.id)).status).toBe(status);
  }
  expect((await call('no-such-request')).status).toBe(409);
  admin.signedIn = false;
  try { expect((await call('no-such-request')).status).toBe(401); } finally { admin.signedIn = true; }
});

it('완료와 배정이 동시에 들어오면 한쪽만 이긴다', async () => {
  const p = await fixtures.createPartnerFixture();
  for (let i = 0; i < 5; i++) {
    const req = await fixtures.createRequestFixture({ status: 'RECEIVED' });
    const [res, assigned] = await Promise.all([
      call(req.id),
      claimAndAssign({ requestId: req.id, target: { kind: 'PROVIDER', id: p.providerId }, assignedBy: 'ADMIN' }),
    ]);
    const s = await state(req.id);
    if (assigned) {
      expect(res.status).toBe(409);
      expect(s.status).toBe('ASSIGNED');
      expect(s.assignments.map((a) => a.status)).toEqual(['REQUESTED']);
    } else {
      expect(res.status).toBe(200);
      expect(s.status).toBe('COMPLETED');
      expect(s.assignments).toEqual([]);
    }
  }
});
