import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 소유권 — 역할은 맞지만 **남의 리소스** (계획 Step 3b)
//
// src/middleware.ts:47 의 matcher 는 /admin·/partner·/tech **페이지**만 덮고
// /api/* 를 포함하지 않는다. 따라서 API 권한은 전적으로 각 라우트가 스스로
// `a.technicianId !== session.technicianId` 를 확인하는 데 달려 있다.
// 여기가 뚫리면 로그인한 아무 전기기사나 남의 고객 이름·전화번호를 읽고
// (jobs/[id]/route.ts:39-40) 남의 작업을 진행시킬 수 있다.
//
// 각 단언에는 **음성/양성 대조**를 함께 둔다: 남이면 404, 주인이면 404 가 아님.
// 대조 없이 404 만 보면 "라우트가 늘 404" 인 하네스 결함과 구분되지 않는다.
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

type Ctx = APIRequestContext;
type Pw = PlaywrightWorkerArgs['playwright'];

async function techCtx(
  playwright: Pw,
  fixture: { userId: string; technicianId: string },
  seed: string,
): Promise<Ctx> {
  return playwright.request.newContext(
    await apiContextOptions(
      'TECHNICIAN',
      { userId: fixture.userId, technicianId: fixture.technicianId },
      ipHeaders(seed),
    ),
  );
}

async function partnerCtx(
  playwright: Pw,
  fixture: { userId: string; providerId: string },
  seed: string,
): Promise<Ctx> {
  return playwright.request.newContext(
    await apiContextOptions(
      'PROVIDER',
      { userId: fixture.userId, providerId: fixture.providerId },
      ipHeaders(seed),
    ),
  );
}

// ── 전기기사 ─────────────────────────────────────────────────────────────────

test.describe('전기기사 소유권', () => {
  test('A 세션은 B 의 배정 4핸들러 전부에서 404 이고 상태를 바꾸지 못한다', async ({
    playwright,
  }) => {
    const techA = await f.createTechFixture();
    const techB = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const assignment = await prisma.assignment.create({
      data: {
        requestId: req.id,
        technicianId: techB.technicianId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });

    const a = await techCtx(playwright, techA, 'own-tech-a');
    const b = await techCtx(playwright, techB, 'own-tech-b');

    // 남의 배정 — 4핸들러 전부 404 (tech/jobs/[id]/route.ts:19-21,
    // accept:19-21, reject:34-36, status:36-38)
    const detail = await a.get(`/api/tech/jobs/${assignment.id}`);
    expect(detail.status(), 'A 가 B 의 배정 상세를 읽으면 404').toBe(404);
    expect(await detail.text()).not.toContain(req.customerPhone);

    expect((await a.post(`/api/tech/jobs/${assignment.id}/accept`)).status()).toBe(404);
    expect((await a.post(`/api/tech/jobs/${assignment.id}/reject`, { data: {} })).status()).toBe(
      404,
    );
    // status 는 zod 검증이 소유권 검사보다 **먼저** 돌기 때문에(route.ts:27-30)
    // 유효한 본문을 줘야 404 분기(:36-38)까지 도달한다.
    expect(
      (
        await a.post(`/api/tech/jobs/${assignment.id}/status`, { data: { status: 'DISPATCHED' } })
      ).status(),
    ).toBe(404);

    // 부수효과 0 — 거부가 "조용한 성공"이 아니었음을 DB 로 확인한다.
    const after = await prisma.assignment.findUnique({ where: { id: assignment.id } });
    expect(after?.status).toBe('REQUESTED');
    expect(after?.respondedAt).toBeNull();
    expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
      'ASSIGNED',
    );

    // 양성대조 — 주인은 같은 경로에서 읽힌다.
    const ownDetail = await b.get(`/api/tech/jobs/${assignment.id}`);
    expect(ownDetail.status(), 'B 는 자기 배정을 읽을 수 있어야 한다').toBe(200);
    expect((await ownDetail.json()).request.customerPhone).toBe(req.customerPhone);

    await a.dispose();
    await b.dispose();
  });

  test('주인은 accept·status·reject 를 실제로 통과한다 (404 가 무조건이 아님)', async ({
    playwright,
  }) => {
    const techB = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const first = await prisma.assignment.create({
      data: {
        requestId: req.id,
        technicianId: techB.technicianId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });
    const second = await prisma.assignment.create({
      data: {
        requestId: req.id,
        technicianId: techB.technicianId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });

    const b = await techCtx(playwright, techB, 'own-tech-b2');
    expect((await b.post(`/api/tech/jobs/${first.id}/accept`)).status()).toBe(200);
    expect(
      (await b.post(`/api/tech/jobs/${first.id}/status`, { data: { status: 'DISPATCHED' } })).status(),
    ).toBe(200);
    // assignedBy=ADMIN 이라 재배정 경로(reject/route.ts:48-66)를 타지 않고,
    // 접수는 이미 DISPATCHED 라 RECEIVED 로 되돌아가지도 않는다.
    expect((await b.post(`/api/tech/jobs/${second.id}/reject`, { data: {} })).status()).toBe(200);
    expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
      'DISPATCHED',
    );
    await b.dispose();
  });

  test('GET /api/tech/jobs 는 남의 배정을 목록에 넣지 않는다', async ({ playwright }) => {
    const techA = await f.createTechFixture();
    const techB = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const assignment = await prisma.assignment.create({
      data: {
        requestId: req.id,
        technicianId: techB.technicianId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });

    const a = await techCtx(playwright, techA, 'own-tech-list-a');
    const b = await techCtx(playwright, techB, 'own-tech-list-b');
    const mine = await a.get('/api/tech/jobs');
    expect(mine.status()).toBe(200);
    const ids = ((await mine.json()).jobs as Array<{ id: string }>).map((j) => j.id);
    expect(ids).not.toContain(assignment.id);

    const theirs = await b.get('/api/tech/jobs');
    expect(((await theirs.json()).jobs as Array<{ id: string }>).map((j) => j.id)).toContain(
      assignment.id,
    );
    await a.dispose();
    await b.dispose();
  });
});

// ── 업체 ───────────────────────────────────────────────────────────────────

test.describe('업체 소유권', () => {
  test('A 세션은 B 의 배정 4핸들러 전부에서 404 이고 상태를 바꾸지 못한다', async ({
    playwright,
  }) => {
    const partnerA = await f.createPartnerFixture();
    const partnerB = await f.createPartnerFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const assignment = await prisma.assignment.create({
      data: {
        requestId: req.id,
        providerId: partnerB.providerId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });

    const a = await partnerCtx(playwright, partnerA, 'own-partner-a');
    const b = await partnerCtx(playwright, partnerB, 'own-partner-b');

    // partner/jobs/[id]/route.ts:19-21, accept:19-21, reject:34-36, status:36-38
    const detail = await a.get(`/api/partner/jobs/${assignment.id}`);
    expect(detail.status()).toBe(404);
    expect(await detail.text()).not.toContain(req.customerPhone);

    expect((await a.post(`/api/partner/jobs/${assignment.id}/accept`)).status()).toBe(404);
    expect((await a.post(`/api/partner/jobs/${assignment.id}/reject`, { data: {} })).status()).toBe(
      404,
    );
    expect(
      (
        await a.post(`/api/partner/jobs/${assignment.id}/status`, {
          data: { status: 'DISPATCHED' },
        })
      ).status(),
    ).toBe(404);

    const after = await prisma.assignment.findUnique({ where: { id: assignment.id } });
    expect(after?.status).toBe('REQUESTED');
    expect(after?.respondedAt).toBeNull();
    expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
      'ASSIGNED',
    );

    const ownDetail = await b.get(`/api/partner/jobs/${assignment.id}`);
    expect(ownDetail.status()).toBe(200);
    expect((await ownDetail.json()).request.customerPhone).toBe(req.customerPhone);

    await a.dispose();
    await b.dispose();
  });

  test('주인은 accept·status·reject 를 실제로 통과한다 (404 가 무조건이 아님)', async ({
    playwright,
  }) => {
    const partnerB = await f.createPartnerFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const first = await prisma.assignment.create({
      data: {
        requestId: req.id,
        providerId: partnerB.providerId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });
    const second = await prisma.assignment.create({
      data: {
        requestId: req.id,
        providerId: partnerB.providerId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });

    const b = await partnerCtx(playwright, partnerB, 'own-partner-b2');
    expect((await b.post(`/api/partner/jobs/${first.id}/accept`)).status()).toBe(200);
    expect(
      (
        await b.post(`/api/partner/jobs/${first.id}/status`, { data: { status: 'DISPATCHED' } })
      ).status(),
    ).toBe(200);
    expect((await b.post(`/api/partner/jobs/${second.id}/reject`, { data: {} })).status()).toBe(200);
    expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
      'DISPATCHED',
    );
    await b.dispose();
  });

  test('GET /api/partner/jobs 는 남의 배정을 목록에 넣지 않는다', async ({ playwright }) => {
    const partnerA = await f.createPartnerFixture();
    const partnerB = await f.createPartnerFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const assignment = await prisma.assignment.create({
      data: {
        requestId: req.id,
        providerId: partnerB.providerId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });

    const a = await partnerCtx(playwright, partnerA, 'own-partner-list-a');
    const b = await partnerCtx(playwright, partnerB, 'own-partner-list-b');
    const mine = await a.get('/api/partner/jobs');
    expect(mine.status()).toBe(200);
    expect(((await mine.json()).jobs as Array<{ id: string }>).map((j) => j.id)).not.toContain(
      assignment.id,
    );

    const theirs = await b.get('/api/partner/jobs');
    expect(((await theirs.json()).jobs as Array<{ id: string }>).map((j) => j.id)).toContain(
      assignment.id,
    );
    await a.dispose();
    await b.dispose();
  });
});
