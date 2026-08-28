import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory, ephemeralLoginId, ephemeralPhone } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 전기기사 가입 계약 — POST /api/identity/verify → POST /api/tech/signup (계획 5a)
//
// ⚠️ 스펙 원문의 "가입 → 승인대기 → 어드민 승인"은 구현과 다르다.
//    src/app/api/tech/signup/route.ts:176 이 approvalStatus:'APPROVED' 를 직접 쓰고
//    :203-211 이 세션 쿠키까지 심는다 — **승인 게이트는 존재하지 않는다.**
//    실제 게이트는 근로확인서 CONFIRMED 이며 matching.ts:54 가 강제한다
//    (tests/tech/contract-gate.spec.ts 가 그쪽을 단언한다).
//    여기서는 현행 동작을 단언한다: 즉시 APPROVED + 즉시 로그인.
//
// 레이트리밋: signup 은 IP당 10분/5회(route.ts:34-48), identity/verify 는
// 10분/10회(verify/route.ts:14-28). 테스트마다 seed 를 달리해 버킷을 분리하고,
// 429 단언은 **전용 IP** 하나를 통째로 태워서만 만든다.
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

/** 무세션 컨텍스트 + 이 테스트 전용 레이트리밋 버킷. */
async function anonCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(await apiContextOptions(null, {}, ipHeaders(seed)));
}

type SignupBody = {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  address: string;
  employmentType: 'DAILY' | 'PERMANENT';
  regions?: string[];
  verificationId?: string;
  referrerUserId?: string;
};

/** 필수 필드가 채워진 가입 바디. 개별 테스트가 필요한 칸만 덮어쓴다. */
function signupBody(over: Partial<SignupBody> = {}): Partial<SignupBody> {
  return {
    loginId: ephemeralLoginId('signup'),
    password: 'e2epass1234',
    name: 'E2E 전기기사',
    phone: ephemeralPhone(),
    // regions.ts:114-126 은 풀 시/도명("서울특별시")만 인식한다.
    address: '서울특별시 강남구 테헤란로 1',
    employmentType: 'DAILY',
    ...over,
  };
}

/** 가입 API 가 만든 User 를 정리 대상으로 등록한다(팩토리는 이 행을 모른다). */
async function trackSignedUp(loginId: string) {
  const user = await prisma.user.findUnique({
    where: { loginId },
    select: { id: true, name: true, phone: true, technician: { select: { id: true } } },
  });
  if (user) f.trackUser(user.id);
  return user;
}

// ── /api/identity/verify (가입의 선행 단계) ────────────────────────────────

test.describe('POST /api/identity/verify', () => {
  test('mock provider 는 입력한 이름·번호를 그대로 인증하고 verificationId 를 발급한다', async ({
    playwright,
  }) => {
    const ctx = await anonCtx(playwright, 'iv-happy');
    const phone = ephemeralPhone();
    const res = await ctx.post('/api/identity/verify', {
      data: { name: '홍길동', phone },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.verificationId).toBe('string');
    expect(body.name).toBe('홍길동');
    expect(body.phone).toBe(phone);
    f.trackVerification(body.verificationId);

    // 발급된 행이 실제로 미소비·미만료 상태여야 가입 게이트를 통과한다.
    const row = await prisma.identityVerification.findUnique({
      where: { id: body.verificationId },
    });
    expect(row?.provider).toBe('mock');
    expect(row?.consumedAt).toBeNull();
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await ctx.dispose();
  });

  test('이름·번호가 없으면 400 (mock provider 가 거부)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'iv-empty');
    const res = await ctx.post('/api/identity/verify', { data: {} });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('이름과 휴대폰번호');
    await ctx.dispose();
  });

  test('인증된 번호 형식이 틀리면 400 (identity/index.ts:50-52)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'iv-badphone');
    const res = await ctx.post('/api/identity/verify', {
      data: { name: '홍길동', phone: '123' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('휴대폰번호 형식');
    await ctx.dispose();
  });
});

// ── /api/tech/signup ───────────────────────────────────────────────────────

test.describe('POST /api/tech/signup — 입력 게이트', () => {
  test('verificationId 누락 → 400 (route.ts:25-29)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-no-iv');
    const body = signupBody();
    const res = await ctx.post('/api/tech/signup', { data: body });
    expect(res.status()).toBe(400);
    // 메시지를 zod 원문으로 못박는다. '본인인증' 만 보면 :88/:94/:100 의 400 들과
    // 구분되지 않아, 다른 분기가 대신 발화해도 통과하는 단언이 된다.
    expect((await res.json()).error).toBe('휴대폰 본인인증을 완료해 주세요');
    expect(await prisma.user.count({ where: { loginId: body.loginId! } })).toBe(0);
    await ctx.dispose();
  });

  test('잘못된 JSON → 400 (route.ts:62-63)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-badjson');
    const res = await ctx.post('/api/tech/signup', {
      headers: { 'content-type': 'application/json' },
      data: '{ not json',
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test('이미 사용된 본인인증 → 400 (route.ts:94-99)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-consumed');
    const phone = ephemeralPhone();
    const iv = await f.createIdentityVerification({ phone, consumedAt: new Date() });
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ phone, verificationId: iv.id }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('이미 사용된 본인인증');
    await ctx.dispose();
  });

  test('만료된 본인인증 → 400 (route.ts:100-105)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-expired');
    const phone = ephemeralPhone();
    const iv = await f.createIdentityVerification({
      phone,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ phone, verificationId: iv.id }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('유효시간');
    await ctx.dispose();
  });

  test('존재하지 않는 verificationId → 400 (route.ts:88-93)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-noiv-row');
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ verificationId: 'e2e-does-not-exist' }),
    });
    expect(res.status()).toBe(400);
    // '찾을 수 없습니다' 만 보면 :135 의 '추천인을 찾을 수 없습니다' 와 겹친다.
    expect((await res.json()).error).toBe('본인인증 정보를 찾을 수 없습니다. 다시 인증해 주세요.');
    await ctx.dispose();
  });

  test('인증한 번호와 가입 번호가 다르면 400 (route.ts:106-111)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-phone-mismatch');
    const iv = await f.createIdentityVerification({ phone: ephemeralPhone() });
    const other = ephemeralPhone();
    // 두 번호가 우연히 같으면 이 테스트가 무의미해진다 — 다름을 먼저 보장한다.
    const mismatched = other === iv.phone ? `${other.slice(0, -1)}${(Number(other.slice(-1)) + 1) % 10}` : other;
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ phone: mismatched, verificationId: iv.id }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('가입 번호가 다릅니다');
    await ctx.dispose();
  });

  test('인증한 이름과 가입 이름이 다르면 400 (route.ts:112-121)', async ({ playwright }) => {
    // 번호는 맞고 이름만 다른 경우. 저장은 어차피 iv.name 을 쓰지만, 불일치를 조용히
    // 덮어쓰면 "내가 입력한 이름으로 가입됐다"고 믿는 사용자와 실제 명의가 어긋난 채 통과한다.
    const ctx = await anonCtx(playwright, 'signup-name-mismatch');
    const phone = ephemeralPhone();
    const iv = await f.createIdentityVerification({ phone, name: '김기술' });
    const body = signupBody({ phone, name: '남의이름', verificationId: iv.id });
    const res = await ctx.post('/api/tech/signup', { data: body });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('가입 이름이 다릅니다');
    // 거부됐으면 계정도, 인증 소비도 없어야 한다.
    expect(await prisma.user.count({ where: { loginId: body.loginId! } })).toBe(0);
    const row = await prisma.identityVerification.findUnique({ where: { id: iv.id } });
    expect(row?.consumedAt).toBeNull();
    await ctx.dispose();
  });

  test('공백 표기만 다른 이름은 통과한다 ("홍 길동" = "홍길동")', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-name-space');
    const body = signupBody({ name: '홍 길동' });
    const iv = await f.createIdentityVerification({ phone: body.phone, name: '홍길동' });
    const res = await ctx.post('/api/tech/signup', {
      data: { ...body, verificationId: iv.id },
    });
    expect(res.status()).toBe(200);
    const user = await trackSignedUp(body.loginId!);
    // 저장되는 값은 폼 표기가 아니라 대행사가 검증한 실명이다.
    expect(user!.name).toBe('홍길동');
    await ctx.dispose();
  });

  test('중복 loginId → 409 (route.ts:79-81)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-dup-login');
    const existing = await f.createTechFixture();
    const phone = ephemeralPhone();
    const iv = await f.createIdentityVerification({ phone });
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ loginId: existing.loginId, phone, verificationId: iv.id }),
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain('이미 사용 중인 아이디');
    // 409 는 본인인증을 소비하지 않아야 한다 (중복 검사가 소비 트랜잭션보다 앞선다).
    const row = await prisma.identityVerification.findUnique({ where: { id: iv.id } });
    expect(row?.consumedAt).toBeNull();
    await ctx.dispose();
  });
});

test.describe('POST /api/tech/signup — 추천인', () => {
  test('본인을 추천인으로 지정하면 400 (route.ts:137-142)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-self-ref');
    const me = await f.createTechFixture();
    // 자기추천 판정은 iv.phone 기준이다 — 추천인 User.phone 과 같은 번호로 인증한다.
    const iv = await f.createIdentityVerification({ phone: me.phone });
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ phone: me.phone, verificationId: iv.id, referrerUserId: me.userId }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('본인을 추천인으로');
    await ctx.dispose();
  });

  test('미승인 추천인 → 400 (route.ts:134-136)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-pending-ref');
    const pending = await f.createTechFixture({ approvalStatus: 'PENDING' });
    const phone = ephemeralPhone();
    const iv = await f.createIdentityVerification({ phone });
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ phone, verificationId: iv.id, referrerUserId: pending.userId }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('추천인을 찾을 수 없습니다');
    await ctx.dispose();
  });

  test('비활성 추천인 → 400 (route.ts:134-136 의 isActive 분기)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-inactive-ref');
    const inactive = await f.createTechFixture({ isActive: false });
    const phone = ephemeralPhone();
    const iv = await f.createIdentityVerification({ phone });
    const res = await ctx.post('/api/tech/signup', {
      data: signupBody({ phone, verificationId: iv.id, referrerUserId: inactive.userId }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('추천인을 찾을 수 없습니다');
    await ctx.dispose();
  });

  test('승인된 추천인은 referredByUserId 로 기록된다', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-ok-ref');
    const referrer = await f.createTechFixture();
    const body = signupBody();
    const iv = await f.createIdentityVerification({ phone: body.phone });
    const res = await ctx.post('/api/tech/signup', {
      data: { ...body, verificationId: iv.id, referrerUserId: referrer.userId },
    });
    expect(res.status()).toBe(200);

    const user = await trackSignedUp(body.loginId!);
    const tech = await prisma.technician.findUnique({
      where: { id: user!.technician!.id },
      select: { referredByUserId: true },
    });
    expect(tech?.referredByUserId).toBe(referrer.userId);
    await ctx.dispose();
  });
});

test.describe('POST /api/tech/signup — 성공 계약', () => {
  test('가입 즉시 APPROVED 이고 세션 쿠키가 발급된다 (route.ts:176, :203-211)', async ({
    playwright,
  }) => {
    const ctx = await anonCtx(playwright, 'signup-happy');
    const body = signupBody({
      employmentType: 'PERMANENT',
      regions: ['서울특별시 강남구'],
      name: '김기술',
    });
    const iv = await f.createIdentityVerification({ phone: body.phone, name: '김기술' });

    const res = await ctx.post('/api/tech/signup', {
      data: { ...body, verificationId: iv.id },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // ① 세션 쿠키가 응답 헤더에 실린다.
    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('mijin_session=');
    expect(setCookie).toContain('HttpOnly');

    // ② 그 쿠키만으로 전기기사 API 를 즉시 통과한다 — "자동 로그인"의 실질 단언.
    //    (APIRequestContext 가 Set-Cookie 를 쿠키 자에 보관하므로 같은 ctx 로 확인한다)
    const jobs = await ctx.get('/api/tech/jobs');
    expect(jobs.status()).toBe(200);
    expect((await jobs.json()).jobs).toEqual([]);

    // ③ 승인 대기 상태가 아니라 **즉시 APPROVED** 다. 관리자 승인 단계가 없다.
    const user = await trackSignedUp(body.loginId!);
    expect(user).not.toBeNull();
    const tech = await prisma.technician.findUnique({
      where: { id: user!.technician!.id },
      select: {
        approvalStatus: true,
        approvedAt: true,
        employmentType: true,
        regions: true,
        address: true,
      },
    });
    expect(tech?.approvalStatus).toBe('APPROVED');
    expect(tech?.approvedAt).not.toBeNull();
    expect(tech?.employmentType).toBe('PERMANENT');
    expect(tech?.regions).toEqual(['서울특별시 강남구']);
    expect(tech?.address).toBe(body.address);

    // ④ 이름·번호는 폼 입력이 아니라 **대행사가 검증한 인증 값**이 저장된다(route.ts:176-177).
    //    폼 값과의 불일치는 덮어쓰기가 아니라 400 으로 거부된다 — 위 'name-mismatch' 테스트가 그쪽을 단언한다.
    expect(user!.name).toBe('김기술');
    expect(user!.phone).toBe(body.phone);

    // ⑤ 본인인증은 소비된다 (재사용 차단의 근거).
    const consumed = await prisma.identityVerification.findUnique({ where: { id: iv.id } });
    expect(consumed?.consumedAt).not.toBeNull();
    await ctx.dispose();
  });

  test('가입한 본인인증은 두 번 쓸 수 없다 (재사용 → 400)', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-reuse');
    const first = signupBody();
    const iv = await f.createIdentityVerification({ phone: first.phone });
    expect((await ctx.post('/api/tech/signup', { data: { ...first, verificationId: iv.id } })).status()).toBe(200);
    await trackSignedUp(first.loginId!);

    const second = signupBody({ phone: first.phone });
    const res = await ctx.post('/api/tech/signup', {
      data: { ...second, verificationId: iv.id },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('이미 사용된 본인인증');
    expect(await prisma.user.count({ where: { loginId: second.loginId! } })).toBe(0);
    await ctx.dispose();
  });

  test('zod 경계 — 짧은 아이디·짧은 비밀번호·잘못된 근로형태는 400', async ({ playwright }) => {
    const ctx = await anonCtx(playwright, 'signup-zod');
    const cases: Array<[string, Partial<SignupBody>]> = [
      ['loginId 2자', { loginId: '90' }],
      ['password 7자', { password: '1234567' }],
      ['phone 형식', { phone: '0102' }],
      ['employmentType 미지원', { employmentType: 'CONTRACT' as 'DAILY' }],
      ['address 공백', { address: '   ' }],
    ];
    for (const [label, over] of cases) {
      const body = signupBody(over);
      const iv = await f.createIdentityVerification({ phone: ephemeralPhone() });
      const res = await ctx.post('/api/tech/signup', {
        data: { ...body, verificationId: iv.id },
      });
      expect(res.status(), label).toBe(400);
    }
    await ctx.dispose();
  });
});

test.describe('POST /api/tech/signup — 레이트리밋', () => {
  test('전용 IP 로 5회를 넘기면 429 (route.ts:34-48)', async ({ playwright }) => {
    // rateLimited() 가 파싱보다 **먼저** 돌기 때문에 잘못된 바디로도 버킷을 태울 수 있다.
    // User 를 하나도 만들지 않고 429 만 유발하는 유일한 안전한 방법이다.
    const ctx = await anonCtx(playwright, 'signup-429-dedicated');
    for (let i = 1; i <= 5; i++) {
      const res = await ctx.post('/api/tech/signup', { data: {} });
      expect(res.status(), `${i}번째 요청은 아직 통과해야 한다`).toBe(400);
    }
    const limited = await ctx.post('/api/tech/signup', { data: {} });
    expect(limited.status()).toBe(429);
    expect((await limited.json()).error).toContain('너무 많습니다');
    await ctx.dispose();
  });
});
