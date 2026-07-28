import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { FixtureFactory, type TechFixture, type TechFixtureInput } from '../helpers/fixtures';
import { shapeViolations, type ShapeNode } from '../helpers/shapes';

// ───────────────────────────────────────────────────────────────────────────
// 계약: 관리자 리포트 조회계 4핸들러 (계획 Step 7 — 조회계 표)
//
//   admin/rotation     GET  (지역 순환 보드 · 400 2종)
//   admin/settlements  GET  (월 정산 집계 · JSON/CSV)
//   admin/geocode      GET  (주소→좌표 · 400)
//   admin/commissions  GET  (소개 수수료 요약 / 건별 내역)
//
// 절대 집계값은 단언하지 않는다. 정산·수수료는 **이번 실행이 만든 payee/referrer 로
// 스코프**해 결정적으로 단언한다 — 그 대상의 모든 행을 이 스펙이 만들었기 때문이다.
//
// ⚠️ 픽스처는 **과거 달(2026-05)** 에 심는다. tests/admin-settlements.spec.ts:50,55-64 가
//    현재 KST 월의 기술자 집계가 비어 있고 CSV 가 정확히 3줄임을 단언하므로,
//    이번 달에 지급 설문을 만들면 수정 금지 대상인 그 스펙이 붉어진다.
// G1/G2 는 tests/cross/auth-matrix.spec.ts 가 전수 단언한다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

const FIXTURE_MONTH = '2026-05';
const AT = (day: number) => new Date(`2026-05-${String(day).padStart(2, '0')}T03:00:00.000Z`);

const num: ShapeNode = { kind: 'number' };
const numOrNull: ShapeNode = { kind: 'nullableNumber' };
const str: ShapeNode = { kind: 'string' };
const strOrNull: ShapeNode = { kind: 'nullableString' };
const bool: ShapeNode = { kind: 'boolean' };
const obj = (of: Record<string, ShapeNode>): ShapeNode => ({ kind: 'object', of });
const arr = (of: ShapeNode): ShapeNode => ({ kind: 'array', of });

/** GET /api/admin/rotation — route.ts:38-51 */
const ROTATION_SHAPE = obj({
  candidates: arr(
    obj({ name: str, kind: str, assigned30d: num, avgRating: num, reviewCount: num }),
  ),
  meta: obj({ chainLabel: str, criticalNotApplied: bool, distanceTieUnresolved: bool }),
});

/** GET /api/admin/settlements — src/lib/settlementReport.ts:10-25 */
const SETTLEMENT_ROW_SHAPE = obj({
  payeeId: str,
  name: str,
  type: str,
  total: num,
  aggregatedCount: num,
  completedCount: num,
  missingCount: num,
  coverage: num,
});
const SETTLEMENT_SHAPE = obj({
  month: str,
  providers: arr(SETTLEMENT_ROW_SHAPE),
  technicians: arr(SETTLEMENT_ROW_SHAPE),
});

/** GET /api/admin/commissions (요약) — route.ts:103-113 */
const COMMISSION_SUMMARY_SHAPE = obj({
  referrers: arr(
    obj({
      userId: str,
      name: str,
      phone: str,
      type: str,
      isActive: bool,
      approvalStatus: strOrNull,
      pendingTotal: num,
      pendingCount: num,
      paidTotal: num,
    }),
  ),
});

/** GET /api/admin/commissions?referrerUserId= (건별) — route.ts:39-58 */
const COMMISSION_DETAIL_SHAPE = obj({
  entries: arr(
    obj({
      id: str,
      refereeName: str,
      refereeType: strOrNull,
      requestId: str,
      baseAmount: num,
      amount: num,
      status: str,
      createdAt: str,
      paidAt: strOrNull,
      rating: numOrNull,
      commentPreview: strOrNull,
      isHighAmount: bool,
    }),
  ),
  nextCursor: strOrNull,
});

let f: FixtureFactory;
let admin: APIRequestContext;

test.beforeEach(async ({ playwright }) => {
  f = new FixtureFactory(prisma);
  admin = await playwright.request.newContext(await apiContextOptions('ADMIN'));
});
test.afterEach(async () => {
  await admin.dispose();
  await f.cleanupAll();
});

/**
 * 이름으로 식별해야 하는 응답(rotation 은 id 를 내려주지 않는다)을 위해
 * 충돌하지 않는 이름을 붙인 기술자를 만든다.
 */
async function namedTech(label: string, input: TechFixtureInput = {}): Promise<TechFixture> {
  const tech = await f.createTechFixture(input);
  const name = `E2E-${label}-${Math.random().toString(36).slice(2, 10)}`;
  await prisma.user.update({ where: { id: tech.userId }, data: { name } });
  return { ...tech, name };
}

// ── GET /api/admin/rotation ────────────────────────────────────────────────

test('rotation GET 400 (:19) — 시/도를 주지 않았다', async () => {
  const missing = await admin.get('/api/admin/rotation');
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toMatchObject({ error: '시/도를 선택해 주세요' });

  const blank = await admin.get('/api/admin/rotation?sido=%20%20');
  expect(blank.status()).toBe(400);
  expect(await blank.json()).toMatchObject({ error: '시/도를 선택해 주세요' });
});

test('rotation GET 400 (:24) — 지역 키가 유효하지 않다', async () => {
  const badSido = await admin.get('/api/admin/rotation?sido=없는특별시');
  expect(badSido.status()).toBe(400);
  expect(await badSido.json()).toMatchObject({ error: '올바르지 않은 지역입니다' });

  // 시/도는 맞지만 그 아래 없는 시/군/구 (regions.ts:83-88).
  const badSigungu = await admin.get('/api/admin/rotation?sido=서울특별시&sigungu=없는구');
  expect(badSigungu.status()).toBe(400);
  expect(await badSigungu.json()).toMatchObject({ error: '올바르지 않은 지역입니다' });

  // 축약형 시/도는 REGIONS 키가 아니다 — 실패해야 정상이다.
  const shortForm = await admin.get('/api/admin/rotation?sido=서울&sigungu=강남구');
  expect(shortForm.status()).toBe(400);
  // 이 핸들러의 400 은 :19('시/도를 선택해 주세요')와 :24 두 개다. sido 가 비어 있지
  // 않으므로 :19 는 걸릴 수 없지만, 문구를 고정하지 않으면 그 사실이 단언되지 않는다.
  expect(await shortForm.json()).toMatchObject({ error: '올바르지 않은 지역입니다' });
});

test('rotation GET 200 — 담당 지역이 맞는 후보만 보드에 남는다', async () => {
  const covering = await namedTech('rot-cover', {
    contractStatus: 'CONFIRMED',
    regions: ['서울특별시 강남구'],
  });
  const allRegions = await namedTech('rot-all', { contractStatus: 'CONFIRMED', regions: [] });
  const elsewhere = await namedTech('rot-busan', {
    contractStatus: 'CONFIRMED',
    regions: ['부산광역시'],
  });
  const noContract = await namedTech('rot-nocontract', { regions: [] });

  const res = await admin.get('/api/admin/rotation?sido=서울특별시&sigungu=강남구');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    candidates: Array<{ name: string; kind: string; assigned30d: number; avgRating: number }>;
    meta: Record<string, unknown>;
  };
  expect(shapeViolations(body, ROTATION_SHAPE)).toEqual([]);

  const names = body.candidates.map((c) => c.name);
  expect(names, '담당 지역 후보가 빠졌다').toContain(covering.name);
  // 빈 regions = 전 지역 담당 (regions.ts:129).
  expect(names, '전 지역 담당 후보가 빠졌다').toContain(allRegions.name);
  expect(names, '다른 지역 담당이 남았다').not.toContain(elsewhere.name);
  expect(names, '계약 미확정 기술자가 남았다').not.toContain(noContract.name);

  // 보드가 표현하는 사슬의 한계를 응답이 스스로 밝힌다 (route.ts:46-50).
  expect(body.meta).toEqual({
    chainLabel: 'URGENT·NORMAL 공통 사슬',
    criticalNotApplied: true,
    distanceTieUnresolved: true,
  });
  for (const candidate of body.candidates) {
    expect(['PROVIDER', 'TECHNICIAN']).toContain(candidate.kind);
    expect(candidate.assigned30d).toBeGreaterThanOrEqual(0);
    expect(candidate.avgRating).toBeGreaterThanOrEqual(0);
  }
});

test('rotation GET 200 — 시/도만 줘도 유효한 키가 된다 (regions.ts:86)', async () => {
  const tech = await namedTech('rot-sido', { contractStatus: 'CONFIRMED', regions: [] });
  const res = await admin.get('/api/admin/rotation?sido=세종특별자치시');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { candidates: Array<{ name: string }> };
  expect(shapeViolations(body, ROTATION_SHAPE)).toEqual([]);
  expect(body.candidates.map((c) => c.name)).toContain(tech.name);
});

// ── GET /api/admin/settlements ─────────────────────────────────────────────

/**
 * 정산·수수료용 픽스처 한 벌.
 * 같은 기술자에게 (지급 2건 + 미지급 1건) 을 과거 달에 심어
 * completedCount / aggregatedCount / missingCount / coverage 관계를 결정적으로 만든다.
 */
async function settlementFixture() {
  const payee = await namedTech('settle');
  const referrer = await f.createPartnerFixture();
  const longComment = '고객 후기 '.repeat(20); // 60자 초과 — commentPreview 절단 확인용

  const mk = async (paidAmount: number | null, day: number, rating: number | null) => {
    const request = await f.createRequestFixture({ status: 'COMPLETED' });
    const survey = await prisma.satisfactionSurvey.create({
      data: {
        requestId: request.id,
        token: `e2e-settle-${request.id}`,
        technicianId: payee.technicianId,
        rating,
        comment: rating === null ? null : longComment,
        paidAmount,
        submittedAt: AT(day),
      },
    });
    return { request, survey };
  };

  const paidSmall = await mk(77_000, 15, 4);
  const unpaid = await mk(null, 16, null);
  const paidBig = await mk(1_200_000, 17, 5);

  const small = await prisma.commissionEntry.create({
    data: {
      referrerUserId: referrer.userId,
      technicianId: payee.technicianId,
      surveyId: paidSmall.survey.id,
      requestId: paidSmall.request.id,
      baseAmount: 77_000,
      amount: 1_540,
      status: 'PENDING',
      createdAt: AT(15),
    },
  });
  const big = await prisma.commissionEntry.create({
    data: {
      referrerUserId: referrer.userId,
      technicianId: payee.technicianId,
      surveyId: paidBig.survey.id,
      requestId: paidBig.request.id,
      baseAmount: 1_200_000,
      amount: 24_000,
      status: 'PAID',
      createdAt: AT(17),
      paidAt: AT(18),
    },
  });

  return { payee, referrer, paidSmall, unpaid, paidBig, small, big, longComment };
}

test('settlements GET 200 — 내 수취인 행의 집계 관계가 정확하다', async () => {
  const fx = await settlementFixture();

  const res = await admin.get(`/api/admin/settlements?month=${FIXTURE_MONTH}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    month: string;
    providers: Array<{ payeeId: string }>;
    technicians: Array<Record<string, unknown>>;
  };
  expect(shapeViolations(body, SETTLEMENT_SHAPE)).toEqual([]);
  expect(body.month).toBe(FIXTURE_MONTH);

  const row = body.technicians.find((r) => r.payeeId === fx.payee.technicianId);
  expect(row, '내 기술자 수취인 행이 없다').toBeTruthy();
  expect(row).toEqual({
    payeeId: fx.payee.technicianId,
    name: fx.payee.name,
    type: '기술자',
    // 지급액이 채워진 2건만 합산된다.
    total: 1_277_000,
    aggregatedCount: 2,
    // 그 달에 제출된 설문은 3건 (미지급 1건 포함).
    completedCount: 3,
    missingCount: 1,
    coverage: 2 / 3,
  });
  // 기술자 수취인이 업체 섹션으로 새지 않는다 (settlementReport.ts:118-121).
  expect(body.providers.some((r) => r.payeeId === fx.payee.technicianId)).toBe(false);
});

test('settlements GET 200 — 월 파라미터: 다른 달 제외 · 잘못된 값은 현재 KST 월로 폴백', async () => {
  const fx = await settlementFixture();

  const otherMonth = await admin.get('/api/admin/settlements?month=2020-01');
  expect(otherMonth.status()).toBe(200);
  const other = (await otherMonth.json()) as { month: string; technicians: Array<{ payeeId: string }> };
  expect(other.month).toBe('2020-01');
  expect(other.technicians.some((r) => r.payeeId === fx.payee.technicianId)).toBe(false);

  // route.ts:7 — 형식이 어긋나면 조용히 현재 KST 월로 떨어진다.
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentMonth = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}`;
  for (const bad of ['not-a-month', '2026-13', '2026-1']) {
    const res = await admin.get(`/api/admin/settlements?month=${encodeURIComponent(bad)}`);
    expect(res.status(), bad).toBe(200);
    expect((await res.json()).month, bad).toBe(currentMonth);
  }
});

test('settlements GET 200 (format=csv) — 원천 행 내보내기', async () => {
  const fx = await settlementFixture();

  const res = await admin.get(`/api/admin/settlements?month=${FIXTURE_MONTH}&format=csv`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  expect(res.headers()['content-disposition']).toContain(`settlements-${FIXTURE_MONTH}.csv`);

  const text = await res.text();
  const lines = text.trim().split(/\r\n/);
  expect(lines[0]).toBe('조회코드,설문ID,대상,유형,제출일(KST),고객신고금액(원)');

  // 수취인 이름은 이 테스트가 랜덤으로 붙인 값이라 다른 워커의 행과 섞이지 않는다.
  // 지급액이 있는 2건만 원천 행이 된다 (settlementReport.ts:134-137).
  expect(lines.filter((line) => line.includes(fx.payee.name))).toHaveLength(2);
  const small = lines.find((line) => line.includes(fx.paidSmall.survey.id));
  expect(small, '지급 설문이 CSV 에 없다').toBeTruthy();
  expect(small!.split(',')).toEqual([
    fx.paidSmall.request.lookupCode,
    fx.paidSmall.survey.id,
    fx.payee.name,
    '기술자',
    '2026-05-15',
    '77000',
  ]);
  // 미지급 설문은 원천 행에 없다.
  expect(text.includes(fx.unpaid.survey.id)).toBe(false);
});

// ── GET /api/admin/geocode ─────────────────────────────────────────────────

test('geocode GET 400 (:13) — 주소가 비었다', async () => {
  const missing = await admin.get('/api/admin/geocode');
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toMatchObject({ error: '주소를 입력해 주세요' });

  const blank = await admin.get('/api/admin/geocode?query=%20%20%20');
  expect(blank.status()).toBe(400);
  expect(await blank.json()).toMatchObject({ error: '주소를 입력해 주세요' });
});

test('geocode GET 200 — enabled 플래그와 결과의 관계', async () => {
  const res = await admin.get('/api/admin/geocode?query=서울특별시 강남구 테헤란로 152');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    result: { lat: number; lng: number } | null;
    enabled: boolean;
  };
  expect(typeof body.enabled).toBe('boolean');

  if (!body.enabled) {
    // 키가 없으면 kakao.ts:14 가 항상 null 을 돌려준다 — 그 자체가 계약이다.
    expect(body.result).toBeNull();
    return;
  }
  expect(body.result, '카카오 키가 있는데 실주소 변환이 실패했다').not.toBeNull();
  expect(body.result!.lat).toBeGreaterThan(33);
  expect(body.result!.lat).toBeLessThan(39);
  expect(body.result!.lng).toBeGreaterThan(124);
  expect(body.result!.lng).toBeLessThan(132);

  // 변환 불가 주소는 200 + result null 이다 (400 이 아니다).
  const gibberish = await admin.get(
    `/api/admin/geocode?query=${encodeURIComponent('존재하지않는주소ㅁㄴㅇㄹㅋㅌㅊㅍ 999999번지')}`,
  );
  expect(gibberish.status()).toBe(200);
  expect((await gibberish.json()).result).toBeNull();
});

// ── GET /api/admin/commissions ─────────────────────────────────────────────

test('commissions GET 200 (요약) — 내 소개자 행의 미지급/지급 합계', async () => {
  const fx = await settlementFixture();

  const res = await admin.get('/api/admin/commissions');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    referrers: Array<Record<string, unknown>>;
  };
  expect(shapeViolations(body, COMMISSION_SUMMARY_SHAPE)).toEqual([]);

  const mine = body.referrers.find((r) => r.userId === fx.referrer.userId);
  expect(mine, '내 소개자가 요약에 없다').toBeTruthy();
  expect(mine).toEqual({
    userId: fx.referrer.userId,
    name: fx.referrer.name,
    phone: fx.referrer.phone,
    type: '업체',
    isActive: true,
    approvalStatus: 'APPROVED',
    // PENDING 1건만 미지급 합계에 들어간다 (:110-112).
    pendingTotal: 1_540,
    pendingCount: 1,
    paidTotal: 24_000,
  });

  // 요약은 pendingTotal 내림차순이다 (:115).
  const totals = body.referrers.map((r) => r.pendingTotal as number);
  expect(totals).toEqual([...totals].sort((a, b) => b - a));
});

test('commissions GET 200 (건별) — 최신순 · 후기 요약 절단 · 고액 플래그', async () => {
  const fx = await settlementFixture();

  const res = await admin.get(`/api/admin/commissions?referrerUserId=${fx.referrer.userId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    entries: Array<Record<string, unknown>>;
    nextCursor: string | null;
  };
  expect(shapeViolations(body, COMMISSION_DETAIL_SHAPE)).toEqual([]);

  // 이 소개자의 원장은 전부 이 스펙이 만들었다 — 절대값 단언이 안전한 유일한 지점.
  expect(body.entries.map((e) => e.id)).toEqual([fx.big.id, fx.small.id]);
  expect(body.nextCursor).toBeNull();

  expect(body.entries[0]).toMatchObject({
    refereeName: fx.payee.name,
    refereeType: '기술자',
    requestId: fx.paidBig.request.id,
    baseAmount: 1_200_000,
    amount: 24_000,
    status: 'PAID',
    rating: 5,
    // baseAmount >= 1,000,000 (:54)
    isHighAmount: true,
  });
  expect(body.entries[0].paidAt).not.toBeNull();

  expect(body.entries[1]).toMatchObject({
    requestId: fx.paidSmall.request.id,
    baseAmount: 77_000,
    amount: 1_540,
    status: 'PENDING',
    paidAt: null,
    rating: 4,
    isHighAmount: false,
  });
  // 후기 전문이 아니라 60자 요약만 나간다 (:53).
  expect(body.entries[1].commentPreview).toBe(fx.longComment.slice(0, 60));
  expect((body.entries[1].commentPreview as string).length).toBe(60);
});

test('commissions GET 200 (건별) — month 필터와 없는 소개자', async () => {
  const fx = await settlementFixture();
  const ids = async (query: string) => {
    const res = await admin.get(`/api/admin/commissions?referrerUserId=${fx.referrer.userId}${query}`);
    expect(res.status(), query).toBe(200);
    return ((await res.json()) as { entries: Array<{ id: string }> }).entries.map((e) => e.id);
  };

  expect(await ids(`&month=${FIXTURE_MONTH}`)).toEqual([fx.big.id, fx.small.id]);
  expect(await ids('&month=2020-01')).toEqual([]);
  // 형식이 어긋나면 조용히 전체 조회 (:23 의 정규식 게이트).
  expect(await ids('&month=nonsense')).toEqual([fx.big.id, fx.small.id]);

  const unknown = await admin.get('/api/admin/commissions?referrerUserId=e2e-no-such-user');
  expect(unknown.status()).toBe(200);
  expect(await unknown.json()).toEqual({ entries: [], nextCursor: null });
});
