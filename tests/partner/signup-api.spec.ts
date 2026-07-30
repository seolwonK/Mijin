import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { expectGate } from '../helpers/gates';
import {
  anonSignupCtx,
  fixedIpCtx,
  invalidBizRegNo,
  loginCtx,
  partnerCtx,
  signupFields,
  signupMultipart,
  trackSignedUpPartner,
  validBizRegNo,
  CERT_PNG,
} from './helpers';

// ───────────────────────────────────────────────────────────────────────────
// POST /api/partner/signup — 계획 Step 6a
//
// 업체 가입은 전기기사 가입과 **정반대**다:
//   전기기사  tech/signup:176      approvalStatus 'APPROVED' + :196-211 세션 쿠키 발급
//   업체    partner/signup:184   approvalStatus 'PENDING'  + 쿠키 없음
// 따라서 "가입 직후 API 를 태운다" 는 tech 패턴을 여기 옮기면 안 된다.
// 승인 전 차단이 실제로 걸리는 지점은 **로그인**(auth/login/route.ts:48-53) 이다.
//
// 라우트 검증 순서 (분기 재현 시 이 순서를 지켜야 원하는 400 이 나온다):
//   429 :53 → formData :62 → zod 필드 :76 → 사업자번호 체크섬 :85
//   → 파일 존재 :93 → 크기 :99 → MIME :105 → 중복 loginId :116 / bizRegNo :119
//   → 추천인 :146,:149 → 지오코딩 :159 → 생성 :170
// ───────────────────────────────────────────────────────────────────────────

// 분기 지도의 정식 키. expectGate 로 상태코드 **와 문구**를 함께 고정하면,
// 앞선 게이트가 대신 응답했을 때(특히 체크섬 :88 이 파일 게이트 3개를 가리는 경우)
// 문구가 어긋나 즉시 붉어진다.
const SIGNUP = 'POST /api/partner/signup';

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

test('multipart 이 아니면 400 — JSON 본문은 formData() 에서 거부된다 (:62-65)', async ({
  playwright,
}) => {
  const ctx = await anonSignupCtx(playwright, 'partner-signup-json');
  const gate = expectGate(SIGNUP, 64);
  const res = await ctx.post('/api/partner/signup', { data: signupFields() });
  expect(res.status()).toBe(gate.status);
  expect((await res.json()).error).toBe(gate.message);
  await ctx.dispose();
});

test('필수 필드 zod 400 5종 (:76-81)', async ({ playwright }) => {
  const ctx = await anonSignupCtx(playwright, 'partner-signup-zod');
  // 각 케이스는 **한 필드만** 망가뜨리고 나머지(특히 bizRegNo·bizCert)는 유효하게 둔다.
  // 그래야 zod(:76)가 첫 실패 게이트가 되고 체크섬(:85)·파일(:93) 분기에 가려지지 않는다.
  //
  // ⚠️ 메시지를 fieldsSchema(:22-32)의 문구로 **정확히** 대조한다. `typeof error === 'string'`
  // 같은 느슨한 단언은 뒤쪽 400 분기(체크섬 등)가 대신 응답해도 초록이라, 검증한 게
  // 무엇인지 증명하지 못한다.
  const cases: Array<[Partial<ReturnType<typeof signupFields>>, string]> = [
    [{ loginId: 'ab' }, '아이디는 3자 이상'],
    [{ password: 'short' }, '비밀번호는 8자 이상'],
    [{ name: '   ' }, '업체명을 입력해 주세요'],
    [{ phone: '12345' }, '전화번호 형식이 올바르지 않습니다'],
    [{ address: '   ' }, '주소를 입력해 주세요'],
  ];
  for (const [override, message] of cases) {
    const res = await ctx.post('/api/partner/signup', {
      multipart: signupMultipart(signupFields(override)),
    });
    expect(res.status(), message).toBe(400);
    expect((await res.json()).error, message).toBe(message);
  }
  // 5건 모두 400 이므로 이 IP 버킷은 정확히 5회를 태웠다 (6회째가 429 — 아래 별도 테스트).
  await ctx.dispose();
});

test('사업자등록번호 체크섬 불일치 400 (:84-86, lib/bizRegNo.ts:9-13)', async ({ playwright }) => {
  const ctx = await anonSignupCtx(playwright, 'partner-signup-checksum');
  const gate = expectGate(SIGNUP, 88);
  const bad = invalidBizRegNo();
  const res = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields({ bizRegNo: bad })),
  });
  expect(res.status()).toBe(gate.status);
  expect((await res.json()).error).toBe(gate.message);
  // 양성대조 — 같은 앞 9자리에 올바른 검증번호면 통과한다. 체크섬 자체가 원인임을
  // 확인하지 않으면 "무조건 400" 하네스 결함과 구분되지 않는다.
  const fields = signupFields({ bizRegNo: validBizRegNo() });
  const ok = await ctx.post('/api/partner/signup', { multipart: signupMultipart(fields) });
  expect(ok.status()).toBe(200);
  await trackSignedUpPartner(prisma, f, fields.loginId);
  // 형식 자체가 틀린 경우(10자리 아님)도 같은 분기다.
  expect(
    (
      await ctx.post('/api/partner/signup', {
        multipart: signupMultipart(signupFields({ bizRegNo: '123' })),
      })
    ).status(),
  ).toBe(400);
  await ctx.dispose();
});

test('bizCert 미첨부·초과크기·허용외 MIME 400 (:93, :99, :105)', async ({ playwright }) => {
  // ⚠️ 이 3개 게이트는 전부 체크섬(:88) **뒤**에 있다. signupFields() 가 매번
  // 검증번호까지 유효한 번호를 만들기 때문에 여기까지 도달한다. 상수 번호를 쓰거나
  // 체크섬이 깨지면 세 단언 모두 체크섬 400 을 맞고 **파일 게이트를 한 번도 실행하지
  // 않은 채** 초록이 된다 — 문구까지 대조하는 이유가 이것이다.
  const ctx = await anonSignupCtx(playwright, 'partner-signup-file');

  const missingGate = expectGate(SIGNUP, 96);
  const missing = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields(), { cert: null }),
  });
  expect(missing.status()).toBe(missingGate.status);
  expect((await missing.json()).error).toBe(missingGate.message);

  const tooBigGate = expectGate(SIGNUP, 102);
  const tooBig = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields(), {
      cert: { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(8 * 1024 * 1024 + 1) },
    }),
  });
  expect(tooBig.status()).toBe(tooBigGate.status);
  expect((await tooBig.json()).error).toBe(tooBigGate.message);

  // 8MB 이하여야 MIME 게이트까지 온다 (:102 가 :108 을 가린다).
  const badMimeGate = expectGate(SIGNUP, 108);
  const badMime = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields(), {
      cert: { name: 'cert.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
    }),
  });
  expect(badMime.status()).toBe(badMimeGate.status);
  expect((await badMime.json()).error).toBe(badMimeGate.message);

  await ctx.dispose();
});

test('중복 bizRegNo 409 (:119-123) · 중복 loginId 409 (:116-118)', async ({ playwright }) => {
  const ctx = await anonSignupCtx(playwright, 'partner-signup-dup');
  const first = signupFields();
  expect((await ctx.post('/api/partner/signup', { multipart: signupMultipart(first) })).status()).toBe(
    200,
  );
  await trackSignedUpPartner(prisma, f, first.loginId);

  // 두 409 는 문구로만 구분된다 — 상태코드만 보면 어느 쪽이 걸렸는지 알 수 없다.
  // 둘 다 **유효한 파일 첨부**가 있어야 도달한다(:96-108 이 앞에 있다).
  //
  // 같은 사업자번호 + 다른 아이디 → bizRegNo 충돌. loginId 까지 겹치면 :117 이 먼저다.
  const bizGate = expectGate(SIGNUP, 122);
  const sameBiz = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields({ bizRegNo: first.bizRegNo })),
  });
  expect(sameBiz.status()).toBe(bizGate.status);
  expect((await sameBiz.json()).error).toBe(bizGate.message);

  // 같은 아이디 + 다른 사업자번호 → loginId 충돌
  const loginGate = expectGate(SIGNUP, 117);
  const sameLogin = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields({ loginId: first.loginId })),
  });
  expect(sameLogin.status()).toBe(loginGate.status);
  expect((await sameLogin.json()).error).toBe(loginGate.message);

  // 어느 쪽도 새 행을 만들지 않았다 — 409 가 "조용한 성공"이 아님을 DB 로 확인.
  expect(await prisma.provider.count({ where: { bizRegNo: first.bizRegNo } })).toBe(1);
  await ctx.dispose();
});

test('추천인 검증 400 — 미승인 추천인(:146) · 자기 자신(:149)', async ({ playwright }) => {
  const ctx = await anonSignupCtx(playwright, 'partner-signup-referrer');

  const notApprovedGate = expectGate(SIGNUP, 147);
  const pendingReferrer = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  const notApproved = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields({ referrerUserId: pendingReferrer.userId })),
  });
  expect(notApproved.status()).toBe(notApprovedGate.status);
  expect((await notApproved.json()).error).toBe(notApprovedGate.message);

  // 자기추천 — 라우트는 User.id 가 아니라 **전화번호 동일성**으로 판정한다.
  const selfGate = expectGate(SIGNUP, 152);
  const approvedReferrer = await f.createPartnerFixture({ approvalStatus: 'APPROVED' });
  const selfRef = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(
      signupFields({ referrerUserId: approvedReferrer.userId, phone: approvedReferrer.phone }),
    ),
  });
  expect(selfRef.status()).toBe(selfGate.status);
  expect((await selfRef.json()).error).toBe(selfGate.message);

  // 양성대조 — 승인된 타인 추천인은 통과하고 referredByUserId 가 실제로 박힌다(:155, :185).
  const fields = signupFields({ referrerUserId: approvedReferrer.userId });
  expect((await ctx.post('/api/partner/signup', { multipart: signupMultipart(fields) })).status()).toBe(
    200,
  );
  const { providerId } = await trackSignedUpPartner(prisma, f, fields.loginId);
  expect(
    (await prisma.provider.findUnique({ where: { id: providerId } }))?.referredByUserId,
  ).toBe(approvedReferrer.userId);

  await ctx.dispose();
});

test('가입 성공은 PENDING 으로 만들고 (:184) 승인 전 로그인을 막는다 (login:48-53)', async ({
  playwright,
}) => {
  const ctx = await anonSignupCtx(playwright, 'partner-signup-pending');
  const fields = signupFields();
  const res = await ctx.post('/api/partner/signup', { multipart: signupMultipart(fields) });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const { providerId } = await trackSignedUpPartner(prisma, f, fields.loginId);
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  expect(provider?.approvalStatus, '업체는 전기기사와 달리 PENDING 으로 생성된다').toBe('PENDING');
  expect(provider?.approvedAt).toBeNull();
  expect(provider?.bizRegNo).toBe(fields.bizRegNo);
  // 증빙은 파일시스템이 아니라 DB(StoredFile)에 들어간다(:195-202).
  expect(provider?.bizCertFileId).toBeTruthy();
  const stored = await prisma.storedFile.findUnique({
    where: { id: provider!.bizCertFileId! },
  });
  expect(stored?.mime).toBe('image/png');
  expect(Buffer.from(stored!.data).equals(CERT_PNG)).toBe(true);

  // 가입 응답에 세션 쿠키가 붙지 않는다 (tech/signup:203-211 과의 결정적 차이).
  expect(res.headers()['set-cookie']).toBeUndefined();

  // 승인 전 차단은 **로그인**에서 걸린다 → 403.
  // 양성대조(짝): approval-flow.spec.ts:52 이 "같은 계정을 승인하면 같은 로그인이 200 이고
  // partner API 가 열린다"를 단언한다. 그게 없으면 이 403 은 "로그인이 늘 403" 이라는
  // 하네스 결함과 구분되지 않는다.
  const login = await loginCtx(playwright, 'partner-signup-pending-login');
  const denied = await login.post('/api/auth/login', {
    data: { loginId: fields.loginId, password: fields.password },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error).toContain('승인 대기');
  // 로그인이 막혔으므로 세션이 없고, partner 엔드포인트는 401 이다.
  expect((await login.get('/api/partner/jobs')).status()).toBe(401);

  await ctx.dispose();
  await login.dispose();
});

test('⚠️ 현행 동작 기록 — partner/* 라우트는 approvalStatus 를 재확인하지 않는다', async ({
  playwright,
}) => {
  // 승인 게이트는 auth/login/route.ts:48-53 **한 곳에만** 있다. partner/jobs·profile·
  // stats 등은 requireSession('PROVIDER') + session.providerId 만 본다(예: jobs/route.ts:6-9).
  // 즉 세션을 다른 경로로 얻을 수 있다면 PENDING 업체도 API 를 탄다 —
  // 계층 방어가 없다는 뜻이며 팀리드에 보고 대상이다.
  //
  // 이 단언은 **현행 동작을 고정**하기 위한 것이다. 제품이 라우트단 승인 검사를
  // 추가하면 여기가 빨개진다 — 그때는 결함이 아니라 수정이므로 기대값을 401/403 으로 바꿀 것.
  const pending = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  const ctx = await partnerCtx(playwright, pending, 'partner-pending-session');
  expect(
    (await ctx.get('/api/partner/jobs')).status(),
    'PENDING 업체 세션이 통과한다 = 라우트단 승인 검사 부재 (보고 대상)',
  ).toBe(200);
  await ctx.dispose();
});

test('레이트리밋 429 — 전용 IP 에서 6회째가 막힌다 (:37-48, :53-58)', async ({ playwright }) => {
  // 고정 IP 를 쓰는 유일한 테스트. nonce 가 실행마다 바뀌므로(helpers/ip.ts:28-35)
  // 1회차가 태운 버킷이 2회차에 살아남지 않는다 = "연속 2회 그린"이 유지된다.
  const ctx = await fixedIpCtx(playwright, 'partner-signup-429');
  // 1~5회는 체크섬 400 으로 태운다 — DB 행을 만들지 않으면서 카운터만 올린다.
  for (let i = 0; i < 5; i++) {
    const res = await ctx.post('/api/partner/signup', {
      multipart: signupMultipart(signupFields({ bizRegNo: invalidBizRegNo() })),
    });
    expect(res.status(), `${i + 1}회째는 아직 레이트리밋 전`).toBe(400);
  }
  const gate = expectGate(SIGNUP, 56);
  const limited = await ctx.post('/api/partner/signup', {
    multipart: signupMultipart(signupFields()),
  });
  expect(limited.status()).toBe(gate.status);
  expect((await limited.json()).error).toBe(gate.message);
  await ctx.dispose();
});
