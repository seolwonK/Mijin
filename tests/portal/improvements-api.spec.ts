import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { apiContextOptions } from '../helpers/auth';
const prisma = new PrismaClient();
let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});
test.afterAll(async () => {
  await prisma.$disconnect();
});
for (const scope of ['partner', 'tech'] as const) {
  test(`${scope}: 100건을 넘은 과거 이력 뒤의 활성 배정과 동일 시각 커서`, async ({
    playwright,
  }) => {
    const me =
      scope === 'partner'
        ? await f.createPartnerFixture()
        : await f.createTechFixture();
    const other =
      scope === 'partner'
        ? await f.createPartnerFixture()
        : await f.createTechFixture();
    const owner =
      'providerId' in me
        ? { providerId: me.providerId }
        : { technicianId: me.technicianId };
    const otherOwner =
      'providerId' in other
        ? { providerId: other.providerId }
        : { technicianId: other.technicianId };
    const request = await f.createRequestFixture({
      status: 'ASSIGNED',
      description: '이력 검색 확인',
      lat: 37.5,
      lng: 127,
    });
    const createdAt = new Date();
    await prisma.assignment.createMany({
      data: Array.from({ length: 103 }, () => ({
        ...owner,
        requestId: request.id,
        status: 'REJECTED' as const,
        assignedBy: 'ADMIN' as const,
        createdAt,
      })),
    });
    const waiting = await prisma.assignment.create({
      data: {
        ...owner,
        requestId: request.id,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
        createdAt: new Date(Date.now() - 86400000),
      },
    });
    const foreign = await prisma.assignment.create({
      data: {
        ...otherOwner,
        requestId: request.id,
        status: 'EXPIRED',
        assignedBy: 'ADMIN',
      },
    });
    const ctx = await playwright.request.newContext(
      await apiContextOptions(scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN', {
        userId: me.userId,
        ...owner,
      }),
    );
    try {
      const home = await (await ctx.get(`/api/${scope}/jobs`)).json();
      expect(home.totalPast).toBe(103);
      expect(home.jobs).toHaveLength(21);
      expect(
        home.jobs.find((j: { id: string }) => j.id === waiting.id).request,
      ).toMatchObject({
        customerPhone: request.customerPhone,
        lat: 37.5,
        lng: 127,
      });
      const seen: string[] = [];
      let cursor: string | null = '';
      do {
        const page = await (
          await ctx.get(`/api/${scope}/jobs?view=history&cursor=${cursor}`)
        ).json();
        seen.push(...page.jobs.map((j: { id: string }) => j.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(103);
      expect(new Set(seen).size).toBe(103);
      expect(seen).not.toContain(waiting.id);
      expect(seen).not.toContain(foreign.id);
      expect(
        (
          await (
            await ctx.get(`/api/${scope}/jobs?view=history&q=없는검색어`)
          ).json()
        ).totalPast,
      ).toBe(0);
      expect(
        (
          await (
            await ctx.get(`/api/${scope}/jobs?view=history&status=EXPIRED`)
          ).json()
        ).totalPast,
      ).toBe(0);
      expect(
        (await ctx.get(`/api/${scope}/jobs?cursor=invalid`)).status(),
      ).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
  test(`${scope}: 배정 중지 상태는 순위에서 제외하고 내 정보 저장은 좌표를 보존`, async ({
    playwright,
  }) => {
    const me =
      scope === 'partner'
        ? await f.createPartnerFixture({ isActive: false, lat: 37.5, lng: 127 })
        : await f.createTechFixture({
            isActive: false,
            contractStatus: 'CONFIRMED',
            lat: 37.5,
            lng: 127,
          });
    const owner =
      'providerId' in me
        ? { providerId: me.providerId }
        : { technicianId: me.technicianId };
    const ctx = await playwright.request.newContext(
      await apiContextOptions(scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN', {
        userId: me.userId,
        ...owner,
      }),
    );
    try {
      expect(await (await ctx.get(`/api/${scope}/eggs`)).json()).toMatchObject({
        eligible: false,
        rank: null,
      });
      const profile = await (await ctx.get(`/api/${scope}/profile`)).json();
      expect(
        (
          await ctx.patch(`/api/${scope}/profile`, {
            data: {
              phone: '010-1111-2222',
              address: profile.address,
              isActive: true,
              regions: ['서울특별시 강남구'],
            },
          })
        ).status(),
      ).toBe(200);
      expect(
        await (await ctx.get(`/api/${scope}/profile`)).json(),
      ).toMatchObject({
        phone: '01011112222',
        isActive: true,
        regions: ['서울특별시 강남구'],
      });
      const row =
        'providerId' in me
          ? await prisma.provider.findUniqueOrThrow({
              where: { id: me.providerId },
            })
          : await prisma.technician.findUniqueOrThrow({
              where: { id: me.technicianId },
            });
      expect(row.lat).toBe(37.5);
      expect(row.lng).toBe(127);
      expect(await (await ctx.get(`/api/${scope}/eggs`)).json()).toMatchObject({
        eligible: true,
      });
      expect(
        (
          await ctx.patch(`/api/${scope}/profile`, { data: { phone: 'bad' } })
        ).status(),
      ).toBe(400);
      expect(
        (
          await ctx.get(`/api/${scope === 'tech' ? 'partner' : 'tech'}/profile`)
        ).status(),
      ).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });
  test(`${scope}: 수수료 51번째 내역과 정확한 전체 합계`, async ({
    playwright,
  }) => {
    const me =
      scope === 'partner'
        ? await f.createPartnerFixture()
        : await f.createTechFixture();
    const referee = await f.createTechFixture();
    const owner =
      'providerId' in me
        ? { providerId: me.providerId }
        : { technicianId: me.technicianId };
    for (let i = 0; i < 51; i++) {
      const request = await f.createRequestFixture({ status: 'COMPLETED' });
      const survey = await prisma.satisfactionSurvey.create({
        data: {
          requestId: request.id,
          technicianId: referee.technicianId,
          token: `portal-${request.id}`,
          rating: 5,
          paidAmount: 100000,
          submittedAt: new Date(),
        },
      });
      await prisma.commissionEntry.create({
        data: {
          requestId: request.id,
          surveyId: survey.id,
          technicianId: referee.technicianId,
          referrerUserId: me.userId,
          baseAmount: 100000,
          amount: 2000,
          status: i ? 'PENDING' : 'PAID',
        },
      });
    }
    const ctx = await playwright.request.newContext(
      await apiContextOptions(scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN', {
        userId: me.userId,
        ...owner,
      }),
    );
    try {
      const first = await (await ctx.get(`/api/${scope}/commissions`)).json();
      expect(first).toMatchObject({
        pendingTotal: 100000,
        paidTotal: 2000,
        totalCount: 51,
      });
      expect(first.entries).toHaveLength(50);
      const last = await (
        await ctx.get(`/api/${scope}/commissions?cursor=${first.nextCursor}`)
      ).json();
      expect(last.entries).toHaveLength(1);
      expect(last.nextCursor).toBeNull();
      expect(last.pendingTotal).toBe(100000);
      expect(
        new Set([...first.entries, ...last.entries].map((e) => e.id)).size,
      ).toBe(51);
    } finally {
      await ctx.dispose();
    }
  });
}
test('근로확인서: 조회 버전 안정성, 서명 전 변경 감지, 확정본 수정 차단', async ({
  playwright,
}) => {
  const me = await f.createTechFixture();
  const ctx = await playwright.request.newContext(
    await apiContextOptions('TECHNICIAN', {
      userId: me.userId,
      technicianId: me.technicianId,
    }),
  );
  const admin = await playwright.request.newContext(
    await apiContextOptions('ADMIN'),
  );
  try {
    const original = (await (await ctx.get('/api/tech/contract')).json())
      .contract;
    const second = (await (await ctx.get('/api/tech/contract')).json())
      .contract;
    expect(second.updatedAt).toBe(original.updatedAt);
    expect(original).toHaveProperty('insuranceAccident');
    expect(original).toHaveProperty('annualLeaveNote');
    await admin.put(`/api/admin/technicians/${me.technicianId}/contract`, {
      data: {
        wageType: 'DAILY',
        wageAmount: 150000,
        payDate: '근로 당일',
        payMethod: 'BANK_TRANSFER',
      },
    });
    const submission = {
      ...original,
      version: original.updatedAt,
      workerSignatureDataUrl: 'data:image/png;base64,aGVsbG8=',
    };
    const conflict = await ctx.put('/api/tech/contract', { data: submission });
    expect(conflict.status()).toBe(409);
    const current = (await (await ctx.get('/api/tech/contract')).json())
      .contract;
    const signed = await ctx.put('/api/tech/contract', {
      data: { ...submission, version: current.updatedAt },
    });
    expect(signed.status()).toBe(200);
    expect((await signed.json()).contract).toMatchObject({
      wageAmount: 150000,
      status: 'CONFIRMED',
    });
    expect(
      (await ctx.put('/api/tech/contract', { data: submission })).status(),
    ).toBe(409);
    expect(
      (
        await admin.put(`/api/admin/technicians/${me.technicianId}/contract`, {
          data: { wageAmount: 50000 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await (await ctx.get('/api/tech/contract')).json()).contract.wageAmount,
    ).toBe(150000);
  } finally {
    await ctx.dispose();
    await admin.dispose();
  }
});
