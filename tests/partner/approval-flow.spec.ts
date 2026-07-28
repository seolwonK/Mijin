import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import {
  adminCtx,
  anonSignupCtx,
  loginCtx,
  signupFields,
  signupMultipart,
  trackSignedUpPartner,
  CERT_PNG,
} from './helpers';

// ───────────────────────────────────────────────────────────────────────────
// 관리자 승인 게이트 — 계획 Step 6b
//
//   POST /api/admin/providers/[id]/approve   404 :15 · 409 :18 · 200
//   POST /api/admin/providers/[id]/reject    404 :26 · 409 :31 · 200
//   GET  /api/admin/providers/[id]/cert      404 :31/:39 · 200(바이트 대조)
//
// 이 스펙의 핵심 단언은 상태코드가 아니라 **승인/반려가 로그인 가능 여부를
// 실제로 뒤집는가** 다. 게이트가 auth/login/route.ts:48-63 한 곳에만 있으므로,
// 승인 전/후를 로그인으로 관측하지 않으면 approve 는 그냥 컬럼 하나 바꾸는
// 200 에 불과해 보인다.
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

/** 실제 가입 API 로 PENDING 업체를 만든다 (bizCert·PENDING 상태를 제품이 만들게 한다). */
async function signUpPending(
  playwright: Parameters<typeof anonSignupCtx>[0],
  seed: string,
): Promise<{ fields: ReturnType<typeof signupFields>; userId: string; providerId: string }> {
  const ctx = await anonSignupCtx(playwright, seed);
  const fields = signupFields();
  const res = await ctx.post('/api/partner/signup', { multipart: signupMultipart(fields) });
  expect(res.status(), '가입 선행조건').toBe(200);
  await ctx.dispose();
  const ids = await trackSignedUpPartner(prisma, f, fields.loginId);
  return { fields, ...ids };
}

test('승인 전 로그인 403 → approve 200 → 로그인 200 → partner API 접근 허용', async ({
  playwright,
}) => {
  const { fields, providerId } = await signUpPending(playwright, 'approve-happy');

  // 승인 전 — 음성대조
  const before = await loginCtx(playwright, 'approve-login-before');
  expect((await before.post('/api/auth/login', { data: fields })).status()).toBe(403);
  await before.dispose();

  const admin = await adminCtx(playwright, 'approve-admin');
  const approved = await admin.post(`/api/admin/providers/${providerId}/approve`);
  expect(approved.status()).toBe(200);
  expect(await approved.json()).toEqual({ ok: true });

  const row = await prisma.provider.findUnique({ where: { id: providerId } });
  expect(row?.approvalStatus).toBe('APPROVED');
  expect(row?.approvedAt).not.toBeNull();
  expect(row?.rejectReason, 'approve 는 이전 반려 사유를 지운다 (:23)').toBeNull();

  // 승인 후 — 로그인이 열리고, 그 세션으로 partner 엔드포인트가 뚫린다.
  const after = await loginCtx(playwright, 'approve-login-after');
  const login = await after.post('/api/auth/login', { data: fields });
  expect(login.status()).toBe(200);
  expect(await login.json()).toMatchObject({ role: 'PROVIDER', name: fields.name });
  const jobs = await after.get('/api/partner/jobs');
  expect(jobs.status(), '로그인 응답의 세션 쿠키로 partner API 가 열린다').toBe(200);
  expect((await jobs.json()).jobs).toEqual([]);
  await after.dispose();
  await admin.dispose();
});

test('approve 404(:15) · 이미 승인된 업체 재승인 409(:18)', async ({ playwright }) => {
  const admin = await adminCtx(playwright, 'approve-errors');
  expect((await admin.post('/api/admin/providers/no-such-provider/approve')).status()).toBe(404);

  const already = await f.createPartnerFixture({ approvalStatus: 'APPROVED' });
  const conflict = await admin.post(`/api/admin/providers/${already.providerId}/approve`);
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error).toContain('이미 승인');

  // REJECTED → APPROVED 는 허용된다 (409 조건이 'APPROVED' 하나뿐, :17).
  const rejected = await f.createPartnerFixture({ approvalStatus: 'REJECTED' });
  expect((await admin.post(`/api/admin/providers/${rejected.providerId}/approve`)).status()).toBe(200);
  await admin.dispose();
});

test('reject 200 → 로그인 403(사유 노출) · 반려 후 partner API 차단', async ({ playwright }) => {
  const { fields, providerId } = await signUpPending(playwright, 'reject-happy');

  const admin = await adminCtx(playwright, 'reject-admin');
  const res = await admin.post(`/api/admin/providers/${providerId}/reject`, {
    data: { reason: '사업자등록증 판독 불가' },
  });
  expect(res.status()).toBe(200);

  const row = await prisma.provider.findUnique({ where: { id: providerId } });
  expect(row?.approvalStatus).toBe('REJECTED');
  expect(row?.rejectReason).toBe('사업자등록증 판독 불가');

  const login = await loginCtx(playwright, 'reject-login');
  const denied = await login.post('/api/auth/login', { data: fields });
  expect(denied.status()).toBe(403);
  // login:59 이 사유를 그대로 되돌려준다 — 반려 사유가 신청자에게 전달되는 유일한 경로.
  expect((await denied.json()).error).toContain('사업자등록증 판독 불가');
  expect((await login.get('/api/partner/jobs')).status()).toBe(401);

  await login.dispose();
  await admin.dispose();
});

test('reject 404(:26) · PENDING 이 아닌 신청 반려 409(:31) · 본문 없이 호출 허용(:20-22)', async ({
  playwright,
}) => {
  const admin = await adminCtx(playwright, 'reject-errors');
  expect(
    (await admin.post('/api/admin/providers/no-such-provider/reject', { data: {} })).status(),
  ).toBe(404);

  const approved = await f.createPartnerFixture({ approvalStatus: 'APPROVED' });
  const conflict = await admin.post(`/api/admin/providers/${approved.providerId}/reject`, {
    data: {},
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error).toContain('승인 대기');

  // 본문 없이(=JSON 파싱 실패) 호출해도 사유 null 로 통과한다.
  const pending = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  expect((await admin.post(`/api/admin/providers/${pending.providerId}/reject`)).status()).toBe(200);
  expect(
    (await prisma.provider.findUnique({ where: { id: pending.providerId } }))?.rejectReason,
  ).toBeNull();
  await admin.dispose();
});

test('GET cert — 업로드한 바이트를 그대로 돌려주고, 증빙 없으면 404(:31)', async ({
  playwright,
}) => {
  const { providerId } = await signUpPending(playwright, 'cert-happy');

  const admin = await adminCtx(playwright, 'cert-admin');
  const res = await admin.get(`/api/admin/providers/${providerId}/cert`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  expect(res.headers()['cache-control']).toBe('private, no-store');
  expect(Buffer.from(await res.body()).equals(CERT_PNG), '업로드 원본과 바이트 동일').toBe(true);

  // 픽스처 업체는 bizCertFileId·bizCertPath 가 모두 없으므로 404.
  const noCert = await f.createPartnerFixture();
  const missing = await admin.get(`/api/admin/providers/${noCert.providerId}/cert`);
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error).toContain('증빙');

  // 존재하지 않는 업체도 같은 404 분기.
  expect((await admin.get('/api/admin/providers/no-such-provider/cert')).status()).toBe(404);
  await admin.dispose();
});
