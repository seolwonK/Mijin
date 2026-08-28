import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 권한 회수가 **기존 세션**에 즉시 반영되는가 (결함 D7 회귀 방지)
//
// 승인 여부는 로그인 시점(api/auth/login/route.ts:48-63)에만 검사됐다. 세션 토큰은
// 7일짜리(lib/auth.ts:26)라, 승인된 업체·전기기사를 반려하거나 비활성화해도 이미 발급된
// 세션이 최대 일주일간 살아 있었다 — 반려가 접근 권한을 회수하지 못했다.
//
// approval-flow.spec.ts:99 는 "반려된 뒤 **로그인 시도**" 를 덮지만, D7 은 그 반대
// 순서다: 먼저 로그인해 세션을 쥔 다음 반려당하는 경우. 로그인 게이트만으로는 그 창을
// 막을 수 없으므로 lib/auth.ts 의 requireSession 이 요청마다 원본을 재확인한다.
//
// 각 테스트는 회수 **전** 200 을 먼저 단언한다. 그 양성 대조가 없으면 401 이 회수
// 때문인지 "이 세션은 애초에 안 됐다" 인지 구분되지 않는다 — 픽스처를 잘못 만들어
// 처음부터 막혀 있었어도 똑같이 초록이 된다.
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

async function partnerCtx(
  playwright: Pw,
  fx: { userId: string; providerId: string },
  seed: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext(
    await apiContextOptions(
      'PROVIDER',
      { userId: fx.userId, providerId: fx.providerId },
      ipHeaders(seed),
    ),
  );
}

async function techCtx(
  playwright: Pw,
  fx: { userId: string; technicianId: string },
  seed: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext(
    await apiContextOptions(
      'TECHNICIAN',
      { userId: fx.userId, technicianId: fx.technicianId },
      ipHeaders(seed),
    ),
  );
}

test('업체: 반려하면 이미 발급된 세션이 즉시 막힌다', async ({ playwright }) => {
  const p = await f.createPartnerFixture({ approvalStatus: 'APPROVED', isActive: true });
  const ctx = await partnerCtx(playwright, p, 'revoke-partner-reject');
  try {
    // 양성 대조 — 회수 전에는 열려 있다.
    expect((await ctx.get('/api/partner/jobs')).status()).toBe(200);

    await prisma.provider.update({
      where: { id: p.providerId },
      data: { approvalStatus: 'REJECTED', rejectReason: 'E2E 회수 검증' },
    });

    // 같은 컨텍스트·같은 쿠키. 토큰은 그대로 유효하지만 권한이 사라졌다.
    expect((await ctx.get('/api/partner/jobs')).status()).toBe(401);
    expect((await ctx.get('/api/partner/stats')).status()).toBe(401);
    expect((await ctx.get('/api/partner/profile')).status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});

test('업체: "영업 중지"(isActive=false)는 세션을 막지 않는다 — 자기 잠금 방지', async ({
  playwright,
}) => {
  // isActive 는 관리자의 계정 비활성화가 아니라 업체가 스스로 켜고 끄는 영업 상태다
  // (partner/profile PATCH → profile/page.tsx:189 스위치). 이걸 회수 신호로 오해해
  // 세션을 막으면, 영업 중지로 바꾸는 순간 본인 포털에서 잠겨나가고 다시 켜려면
  // 그 포털이 필요해 복구가 불가능해진다. 그 오해를 여기서 고정한다.
  const p = await f.createPartnerFixture({ approvalStatus: 'APPROVED', isActive: true });
  const ctx = await partnerCtx(playwright, p, 'revoke-partner-deactivate');
  try {
    expect((await ctx.get('/api/partner/jobs')).status()).toBe(200);

    await prisma.provider.update({ where: { id: p.providerId }, data: { isActive: false } });

    expect(
      (await ctx.get('/api/partner/jobs')).status(),
      '영업 중지는 배차에서만 빠지는 것이지 로그아웃이 아니다',
    ).toBe(200);
    // 스스로 다시 켤 수 있어야 한다 — 잠금이 아님을 증명하는 핵심 단언.
    const back = await ctx.patch('/api/partner/profile', { data: { isActive: true } });
    expect(back.status(), '영업 상태를 스스로 되돌릴 수 있어야 한다').toBe(200);
  } finally {
    await ctx.dispose();
  }
});

test('세션이 삭제된 프로필을 가리키면 401 이 아니라 라우트의 404 가 나온다', async ({
  playwright,
}) => {
  // 승인 회수와 "행이 없음" 은 다른 상황이다. 여기서 401 로 가로채면
  // tech/contract:118-120 같은 구체적 404 분기가 통째로 도달 불가가 된다.
  const ctx = await techCtx(
    playwright,
    { userId: 'e2e-missing-user', technicianId: 'e2e-missing-tech' },
    'revoke-missing-profile',
  );
  try {
    const res = await ctx.get('/api/tech/contract');
    expect(res.status(), '없는 프로필은 401 이 아니라 라우트가 404 로 설명해야 한다').toBe(404);
  } finally {
    await ctx.dispose();
  }
});

test('전기기사: 반려가 이미 발급된 세션을 즉시 막고, 재승인하면 다시 열린다', async ({
  playwright,
}) => {
  const t = await f.createTechFixture({ approvalStatus: 'APPROVED', isActive: true });
  const ctx = await techCtx(playwright, t, 'revoke-tech');
  try {
    expect((await ctx.get('/api/tech/jobs')).status()).toBe(200);

    await prisma.technician.update({
      where: { id: t.technicianId },
      data: { approvalStatus: 'REJECTED' },
    });
    expect((await ctx.get('/api/tech/jobs')).status()).toBe(401);

    // 되돌리면 다시 열린다 — 401 이 승인 상태 때문임을 못박는 두 번째 대조.
    // 이게 없으면 "이 세션은 원래 안 됐다" 와 구분되지 않는다.
    await prisma.technician.update({
      where: { id: t.technicianId },
      data: { approvalStatus: 'APPROVED' },
    });
    expect((await ctx.get('/api/tech/jobs')).status()).toBe(200);

    // PENDING 도 APPROVED 가 아니므로 동일하게 막힌다.
    await prisma.technician.update({
      where: { id: t.technicianId },
      data: { approvalStatus: 'PENDING' },
    });
    expect((await ctx.get('/api/tech/jobs')).status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});

test('관리자 세션은 재확인 대상이 아니다 (ADMIN 은 profile 이 없다)', async ({ playwright }) => {
  // requireSession 이 ADMIN 에 대해 조회를 건너뛴다는 것을 동작으로 고정한다.
  // 관리자 라우트 30개에 불필요한 PK 조회를 얹지 않기 위한 분기이므로,
  // 누가 그 분기를 지우면 성능만 나빠지고 이 테스트는 조용하다 — 대신
  // "관리자 접근이 깨지지 않는다" 를 지킨다.
  const ctx = await playwright.request.newContext(
    await apiContextOptions('ADMIN', {}, ipHeaders('revoke-admin')),
  );
  try {
    expect((await ctx.get('/api/admin/requests')).status()).toBe(200);
  } finally {
    await ctx.dispose();
  }
});
