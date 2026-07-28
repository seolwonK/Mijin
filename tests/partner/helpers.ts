import { randomBytes } from 'node:crypto';
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { freshIp, ipHeaders } from '../helpers/ip';
import { ephemeralLoginId, ephemeralPhone, type FixtureFactory } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// tests/partner/ 전용 보조 도구.
//
// ⚠️ 업체는 기술자와 **대칭이 아니다**. 기술자 가입은 즉시 APPROVED + 세션 발급
// (tech/signup/route.ts:176, :196-211) 이지만, 업체 가입은 PENDING 으로 만들어지고
// (partner/signup/route.ts:184) 관리자 승인 전에는 **로그인 자체가 막힌다**
// (auth/login/route.ts:48-53 → 403). tech 스펙을 복사하면 안 되는 이유.
//
// 파일명이 `*.spec.ts` 가 아니므로 Playwright 의 testMatch 에 잡히지 않는다.
// ───────────────────────────────────────────────────────────────────────────

type Pw = PlaywrightWorkerArgs['playwright'];

/**
 * 체크섬이 맞는 사업자등록번호 10자리.
 * src/lib/bizRegNo.ts:9-13 의 가중치 [1,3,7,1,3,7,1,3,5] + floor(d8*5/10) 규칙을
 * **역산**한다 — 상수를 박아두면 Provider.bizRegNo 가 @unique 라 병렬/연속 실행에서
 * 409 로 자기 자신과 충돌한다.
 */
export function validBizRegNo(): string {
  const head = randomDigits(9);
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(head[i]) * weights[i];
  sum += Math.floor((Number(head[8]) * 5) / 10);
  return head + String((10 - (sum % 10)) % 10);
}

/** 형식(10자리 숫자)은 맞지만 검증번호가 틀린 번호 — signup:84-86 분기 재현용. */
export function invalidBizRegNo(): string {
  const valid = validBizRegNo();
  const wrongLast = String((Number(valid[9]) + 1) % 10);
  return valid.slice(0, 9) + wrongLast;
}

function randomDigits(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}

/**
 * 최소 유효 PNG (1x1). signup:105-110 의 ALLOWED_TYPES 를 통과하고,
 * cert 라우트가 돌려준 바이트와 **동일성 대조**가 가능하도록 내용을 고정한다.
 */
export const CERT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export const CERT_UPLOAD = {
  name: 'bizcert.png',
  mimeType: 'image/png',
  buffer: CERT_PNG,
} as const;

export type SignupFields = {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  address: string;
  bizRegNo: string;
  regions?: string;
  referrerUserId?: string;
};

/**
 * 정상 가입 필드 한 벌. 주소는 **정식 시/도 표기**를 쓴다.
 * (축약형 '서울 강남구' 도 이제 해석된다 — regionFromAddress 가 내부에서
 *  SIDO_ALIASES 로 정규화하도록 고쳐졌다. 정식 표기를 쓰는 이유는 그것이
 *  카카오 역지오코딩이 실제로 내는 형태이기 때문이다.)
 */
export function signupFields(overrides: Partial<SignupFields> = {}): SignupFields {
  return {
    loginId: ephemeralLoginId('partner'),
    password: 'e2epass1234',
    name: 'E2E 가입업체',
    phone: ephemeralPhone(),
    address: '서울특별시 강남구 테헤란로 152',
    bizRegNo: validBizRegNo(),
    ...overrides,
  };
}

/** multipart 본문 — 필드 + bizCert 파일. `request.post(url, { multipart })` 에 그대로. */
export function signupMultipart(
  fields: SignupFields,
  opts: { cert?: { name: string; mimeType: string; buffer: Buffer } | null } = {},
): Record<string, string | { name: string; mimeType: string; buffer: Buffer }> {
  const body: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) body[k] = v;
  }
  const cert = opts.cert === undefined ? CERT_UPLOAD : opts.cert;
  if (cert) body.bizCert = { ...cert };
  return body;
}

/**
 * 가입 API 는 `{ok:true}` 만 돌려주고 id 를 주지 않는다.
 * 만들어진 User 를 loginId 로 되찾아 팩토리에 등록해야 cleanupAll 이
 * Provider·StoredFile 까지 FK 역순으로 회수한다(fixtures.ts:472-491).
 */
export async function trackSignedUpPartner(
  prisma: PrismaClient,
  f: FixtureFactory,
  loginId: string,
): Promise<{ userId: string; providerId: string }> {
  const user = await prisma.user.findUnique({
    where: { loginId },
    select: { id: true, provider: { select: { id: true } } },
  });
  if (!user?.provider) {
    throw new Error(`가입 후 User/Provider 를 찾지 못했습니다: ${loginId}`);
  }
  f.trackUser(user.id);
  return { userId: user.id, providerId: user.provider.id };
}

// ── 요청 컨텍스트 ──────────────────────────────────────────────────────────
// 가입 라우트는 IP당 10분/5회(signup:36-48) 이므로 **매번 새 버킷**이 기본이다.
// 429 를 의도적으로 유발하는 테스트만 고정 IP(ipHeaders)를 쓴다.

export async function anonSignupCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(
    await apiContextOptions(null, {}, { 'x-forwarded-for': freshIp(seed) }),
  );
}

/** 같은 레이트리밋 버킷을 재사용해야 하는 경우(429 유발) 전용. */
export async function fixedIpCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(await apiContextOptions(null, {}, ipHeaders(seed)));
}

export async function partnerCtx(
  playwright: Pw,
  fixture: { userId: string; providerId: string },
  seed: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext(
    await apiContextOptions(
      'PROVIDER',
      { userId: fixture.userId, providerId: fixture.providerId },
      ipHeaders(seed),
    ),
  );
}

export async function adminCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(await apiContextOptions('ADMIN', {}, ipHeaders(seed)));
}

/** 세션 없이 로그인 API 를 태우는 컨텍스트 — 쿠키가 컨텍스트에 남아 그대로 재사용된다. */
export async function loginCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(
    await apiContextOptions(null, {}, { 'x-forwarded-for': freshIp(seed) }),
  );
}

/** 랜덤 토큰 — SatisfactionSurvey.token 이 @unique 라 픽스처마다 새로 만든다. */
export function surveyToken(): string {
  return `e2e-partner-${randomBytes(12).toString('hex')}`;
}
