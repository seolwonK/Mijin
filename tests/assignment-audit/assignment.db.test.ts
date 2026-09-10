import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Prisma, RequestStatus, AssignmentStatus } from '@prisma/client';
import type { Session } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async (role: string) => {
  const session = sessions.getStore();
  return session?.role === role ? session : null;
}) }));
vi.mock('@/lib/sms', () => ({ sendSms: vi.fn(async () => {}) }));
vi.mock('@/lib/adminAlerts', () => ({ notifyAdminAttention: vi.fn(async () => {}) }));

import { prisma } from '@/lib/db';
import * as matching from '@/lib/matching';
import { getRankingStats } from '@/lib/rankingStats';
import { findAutoAssignCandidateIndex } from '@/lib/candidateRankingDisplay';
import { claimAndAssign } from '@/lib/assignment';
import * as assignmentFunctions from '@/lib/assignment';
import { autoAssignNewRequest, recallStaleAssignments, runAutoAssign } from '@/lib/autoAssign';
import { sendSms } from '@/lib/sms';
import { notifyAdminAttention } from '@/lib/adminAlerts';
import { POST as manualAssign } from '@/app/api/admin/requests/[id]/assign/route';
import { POST as unassign } from '@/app/api/admin/requests/[id]/unassign/route';
import { POST as cancel } from '@/app/api/admin/requests/[id]/cancel/route';
import { POST as providerAccept } from '@/app/api/partner/jobs/[id]/accept/route';
import { POST as techAccept } from '@/app/api/tech/jobs/[id]/accept/route';
import { POST as providerReject } from '@/app/api/partner/jobs/[id]/reject/route';
import { POST as techReject } from '@/app/api/tech/jobs/[id]/reject/route';

const sessions = new AsyncLocalStorage<Session>();
const kinds = ['PROVIDER', 'TECHNICIAN'] as const;
type Kind = typeof kinds[number];
type Target = { kind: Kind; id: string; userId: string };
const urgencies = ['NORMAL', 'URGENT', 'CRITICAL'] as const;
const ADDRESS = '서울특별시 강남구 테헤란로 1';
const NOW = new Date('2026-09-10T03:00:00.000Z');
type Handler = typeof manualAssign;
const call = (fn: Handler, id: string, body?: unknown) => fn(new NextRequest('http://localhost/api/audit', {
  method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
}), { params: Promise.resolve({ id }) });
const adminCall = (fn: Handler, id: string, body?: unknown) => sessions.run({ role: 'ADMIN', userId: 'audit-admin', name: '검증' }, () => call(fn, id, body));
const targetCall = (t: Target, fn: Handler, id: string, body?: unknown) => sessions.run({
  role: t.kind, userId: t.userId, name: '검증',
  ...(t.kind === 'PROVIDER' ? { providerId: t.id } : { technicianId: t.id }),
}, () => call(fn, id, body));
const accept = (t: Target, id: string) => targetCall(t, t.kind === 'PROVIDER' ? providerAccept : techAccept, id);
const reject = (t: Target, id: string, body: unknown = { reason: '검증 거절' }) => targetCall(t, t.kind === 'PROVIDER' ? providerReject : techReject, id, body);
const fk = (t: Target) => t.kind === 'PROVIDER' ? { providerId: t.id } : { technicianId: t.id };

async function target(kind: Kind = 'PROVIDER', data: Partial<Prisma.ProviderUncheckedCreateInput> = {}, contract: 'CONFIRMED' | 'DRAFT' | 'SUBMITTED' | null = 'CONFIRMED'): Promise<Target> {
  const user = await prisma.user.create({ data: { loginId: `audit-${crypto.randomUUID()}`, passwordHash: 'unused', name: '배정 검증', phone: '01000000001', role: kind } });
  const common = { userId: user.id, address: ADDRESS, lat: 37.5, lng: 127, approvalStatus: 'APPROVED' as const, ...data };
  if (kind === 'PROVIDER') return { kind, id: (await prisma.provider.create({ data: common })).id, userId: user.id };
  const tech = await prisma.technician.create({ data: { ...common, employmentType: 'DAILY' } });
  if (contract) await prisma.employmentContract.create({ data: {
    technicianId: tech.id, employmentType: 'DAILY', status: contract,
    workLocation: '검증', jobDescription: '검증', workDays: '검증',
  } });
  return { kind, id: tech.id, userId: user.id };
}
async function request(data: Partial<Prisma.ServiceRequestCreateInput> = {}) {
  return prisma.serviceRequest.create({ data: {
    lookupCode: `audit-${crypto.randomUUID()}`, customerName: '검증 고객', customerPhone: '01000000002',
    description: '배정 검증', urgency: 'NORMAL', address: ADDRESS, lat: 37.51, lng: 127.01,
    assignBaseAt: NOW, ...data,
  } });
}
async function pending(t: Target, data: Partial<Prisma.ServiceRequestCreateInput> = {}, by: 'AUTO' | 'ADMIN' = 'AUTO', age = 0) {
  const req = await request({ ...data, status: 'ASSIGNED' });
  const a = await prisma.assignment.create({ data: { requestId: req.id, ...fk(t), assignedBy: by, createdAt: new Date(NOW.getTime() - age) } });
  return { req, a };
}
async function state(id: string) {
  return prisma.serviceRequest.findUniqueOrThrow({ where: { id }, include: { assignments: { orderBy: { createdAt: 'asc' } } } });
}
async function settings(enabled = true) {
  return prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, autoAssignEnabled: enabled, waitMinutesCritical: 1, waitMinutesUrgent: 2, waitMinutesNormal: 3 }, update: { autoAssignEnabled: enabled } });
}
async function fault(table: 'Assignment' | 'ServiceRequest', operation: 'INSERT' | 'UPDATE', onlyId?: string) {
  if (onlyId && !/^c[a-z0-9]+$/.test(onlyId)) throw new Error('Expected generated fixture ID');
  const condition = onlyId ? `IF NEW.id = '${onlyId}' THEN RAISE EXCEPTION 'AUDIT_INJECTED_STORAGE_FAILURE'; END IF; RETURN NEW;` : "RAISE EXCEPTION 'AUDIT_INJECTED_STORAGE_FAILURE';";
  await prisma.$executeRawUnsafe(`CREATE FUNCTION audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${condition} END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER audit_failure BEFORE ${operation} ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_failure()`);
}
async function clearFault() {
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS audit_failure() CASCADE');
}
function barrier() {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const ready = new Promise<void>(r => { entered = r; });
  return { gate, ready, release, entered };
}

beforeAll(() => {
  const u = new URL(process.env.DATABASE_URL!);
  if (process.env.ASSIGNMENT_AUDIT !== '1' || !u.pathname.startsWith('/mijin_assignment_audit_') || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw new Error('Run node scripts/assignment-audit.mjs; an isolated local DB is mandatory');
});
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  await prisma.$executeRawUnsafe('TRUNCATE "ServiceRequest", "User", "AppSettings", "SmsLog", "EggLedger" CASCADE');
  await settings();
});
afterEach(async () => { await clearFault(); await new Promise(r => setTimeout(r, 10)); });
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$executeRawUnsafe('TRUNCATE "ServiceRequest", "User", "AppSettings", "SmsLog", "EggLedger" CASCADE');
  await prisma.$disconnect();
});

describe('E — 후보 자격 및 수동배정 전 조합', () => {
  for (const kind of kinds) for (const active of [false, true]) for (const approval of ['PENDING', 'REJECTED', 'APPROVED'] as const) {
    for (const contract of (kind === 'TECHNICIAN' ? [null, 'DRAFT', 'SUBMITTED', 'CONFIRMED'] as const : ['CONFIRMED'] as const)) {
      it(`E ${kind} active=${active} approval=${approval} contract=${contract}`, async () => {
        const t = await target(kind, { isActive: active, approvalStatus: approval }, contract);
        const req = await request();
        const eligible = active && approval === 'APPROVED' && (kind === 'PROVIDER' || contract === 'CONFIRMED');
        expect((await matching.getCandidates(req)).map(c => c.key)).toEqual(eligible ? [`${kind}:${t.id}`] : []);
        expect((await adminCall(manualAssign, req.id, { assigneeKind: kind, assigneeId: t.id })).status).toBe(eligible ? 200 : 400);
        expect((await state(req.id)).assignments).toHaveLength(eligible ? 1 : 0);
      });
    }
  }
});

describe('A — 자동배정 진입·지역·순위·대기시간', () => {
  it.each([false, null])('A01 토글 %s 또는 설정 없음은 즉시배정·워커 모두 중지', async flag => {
    await target(); const req = await request({ assignBaseAt: new Date(0) });
    if (flag === null) await prisma.appSettings.deleteMany(); else await settings(false);
    await autoAssignNewRequest(req.id);
    expect(await runAutoAssign()).toEqual({ assigned: 0, recalled: 0 });
    expect((await state(req.id)).assignments).toHaveLength(0);
  });
  it.each(urgencies)('A02 %s 접수 직후 대기시간 없이 1순위 배정, 중복 실행 무해', async urgency => {
    const poor = await target('PROVIDER', { eggBalance: 0 });
    const rich = await target('TECHNICIAN', { eggBalance: 30 });
    const req = await request({ urgency, needsAttention: true });
    const candidates = await matching.getCandidates(req, { withStats: true });
    expect(candidates[findAutoAssignCandidateIndex(candidates)].id).toBe(rich.id);
    await autoAssignNewRequest(req.id); await autoAssignNewRequest(req.id);
    const s = await state(req.id);
    expect(s).toMatchObject({ status: 'ASSIGNED', needsAttention: false });
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0]).toMatchObject({ technicianId: rich.id, providerId: null, assignedBy: 'AUTO', status: 'REQUESTED' });
    expect(await prisma.eggLedger.count()).toBe(0);
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: poor.id } })).eggBalance).toBe(0);
    await vi.waitFor(() => expect(sendSms).toHaveBeenCalledTimes(1));
  });
  it.each(['ASSIGNED', 'ACCEPTED', 'DISPATCHED', 'COMPLETED', 'CANCELED'] as RequestStatus[])('A03 %s 접수는 즉시배정에서 제외', async status => {
    await target(); const req = await request({ status });
    await autoAssignNewRequest(req.id); await autoAssignNewRequest('missing');
    expect((await state(req.id)).assignments).toHaveLength(0);
  });
  it.each([null, '', '지역을 알 수 없음'])('A04 주소 %s는 관리자 반환, 반복 알림 없음', async address => {
    await target(); const req = await request({ address });
    await autoAssignNewRequest(req.id); await autoAssignNewRequest(req.id);
    expect(await state(req.id)).toMatchObject({ status: 'RECEIVED', needsAttention: true, assignments: [] });
    expect(notifyAdminAttention).toHaveBeenCalledTimes(1);
  });
  it.each([[], ['서울특별시'], ['서울특별시 강남구'], ['부산광역시']].map(regions => ({ regions })))('A05 서비스 지역 $regions와 좌표 없음의 실제 필터', async ({ regions }) => {
    const t = await target('PROVIDER', { regions, lat: null, lng: null });
    const req = await request({ lat: null, lng: null });
    await autoAssignNewRequest(req.id);
    const s = await state(req.id);
    if (regions[0] === '부산광역시') expect(s).toMatchObject({ status: 'RECEIVED', needsAttention: true, assignments: [] });
    else expect(s.assignments[0]).toMatchObject({ providerId: t.id, distanceKm: null });
  });
  it('A06 후보 0명 → 관리자 반환', async () => {
    const req = await request(); await autoAssignNewRequest(req.id);
    expect(await state(req.id)).toMatchObject({ status: 'RECEIVED', needsAttention: true, assignments: [] });
  });
  it.each(['REJECTED', 'EXPIRED', 'CANCELED'] as AssignmentStatus[])('A07 %s 이력 후보는 자동 제외, 수동 재선택 허용', async status => {
    const t = await target(); const req = await request();
    await prisma.assignment.create({ data: { requestId: req.id, ...fk(t), assignedBy: 'AUTO', status } });
    await autoAssignNewRequest(req.id);
    expect((await state(req.id)).assignments).toHaveLength(1);
    expect((await adminCall(manualAssign, req.id, { assigneeKind: t.kind, assigneeId: t.id })).status).toBe(200);
    expect((await state(req.id)).assignments).toHaveLength(2);
  });
  for (const urgency of urgencies) for (const offset of [-1, 0, 1]) {
    it(`A08 ${urgency} 워커 마감 ${offset}ms 경계`, async () => {
      await target(); const wait = { CRITICAL: 1, URGENT: 2, NORMAL: 3 }[urgency];
      // runAutoAssign uses new Date(), so freeze Date itself for the deadline boundary.
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
      try {
        const req = await request({ urgency, assignBaseAt: new Date(NOW.getTime() - wait * 60_000 + offset) });
        expect((await runAutoAssign()).assigned).toBe(offset <= 0 ? 1 : 0);
        expect((await state(req.id)).assignments).toHaveLength(offset <= 0 ? 1 : 0);
      } finally { vi.useRealTimers(); }
    });
  }
});

describe('M — 수동 배정 예외·권한·경합', () => {
  it.each(urgencies)('M01 %s 지역 밖·거리 없음·알 0 후보도 명시적 수동 배정 허용', async urgency => {
    const t = await target('TECHNICIAN', { regions: ['부산광역시'], lat: null, lng: null });
    const req = await request({ urgency, address: null });
    expect((await adminCall(manualAssign, req.id, { assigneeKind: t.kind, assigneeId: t.id })).status).toBe(200);
    expect((await state(req.id)).assignments[0]).toMatchObject({ assignedBy: 'ADMIN', distanceKm: null });
  });
  it.each(['ASSIGNED', 'ACCEPTED', 'DISPATCHED', 'COMPLETED', 'CANCELED'] as RequestStatus[])('M02 %s는 409, 배정 이력 추가 없음', async status => {
    const t = await target(); const req = await request({ status });
    expect((await adminCall(manualAssign, req.id, { assigneeKind: t.kind, assigneeId: t.id })).status).toBe(409);
    expect((await state(req.id)).assignments).toHaveLength(0);
  });
  it('M03 미인증·타 역할·미존재 대상·미존재 접수·입력 검증', async () => {
    const t = await target(); const req = await request(); const body = { assigneeKind: t.kind, assigneeId: t.id };
    expect((await call(manualAssign, req.id, body)).status).toBe(401);
    expect((await targetCall(t, manualAssign, req.id, body)).status).toBe(401);
    expect((await adminCall(manualAssign, 'missing', body)).status).toBe(404);
    for (const invalid of [{}, { assigneeKind: 'ADMIN', assigneeId: t.id }, { assigneeKind: 'PROVIDER', assigneeId: '' }]) expect((await adminCall(manualAssign, req.id, invalid)).status).toBe(400);
    expect((await adminCall(manualAssign, req.id, { ...body, assigneeId: 'missing' })).status).toBe(400);
  });
  it('M04 자동 10개 + 수동 10개 동시 배정 → 단일 이력·문자', async () => {
    const t = await target(); const req = await request();
    await Promise.all(Array.from({ length: 20 }, (_, i) => i % 2 ? autoAssignNewRequest(req.id) : adminCall(manualAssign, req.id, { assigneeKind: t.kind, assigneeId: t.id })));
    expect((await state(req.id)).assignments).toHaveLength(1);
    await vi.waitFor(() => expect(sendSms).toHaveBeenCalledTimes(1));
  });
});

describe('T — 무응답 회수', () => {
  for (const kind of kinds) for (const urgency of urgencies) for (const offset of [-1, 0, 1]) {
    it(`T01 ${kind} ${urgency} 10분 ${offset}ms 경계`, async () => {
      const t = await target(kind); const { req, a } = await pending(t, { urgency }, 'ADMIN', 600_000 + offset);
      expect((await recallStaleAssignments(false)).recalled).toBe(offset >= 0 ? 1 : 0);
      const s = await state(req.id);
      expect(s.status).toBe(offset >= 0 ? 'RECEIVED' : 'ASSIGNED');
      expect(s.assignments.find(x => x.id === a.id)?.status).toBe(offset >= 0 ? 'EXPIRED' : 'REQUESTED');
    });
  }
  it.each(kinds)('T02 %s 무응답 → 기존 대상 제외 → 상대 종류 후보 배정', async kind => {
    const old = await target(kind, { eggBalance: 100 });
    const next = await target(kind === 'PROVIDER' ? 'TECHNICIAN' : 'PROVIDER');
    const { req } = await pending(old, {}, 'AUTO', 600_000);
    expect(await recallStaleAssignments(true)).toEqual({ recalled: 1 });
    const s = await state(req.id);
    expect(s.status).toBe('ASSIGNED'); expect(s.assignments).toHaveLength(2);
    expect(s.assignments.find(a => a.status === 'REQUESTED')).toMatchObject(fk(next));
    expect(await recallStaleAssignments(true)).toEqual({ recalled: 0 });
  });
  it('T03 후보 소진 및 토글 꺼짐은 관리자 반환, 재실행 중복 회수 없음', async () => {
    const t = await target(); const { req } = await pending(t, {}, 'AUTO', 600_000);
    await settings(false); expect((await runAutoAssign()).recalled).toBe(1);
    expect(await state(req.id)).toMatchObject({ status: 'RECEIVED', needsAttention: true });
    expect(await runAutoAssign()).toEqual({ assigned: 0, recalled: 0 });
  });
  it.each(['ACCEPTED', 'REJECTED', 'CANCELED', 'EXPIRED'] as AssignmentStatus[])('T04 이미 %s 배정은 시간 초과 처리 제외', async status => {
    const t = await target(); const { a } = await pending(t, {}, 'AUTO', 999_999);
    await prisma.assignment.update({ where: { id: a.id }, data: { status } });
    expect(await recallStaleAssignments(true)).toEqual({ recalled: 0 });
  });
  it('T05 워커 10개 동시 실행도 회수·재배정 각 한 번', async () => {
    const t = await target(); await target('TECHNICIAN'); const { req } = await pending(t, {}, 'AUTO', 600_000);
    const results = await Promise.all(Array.from({ length: 10 }, () => recallStaleAssignments(true)));
    expect(results.reduce((n, r) => n + r.recalled, 0)).toBe(1);
    expect((await state(req.id)).assignments).toHaveLength(2);
  });
});

describe('R — 수락·거절·재배정 실제 상태 전이', () => {
  for (const kind of kinds) {
    it(`R01 ${kind} 수락 중복 요청 → 한 번만 알 차감`, async () => {
      const t = await target(kind, { eggBalance: 2 }); const { req, a } = await pending(t);
      const res = await Promise.all([accept(t, a.id), accept(t, a.id)]);
      expect(res.map(r => r.status).sort()).toEqual([200, 409]);
      expect((await state(req.id)).status).toBe('ACCEPTED');
      expect(await prisma.eggLedger.count({ where: { assignmentId: a.id } })).toBe(1);
    });
    it(`R02 ${kind} 거절 → 다른 종류의 다음 순위 후보`, async () => {
      const t = await target(kind); const next = await target(kind === 'PROVIDER' ? 'TECHNICIAN' : 'PROVIDER');
      const { req, a } = await pending(t);
      expect(await (await reject(t, a.id)).json()).toMatchObject({ reassigned: true });
      const s = await state(req.id); expect(s.status).toBe('ASSIGNED');
      expect(s.assignments.find(x => x.status === 'REQUESTED')).toMatchObject(fk(next));
      expect((await reject(t, a.id)).status).toBe(409);
      expect(await prisma.eggLedger.count()).toBe(0);
    });
    it(`R03 ${kind} 수동배정 거절은 후보가 있어도 관리자 반환`, async () => {
      const t = await target(kind); await target(); const { req, a } = await pending(t, {}, 'ADMIN');
      expect(await (await reject(t, a.id)).json()).toMatchObject({ reassigned: false });
      expect(await state(req.id)).toMatchObject({ status: 'RECEIVED', needsAttention: true });
    });
    it(`R04 ${kind} 좌표 없는 다음 후보는 거절 즉시 재배정 제외, 워커는 허용`, async () => {
      const t = await target(kind); const next = await target('PROVIDER', { lat: null, lng: null });
      const { req, a } = await pending(t);
      expect(await (await reject(t, a.id)).json()).toMatchObject({ reassigned: false });
      await prisma.serviceRequest.update({ where: { id: req.id }, data: { assignBaseAt: new Date(0) } });
      await runAutoAssign(); expect((await state(req.id)).assignments.find(x => x.status === 'REQUESTED')).toMatchObject(fk(next));
    });
    it(`R05 ${kind} 기존 AUTO 건은 토글 OFF 후 거절해도 다음 후보 배정 (현행 정책)`, async () => {
      const t = await target(kind); await target(); const { a } = await pending(t); await settings(false);
      expect(await (await reject(t, a.id)).json()).toMatchObject({ reassigned: true });
    });
    it(`R06 ${kind} 다른 소유자 수락·거절은 404`, async () => {
      const owner = await target(kind); const stranger = await target(kind); const { a } = await pending(owner);
      expect((await accept(stranger, a.id)).status).toBe(404); expect((await reject(stranger, a.id)).status).toBe(404);
    });
    for (const action of ['reject', 'recall', 'unassign', 'cancel'] as const) {
      it(`R07 ${kind} 수락 vs ${action} 동시 경합 불변식`, async () => {
        const t = await target(kind, { eggBalance: 1 }); const { req, a } = await pending(t, {}, 'ADMIN', 600_000);
        await Promise.all([accept(t, a.id), action === 'reject' ? reject(t, a.id) : action === 'recall' ? recallStaleAssignments(false) : adminCall(action === 'unassign' ? unassign : cancel, req.id)]);
        const s = await state(req.id); const active = s.assignments.filter(x => ['REQUESTED', 'ACCEPTED'].includes(x.status));
        expect(active.length).toBeLessThanOrEqual(1);
        if (s.status === 'ACCEPTED') expect(active[0]?.status).toBe('ACCEPTED');
        else expect(active).toHaveLength(0);
        expect(s.status).not.toBe('ASSIGNED');
      });
    }
    for (const status of ['RECEIVED', 'ACCEPTED', 'DISPATCHED', 'COMPLETED', 'CANCELED'] as const) {
      it(`R08 ${kind} 접수 ${status}의 오래된 REQUESTED 배정은 수락·거절 모두 409`, async () => {
        const t = await target(kind); const { req, a } = await pending(t);
        await prisma.serviceRequest.update({ where: { id: req.id }, data: { status } });
        expect((await accept(t, a.id)).status).toBe(409);
        expect((await reject(t, a.id)).status).toBe(409);
        expect((await state(req.id)).status).toBe(status);
        expect((await state(req.id)).assignments[0].status).toBe('REQUESTED');
        expect(await prisma.eggLedger.count()).toBe(0);
      });
    }
  }
});

describe('S — 30일 통계·평점·후보 표시 일치', () => {
  it.each(kinds)('S01 %s 30일 경계 포함, 수락+거절만 합산, 미응답 제외, 평점 기본 3', async kind => {
    const t = await target(kind); const empty = await target(kind);
    for (const [status, offset] of [['ACCEPTED', 0], ['REJECTED', 1], ['ACCEPTED', -1], ['REQUESTED', 1], ['EXPIRED', 1], ['CANCELED', 1]] as const) {
      const req = await request({ status: 'COMPLETED' });
      await prisma.assignment.create({ data: { requestId: req.id, ...fk(t), assignedBy: 'AUTO', status, respondedAt: new Date(NOW.getTime() - 30 * 86400_000 + offset) } });
    }
    for (const rating of [1, 5, null]) {
      const req = await request({ status: 'COMPLETED' });
      await prisma.satisfactionSurvey.create({ data: { requestId: req.id, ...fk(t), token: crypto.randomUUID(), rating } });
    }
    const stats = await getRankingStats(kind === 'PROVIDER' ? [t.id, empty.id] : [], kind === 'TECHNICIAN' ? [t.id, empty.id] : []);
    const prefix = kind === 'PROVIDER' ? 'p:' : 't:';
    expect(stats.get(prefix + t.id)).toEqual({ assigned30d: 2, avgRating: 3, reviewCount: 2 });
    expect(stats.get(prefix + empty.id)).toEqual({ assigned30d: 0, avgRating: 3, reviewCount: 0 });
  });
});

describe('F — 저장 장애·의도적 경합 재현 (전체 상태가 원자적으로 유지되어야 함)', () => {
  it('F01 배정 INSERT 실패 시 접수 ASSIGNED 전이도 롤백', async () => {
    const t = await target(); const req = await request(); await fault('Assignment', 'INSERT');
    await expect(claimAndAssign({ requestId: req.id, target: t, assignedBy: 'ADMIN' })).rejects.toThrow('AUDIT_INJECTED_STORAGE_FAILURE');
    expect(await state(req.id)).toMatchObject({ status: 'RECEIVED', assignments: [] });
    expect(sendSms).not.toHaveBeenCalled();
  });
  it('F02 즉시배정 저장 실패 뒤 워커가 재시도하여 정상 배정', async () => {
    const t = await target(); const req = await request({ assignBaseAt: new Date(0) }); await fault('Assignment', 'INSERT');
    await autoAssignNewRequest(req.id); await clearFault(); await runAutoAssign();
    expect((await state(req.id)).assignments[0]).toMatchObject(fk(t));
  });
  for (const kind of kinds) for (const action of ['accept', 'reject', 'recall', 'unassign'] as const) {
    it(`F03 ${kind} ${action} 접수 UPDATE 실패 시 배정 응답도 롤백`, async () => {
      const t = await target(kind); const { req, a } = await pending(t, {}, 'ADMIN', 600_000);
      await fault('ServiceRequest', 'UPDATE');
      const op = action === 'accept' ? accept(t, a.id) : action === 'reject' ? reject(t, a.id) : action === 'recall' ? recallStaleAssignments(false) : adminCall(unassign, req.id);
      if (action === 'recall') await expect(op).resolves.toEqual({ recalled: 0 });
      else await expect(op).rejects.toThrow('AUDIT_INJECTED_STORAGE_FAILURE');
      expect(await state(req.id)).toMatchObject({ status: 'ASSIGNED', assignments: [expect.objectContaining({ status: 'REQUESTED', respondedAt: null })] });
    });
  }
  it('F04 취소 배정 UPDATE 실패 시 접수 취소도 롤백', async () => {
    const t = await target(); const { req } = await pending(t); await fault('Assignment', 'UPDATE');
    await expect(adminCall(cancel, req.id)).rejects.toThrow('AUDIT_INJECTED_STORAGE_FAILURE');
    expect(await state(req.id)).toMatchObject({ status: 'ASSIGNED', assignments: [expect.objectContaining({ status: 'REQUESTED' })] });
  });
  it.each(kinds)('F05 %s 거절 후보 조회 중 관리자 취소 → 취소된 접수에 신규 배정 금지', async kind => {
    const t = await target(kind); await target(); const { req, a } = await pending(t);
    const b = barrier(); const original = matching.getCandidates;
    vi.spyOn(matching, 'getCandidates').mockImplementationOnce(async (...args) => { b.entered(); await b.gate; return original(...args); });
    const inflight = reject(t, a.id);
    try { await b.ready; expect((await adminCall(cancel, req.id)).status).toBe(200); }
    finally { b.release(); }
    await inflight;
    const s = await state(req.id); expect(s.status).toBe('CANCELED');
    expect(s.assignments.filter(x => x.status === 'REQUESTED')).toHaveLength(0);
  });
  it('F06 후보 없음 동시 워커 10개 → 관리자 알림 한 번', async () => {
    const req = await request(); await Promise.all(Array.from({ length: 10 }, () => autoAssignNewRequest(req.id)));
    expect(notifyAdminAttention).toHaveBeenCalledTimes(1);
  });
  it('F07 첫 접수의 후보 조회 오류가 뒤의 정상 접수를 막지 않는다', async () => {
    await target(); const broken = await request({ assignBaseAt: new Date(0) }); const healthy = await request({ assignBaseAt: new Date(1) });
    const original = matching.getCandidates;
    vi.spyOn(matching, 'getCandidates').mockImplementation(async (...args) => {
      if (args[0].id === broken.id) throw new Error('AUDIT_CANDIDATE_QUERY_FAILURE');
      return original(...args);
    });
    await expect(runAutoAssign()).resolves.toMatchObject({ assigned: 1 });
    expect((await state(broken.id)).status).toBe('RECEIVED');
    expect((await state(healthy.id)).status).toBe('ASSIGNED');
  });
  it('F08 회수 1건 저장 오류가 다른 회수 및 신규 배정을 막지 않는다', async () => {
    const t = await target(); const broken = await pending(t, {}, 'ADMIN', 600_000);
    const healthy = await pending(t, {}, 'ADMIN', 600_000); const fresh = await request({ assignBaseAt: new Date(0) });
    await fault('ServiceRequest', 'UPDATE', broken.req.id);
    await expect(runAutoAssign()).resolves.toMatchObject({ recalled: 1, assigned: 1 });
    expect((await state(broken.req.id)).assignments[0].status).toBe('REQUESTED');
    expect((await state(healthy.req.id)).assignments[0].status).toBe('EXPIRED');
    expect((await state(fresh.id)).status).toBe('ASSIGNED');
  });
  for (const kind of kinds) for (const revoked of ['inactive', 'approval'] as const) {
    it(`F09 ${kind} 후보 조회 직후 ${revoked} 변경 시 배정하지 않는다`, async () => {
      const t = await target(kind); const req = await request(); const original = matching.getCandidates;
      vi.spyOn(matching, 'getCandidates').mockImplementationOnce(async (...args) => {
        const candidates = await original(...args);
        const data = revoked === 'inactive' ? { isActive: false } : { approvalStatus: 'REJECTED' as const };
        if (kind === 'PROVIDER') await prisma.provider.update({ where: { id: t.id }, data });
        else await prisma.technician.update({ where: { id: t.id }, data });
        return candidates;
      });
      await autoAssignNewRequest(req.id);
      expect((await state(req.id)).assignments).toHaveLength(0);
      expect((await state(req.id)).status).toBe('RECEIVED');
    });
  }
  it('F10 기사 계약 확정 철회가 후보 조회 직후에도 적용된다', async () => {
    const t = await target('TECHNICIAN'); const req = await request(); const original = matching.getCandidates;
    vi.spyOn(matching, 'getCandidates').mockImplementationOnce(async (...args) => {
      const candidates = await original(...args);
      await prisma.employmentContract.update({ where: { technicianId: t.id }, data: { status: 'DRAFT' } });
      return candidates;
    });
    await autoAssignNewRequest(req.id); expect((await state(req.id)).assignments).toHaveLength(0);
  });
  it.each(kinds)('F11 %s 수동배정 사전조회 직후 영업 중지 → 400, 상태 롤백', async kind => {
    const t = await target(kind); const req = await request();
    const original = assignmentFunctions.claimAndAssign;
    vi.spyOn(assignmentFunctions, 'claimAndAssign').mockImplementationOnce(async args => {
      if (kind === 'PROVIDER') await prisma.provider.update({ where: { id: t.id }, data: { isActive: false } });
      else await prisma.technician.update({ where: { id: t.id }, data: { isActive: false } });
      return original(args);
    });
    expect((await adminCall(manualAssign, req.id, { assigneeKind: kind, assigneeId: t.id })).status).toBe(400);
    expect(await state(req.id)).toMatchObject({ status: 'RECEIVED', assignments: [] });
  });
  it('F12 배정 문자 전송 오류가 이미 커밋된 배정을 취소하지 않는다', async () => {
    const t = await target(); const req = await request();
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('AUDIT_SMS_FAILURE'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await claimAndAssign({ requestId: req.id, target: t, assignedBy: 'AUTO' })).toBe(true);
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith('[assignment] 배정 문자 발송 실패', expect.any(Error)));
    expect((await state(req.id)).assignments).toHaveLength(1);
    expect((await state(req.id)).status).toBe('ASSIGNED');
  });
});
