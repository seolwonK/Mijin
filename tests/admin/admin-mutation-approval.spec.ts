import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { adminCtx } from './admin-mutation-support';

// ───────────────────────────────────────────────────────────────────────────
// 승인·반려 4핸들러 — 전기기사/업체가 완전 동형이라 한 표로 돌린다.
//
//   technicians/[id]/approve  404 :15 · 409 :18 · 200
//   technicians/[id]/reject   404 :26 · 409 :31 · 200
//   providers/[id]/approve    404 :15 · 409 :18 · 200
//   providers/[id]/reject     404 :26 · 409 :31 · 200
//
// 두 reject 는 본문 파싱 실패를 **삼킨다**(:20-22). 본문 없는 호출과 스키마를
// 벗어난 reason 이 모두 200 이고 reason 이 null 로 떨어지는 것이 현행 계약이다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

type Subject = 'technicians' | 'providers';

async function make(kind: Subject, approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED') {
  if (kind === 'technicians') {
    const t = await f.createTechFixture({ approvalStatus });
    return t.technicianId;
  }
  const p = await f.createPartnerFixture({ approvalStatus });
  return p.providerId;
}

async function readStatus(kind: Subject, id: string) {
  return kind === 'technicians'
    ? prisma.technician.findUnique({ where: { id } })
    : prisma.provider.findUnique({ where: { id } });
}

for (const kind of ['technicians', 'providers'] as const) {
  const label = kind === 'technicians' ? '전기기사' : '업체';

  test(`${label} approve — 404·409·200 과 승인 부수효과`, async ({ playwright }) => {
    const ctx = await adminCtx(playwright, `approve-${kind}`);

    // 404 :15
    const missing = await ctx.post(`/api/admin/${kind}/e2e-no-such/approve`);
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error).toBe(`${label}를 찾을 수 없습니다`);

    // 409 :18 — 이미 승인된 대상
    const approved = await make(kind, 'APPROVED');
    const dup = await ctx.post(`/api/admin/${kind}/${approved}/approve`);
    expect(dup.status()).toBe(409);
    expect((await dup.json()).error).toBe(`이미 승인된 ${label}입니다`);

    // 200 — PENDING → APPROVED (:21-24)
    const pending = await make(kind, 'PENDING');
    const ok = await ctx.post(`/api/admin/${kind}/${pending}/approve`);
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const after = await readStatus(kind, pending);
    expect(after?.approvalStatus).toBe('APPROVED');
    expect(after?.approvedAt).not.toBeNull();
    expect(after?.rejectReason).toBeNull();

    // 200 — 반려된 대상의 재승인도 허용된다 (게이트는 APPROVED 만 막는다).
    // 반려 사유가 승인과 함께 지워지는 것이 이 경로의 부수효과다.
    const rejected = await make(kind, 'REJECTED');
    await (kind === 'technicians'
      ? prisma.technician.update({ where: { id: rejected }, data: { rejectReason: '서류 미비' } })
      : prisma.provider.update({ where: { id: rejected }, data: { rejectReason: '서류 미비' } }));
    expect((await ctx.post(`/api/admin/${kind}/${rejected}/approve`)).status()).toBe(200);
    const revived = await readStatus(kind, rejected);
    expect(revived?.approvalStatus).toBe('APPROVED');
    expect(revived?.rejectReason).toBeNull();

    await ctx.dispose();
  });

  test(`${label} reject — 404·409·200 과 사유 저장 규칙`, async ({ playwright }) => {
    const ctx = await adminCtx(playwright, `reject-${kind}`);

    // 404 :26
    const missing = await ctx.post(`/api/admin/${kind}/e2e-no-such/reject`, {
      data: { reason: '서류 미비' },
    });
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error).toBe(`${label}를 찾을 수 없습니다`);

    // 409 :31 — PENDING 이 아닌 신청
    for (const status of ['APPROVED', 'REJECTED'] as const) {
      const id = await make(kind, status);
      const res = await ctx.post(`/api/admin/${kind}/${id}/reject`, { data: {} });
      expect(res.status(), status).toBe(409);
      expect((await res.json()).error).toBe('승인 대기 상태의 신청만 거절할 수 있습니다');
    }

    // 200 — PENDING → REJECTED + 사유 저장 (:35-38)
    const pending = await make(kind, 'PENDING');
    const ok = await ctx.post(`/api/admin/${kind}/${pending}/reject`, {
      data: { reason: '  사업자등록증 불일치  ' },
    });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const after = await readStatus(kind, pending);
    expect(after?.approvalStatus).toBe('REJECTED');
    // zod trim() 이 걸려 있어 공백은 저장되지 않는다.
    expect(after?.rejectReason).toBe('사업자등록증 불일치');

    // 200 — 본문 없는 호출도 허용되고 사유는 null (:16-22)
    const noBody = await make(kind, 'PENDING');
    expect((await ctx.post(`/api/admin/${kind}/${noBody}/reject`)).status()).toBe(200);
    expect((await readStatus(kind, noBody))?.rejectReason).toBeNull();

    // 200 — 스키마를 벗어난 reason(200자 초과)은 400 이 아니라 **조용히 무시**된다.
    // 라우트가 safeParse 실패를 흘려보내므로(:18-19) 현행 계약이 그렇다.
    const overlong = await make(kind, 'PENDING');
    const long = await ctx.post(`/api/admin/${kind}/${overlong}/reject`, {
      data: { reason: 'ㄱ'.repeat(201) },
    });
    expect(long.status()).toBe(200);
    const longAfter = await readStatus(kind, overlong);
    expect(longAfter?.approvalStatus).toBe('REJECTED');
    expect(longAfter?.rejectReason).toBeNull();

    await ctx.dispose();
  });
}
