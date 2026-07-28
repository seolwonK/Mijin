import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 계약 게이트 (계획 5b) — 기술자 가입에는 승인 대기가 없다(signup-api.spec.ts 참조).
// 실제 배정 게이트는 **근로계약서 CONFIRMED** 이며 단 한 줄이 강제한다:
//   src/lib/matching.ts:50-55  technician.findMany({ where: { contract: { status: 'CONFIRMED' } } })
//
// ⚠️ 순서는 절대 단언하지 않는다. 카카오 지오코딩을 실호출하므로 좌표가 null 인
//    기술자가 생길 수 있고, matching.ts:125-128 이 그런 후보를 최하위로 민다.
//    "N번째" 단언은 구조적으로 flaky 하다 — **멤버십만** 본다.
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

type Pw = PlaywrightWorkerArgs['playwright'];

async function adminCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(await apiContextOptions('ADMIN', {}, ipHeaders(seed)));
}

/** 후보 목록에서 이 기술자의 안정 키(matching.ts:12)가 보이는지. */
async function candidateKeys(ctx: APIRequestContext, requestId: string): Promise<string[]> {
  const res = await ctx.get(`/api/admin/requests/${requestId}/candidates`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.candidates)).toBe(true);
  return (body.candidates as Array<{ key: string }>).map((c) => c.key);
}

const techKey = (technicianId: string) => `TECHNICIAN:${technicianId}`;

test.describe('배정 후보 계약 게이트', () => {
  test('계약이 없거나 DRAFT·SUBMITTED 인 기술자는 후보에서 제외된다', async ({ playwright }) => {
    const ctx = await adminCtx(playwright, 'gate-absent');
    const req = await f.createRequestFixture({ address: '서울특별시 강남구 테헤란로 1' });

    const noContract = await f.createTechFixture({ address: '서울특별시 강남구 테헤란로 2' });
    const draft = await f.createTechFixture({
      contractStatus: 'DRAFT',
      address: '서울특별시 강남구 테헤란로 3',
    });
    const submitted = await f.createTechFixture({
      contractStatus: 'SUBMITTED',
      address: '서울특별시 강남구 테헤란로 4',
    });
    // 음성 대조군 — 게이트가 "아무도 통과 못 시키는" 하네스 결함이 아님을 증명한다.
    const confirmed = await f.createTechFixture({
      contractStatus: 'CONFIRMED',
      address: '서울특별시 강남구 테헤란로 5',
    });

    const keys = await candidateKeys(ctx, req.id);
    expect(keys).not.toContain(techKey(noContract.technicianId));
    expect(keys).not.toContain(techKey(draft.technicianId));
    expect(keys).not.toContain(techKey(submitted.technicianId));
    expect(keys).toContain(techKey(confirmed.technicianId));
    await ctx.dispose();
  });

  test('DRAFT → CONFIRMED 로 바뀌면 같은 접수의 후보에 나타난다', async ({ playwright }) => {
    const ctx = await adminCtx(playwright, 'gate-transition');
    const req = await f.createRequestFixture({ address: '서울특별시 강남구 테헤란로 1' });
    const tech = await f.createTechFixture({
      contractStatus: 'DRAFT',
      address: '서울특별시 강남구 테헤란로 6',
    });

    expect(await candidateKeys(ctx, req.id)).not.toContain(techKey(tech.technicianId));

    // 제품 경로로 확정한다 — 기술자가 계약서에 서명하면 CONFIRMED 가 된다
    // (tech/contract/route.ts:181). 게이트가 실제 사용자 행동으로 열리는지를 본다.
    const techCtx = await playwright.request.newContext(
      await apiContextOptions(
        'TECHNICIAN',
        { userId: tech.userId, technicianId: tech.technicianId },
        ipHeaders('gate-transition-tech'),
      ),
    );
    const put = await techCtx.put('/api/tech/contract', {
      data: {
        contractStartDate: new Date().toISOString().slice(0, 10),
        workLocation: '고객 현장 (출동)',
        jobDescription: '전기 설비 점검',
        workerAddress: '서울특별시 강남구 테헤란로 6',
        workerSignatureName: tech.name,
        workerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    });
    expect(put.status()).toBe(200);
    expect((await put.json()).contract.status).toBe('CONFIRMED');
    await techCtx.dispose();

    expect(await candidateKeys(ctx, req.id)).toContain(techKey(tech.technicianId));
    await ctx.dispose();
  });

  test('CONFIRMED 라도 비활성·미승인이면 후보가 아니다 (matching.ts:51-53)', async ({
    playwright,
  }) => {
    const ctx = await adminCtx(playwright, 'gate-active');
    const req = await f.createRequestFixture({ address: '서울특별시 강남구 테헤란로 1' });

    const inactive = await f.createTechFixture({
      contractStatus: 'CONFIRMED',
      isActive: false,
      address: '서울특별시 강남구 테헤란로 7',
    });
    const unapproved = await f.createTechFixture({
      contractStatus: 'CONFIRMED',
      approvalStatus: 'PENDING',
      address: '서울특별시 강남구 테헤란로 8',
    });
    const ok = await f.createTechFixture({
      contractStatus: 'CONFIRMED',
      address: '서울특별시 강남구 테헤란로 9',
    });

    const keys = await candidateKeys(ctx, req.id);
    expect(keys).not.toContain(techKey(inactive.technicianId));
    expect(keys).not.toContain(techKey(unapproved.technicianId));
    expect(keys).toContain(techKey(ok.technicianId));
    await ctx.dispose();
  });

  test('후보 항목은 계약 게이트 통과 후 표시 계약(shape)을 채운다', async ({ playwright }) => {
    const ctx = await adminCtx(playwright, 'gate-shape');
    const req = await f.createRequestFixture({ address: '서울특별시 강남구 테헤란로 1' });
    const tech = await f.createTechFixture({
      contractStatus: 'CONFIRMED',
      regions: ['서울특별시 강남구'],
      address: '서울특별시 강남구 테헤란로 10',
    });

    const res = await ctx.get(`/api/admin/requests/${req.id}/candidates`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const mine = (body.candidates as Array<Record<string, unknown>>).find(
      (c) => c.key === techKey(tech.technicianId),
    );
    expect(mine).toBeDefined();
    expect(mine!.kind).toBe('TECHNICIAN');
    expect(mine!.id).toBe(tech.technicianId);
    expect(mine!.name).toBe(tech.name);
    expect(mine!.isActive).toBe(true);
    expect(mine!.rejectedThisRequest).toBe(false);
    // withStats:true 라 CRITICAL 이 아니어도 통계가 채워져 있어야 한다(candidates/route.ts:22).
    expect(typeof mine!.assigned30d).toBe('number');
    expect(typeof mine!.avgRating).toBe('number');
    expect(typeof mine!.reviewCount).toBe('number');
    // 이 접수 지역을 담당하도록 등록했으므로 커버로 잡혀야 한다.
    expect(mine!.coversRegion).toBe(true);
    await ctx.dispose();
  });

  test('이 접수를 거절한 기술자는 후보에 남되 rejectedThisRequest 로 표시된다', async ({
    playwright,
  }) => {
    const ctx = await adminCtx(playwright, 'gate-rejected');
    const req = await f.createRequestFixture({
      status: 'ASSIGNED',
      address: '서울특별시 강남구 테헤란로 1',
    });
    const tech = await f.createTechFixture({
      contractStatus: 'CONFIRMED',
      address: '서울특별시 강남구 테헤란로 11',
    });
    await prisma.assignment.create({
      data: {
        requestId: req.id,
        technicianId: tech.technicianId,
        status: 'REJECTED',
        assignedBy: 'ADMIN',
        respondedAt: new Date(),
      },
    });

    const res = await ctx.get(`/api/admin/requests/${req.id}/candidates`);
    expect(res.status()).toBe(200);
    const mine = ((await res.json()).candidates as Array<Record<string, unknown>>).find(
      (c) => c.key === techKey(tech.technicianId),
    );
    expect(mine).toBeDefined();
    expect(mine!.rejectedThisRequest).toBe(true);
    await ctx.dispose();
  });

  test('존재하지 않는 접수의 후보 조회는 404 (candidates/route.ts:18-20)', async ({
    playwright,
  }) => {
    const ctx = await adminCtx(playwright, 'gate-404');
    const res = await ctx.get('/api/admin/requests/e2e-no-such-request/candidates');
    expect(res.status()).toBe(404);

    // 양성 대조 — 실제 접수 id 로는 같은 엔드포인트가 200 이다.
    // 없으면 위 404 는 "이 라우트가 늘 404"(예: 경로 오타)와 구분되지 않는다.
    const real = await f.createRequestFixture({ address: '서울특별시 강남구 테헤란로 1' });
    expect((await ctx.get(`/api/admin/requests/${real.id}/candidates`)).status()).toBe(200);
    await ctx.dispose();
  });
});
