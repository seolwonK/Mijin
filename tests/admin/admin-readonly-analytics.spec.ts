import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { FixtureFactory } from '../helpers/fixtures';
import { ANALYTICS_SHAPES, shapeViolations } from '../helpers/shapes';

// ───────────────────────────────────────────────────────────────────────────
// 계약: 관리자 분석 조회계 7핸들러 (계획 Step 7 — 조회계 표)
//
//   analytics/summary · dashboard · surveys · ratings · ratings/[subject]
//   · map/regions · map/dispatch
//
// 규칙 (계획 Step 7 조회계 행): **집계 절대값은 단언하지 않는다.** DB 는 공유 자원이고
// 다른 워커가 같은 순간에 행을 만든다. 대신 세 가지만 본다:
//   1. shapes.ts 상수와의 구조 일치 (Layer 1 ↔ Layer 3 드리프트 결박)
//   2. **응답 본문 내부의 자기일관성** — 예: responseRate === submitted/total.
//      두 값이 같은 응답에 들어 있으므로 병렬 쓰기와 무관하게 항상 성립한다.
//   3. **내가 만든 id 의 존재/부재** — 대역 전체 카운트가 아니라 멤버십.
//
// G1/G2 는 tests/cross/auth-matrix.spec.ts 가 전수 단언한다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

// 설문 픽스처는 **과거 달**에 심는다. tests/admin-settlements.spec.ts:50,55-64 가
// 현재 KST 월(2026-07)의 기술자 정산 집계가 비어 있고 CSV 가 정확히 3줄임을 단언하므로,
// 이번 달에 제출·지급 설문을 만들면 그 스펙이 붉어진다 (수정 금지 대상 11스펙).
const PAST_SUBMITTED_AT = new Date('2026-05-15T03:00:00.000Z');
const PAST_BUCKET = '2026-05';

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

function shapeOf(key: keyof typeof ANALYTICS_SHAPES) {
  return ANALYTICS_SHAPES[key];
}

/** analyticsStats.ts:45-47 의 ratio() 와 같은 규칙. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

// ── summary ────────────────────────────────────────────────────────────────

test('analytics/summary GET 200 — shape · 비음수 정수 · 내 CRITICAL 미완료 건이 잡힌다', async () => {
  const res0 = await admin.get('/api/admin/analytics/summary');
  expect(res0.status()).toBe(200);
  const before = (await res0.json()) as Record<string, number>;
  expect(shapeViolations(before, shapeOf('/api/admin/analytics/summary'))).toEqual([]);

  // urgentOpen = urgency in (CRITICAL,URGENT) AND status notIn (COMPLETED,CANCELED)
  // (analyticsStats.ts:77-82). 미완료 CRITICAL 을 하나 만들면 반드시 늘어난다.
  // ⚠️ RECEIVED 로 만들지 않는다 — 자동배정 워커의 미끼가 된다 (계획 rev.5 신규 제약).
  await f.createRequestFixture({ status: 'ASSIGNED', urgency: 'CRITICAL' });

  const res1 = await admin.get('/api/admin/analytics/summary');
  expect(res1.status()).toBe(200);
  const after = (await res1.json()) as Record<string, number>;
  expect(shapeViolations(after, shapeOf('/api/admin/analytics/summary'))).toEqual([]);

  for (const key of ['received', 'needsAttention', 'urgentOpen'] as const) {
    expect(Number.isInteger(after[key]), key).toBe(true);
    expect(after[key], key).toBeGreaterThanOrEqual(0);
  }
  // 절대값이 아니라 "내가 만든 1건이 반영됐다"는 하한만 본다.
  expect(after.urgentOpen).toBeGreaterThanOrEqual(1);
});

// ── dashboard ──────────────────────────────────────────────────────────────

for (const period of ['day', 'week', 'month'] as const) {
  test(`analytics/dashboard GET 200 (period=${period}) — shape · 파생값 자기일관성`, async () => {
    const res = await admin.get(`/api/admin/analytics/dashboard?period=${period}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      operational: { byStatus: Record<string, number>; byUrgencyOpen: Record<string, number>; needsAttention: number };
      trend: Array<{ bucket: string; received: number; completed: number }>;
      performance: {
        op: { offerAcceptRate: number | null; accepted: number; rejected: number };
        cust: { requestSuccessRate: number | null; requestsWithAccepted: number; totalRequests: number };
      };
      money: { surveyPaid: { sum: number; count: number; avg: number | null }; commission: Record<string, number> };
    };
    expect(shapeViolations(body, shapeOf('/api/admin/analytics/dashboard'))).toEqual([]);

    // ① 파생 비율은 같은 응답 안의 두 수로 정확히 재현된다 (analyticsStats.ts:238,244,250).
    const { op, cust } = body.performance;
    expect(op.offerAcceptRate).toBe(ratio(op.accepted, op.accepted + op.rejected));
    expect(cust.requestSuccessRate).toBe(ratio(cust.requestsWithAccepted, cust.totalRequests));
    expect(body.money.surveyPaid.avg).toBe(
      ratio(body.money.surveyPaid.sum, body.money.surveyPaid.count),
    );
    expect(cust.requestsWithAccepted).toBeLessThanOrEqual(cust.totalRequests);

    // ② byUrgencyOpen 은 항상 세 키를 채운다 (:224-228).
    expect(Object.keys(body.operational.byUrgencyOpen).sort()).toEqual([
      'CRITICAL',
      'NORMAL',
      'URGENT',
    ]);
    // ③ byStatus 키는 RequestStatus 값만 나온다.
    for (const key of Object.keys(body.operational.byStatus)) {
      expect(
        ['RECEIVED', 'ASSIGNED', 'ACCEPTED', 'DISPATCHED', 'COMPLETED', 'CANCELED'],
        `byStatus 에 낯선 키 ${key}`,
      ).toContain(key);
    }
    // ④ commission 은 두 키를 항상 채운다 (:251).
    expect(Object.keys(body.money.commission).sort()).toEqual(['PAID', 'PENDING']);

    // ⑤ trend 는 KST 일 버킷이 오름차순·중복 없이 나온다 (:152-158).
    expect(body.trend.length).toBeGreaterThan(0);
    const buckets = body.trend.map((row) => row.bucket);
    expect(buckets).toEqual([...buckets].sort());
    expect(new Set(buckets).size).toBe(buckets.length);
    for (const bucket of buckets) expect(bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(buckets.length).toBe(period === 'day' ? 1 : period === 'week' ? 7 : 30);
  });
}

test('analytics/dashboard GET 400 (:15) — period 가 day/week/month 가 아니다', async () => {
  const res = await admin.get('/api/admin/analytics/dashboard?period=year');
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({
    error: 'period는 day, week, month 중 하나여야 합니다',
  });
});

test('analytics/dashboard GET 200 — period 생략 시 day 로 기본값이 잡힌다 (:13)', async () => {
  const [omitted, explicit] = await Promise.all([
    admin.get('/api/admin/analytics/dashboard'),
    admin.get('/api/admin/analytics/dashboard?period=day'),
  ]);
  expect(omitted.status()).toBe(200);
  const a = (await omitted.json()) as { trend: unknown[] };
  const b = (await explicit.json()) as { trend: unknown[] };
  expect(a.trend.length).toBe(b.trend.length);
  expect(a.trend.length).toBe(1);
});

test('analytics/dashboard GET 200 — 내가 만든 접수가 byStatus 에 반영된다', async () => {
  await f.createRequestFixture({ status: 'CANCELED' });
  const res = await admin.get('/api/admin/analytics/dashboard?period=day');
  const body = (await res.json()) as { operational: { byStatus: Record<string, number> } };
  // byStatus 는 기간 필터가 없는 전역 groupBy (:174) — 방금 만든 CANCELED 가 반드시 있다.
  expect(body.operational.byStatus.CANCELED).toBeGreaterThanOrEqual(1);
});

// ── surveys ────────────────────────────────────────────────────────────────

test('analytics/surveys GET 200 — shape · responseRate 와 paidStats.avg 자기일관성', async () => {
  const res = await admin.get('/api/admin/analytics/surveys');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    responseRate: number | null;
    submitted: number;
    total: number;
    pending: { items: Array<{ elapsedDays: number }>; total: number; hasNext: boolean };
    paidStats: { sum: number; count: number; avg: number | null };
  };
  expect(shapeViolations(body, shapeOf('/api/admin/analytics/surveys'))).toEqual([]);

  // surveyAnalytics.ts:65 · :79 — 같은 응답 안의 값으로 정확히 재현된다.
  expect(body.responseRate).toBe(ratio(body.submitted, body.total));
  expect(body.paidStats.avg).toBe(ratio(body.paidStats.sum, body.paidStats.count));

  // 페이지 크기 계약: 한 페이지는 50건이고 hasNext 는 그 초과 여부다 (:3, :77).
  expect(body.pending.items.length).toBeLessThanOrEqual(50);
  if (body.pending.hasNext) expect(body.pending.items.length).toBe(50);
  for (const item of body.pending.items) {
    expect(Number.isInteger(item.elapsedDays)).toBe(true);
    expect(item.elapsedDays).toBeGreaterThanOrEqual(0);
  }
});

// ── ratings ────────────────────────────────────────────────────────────────

test('analytics/ratings GET 200 — shape · 정렬 계약 (avgRating desc, null 최하위)', async () => {
  const res = await admin.get('/api/admin/analytics/ratings');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    ranking: Array<{ subjectKey: string; type: string; avgRating: number | null; reviewCount: number }>;
  };
  expect(shapeViolations(body, shapeOf('/api/admin/analytics/ratings'))).toEqual([]);

  for (const row of body.ranking) {
    expect(row.subjectKey.startsWith(`${row.type}:`), row.subjectKey).toBe(true);
    expect(['PROVIDER', 'TECHNICIAN']).toContain(row.type);
    expect(row.reviewCount).toBeGreaterThanOrEqual(0);
    // avgRating 이 있으면 1~5 범위 안이고, 없으면 리뷰가 0건이다 (ratingsAnalytics.ts:56-64).
    if (row.avgRating === null) expect(row.reviewCount).toBe(0);
    else {
      expect(row.avgRating).toBeGreaterThanOrEqual(1);
      expect(row.avgRating).toBeLessThanOrEqual(5);
      expect(row.reviewCount).toBeGreaterThan(0);
    }
  }
  // null 은 항상 뒤로 밀린다 (:86-90).
  const firstNull = body.ranking.findIndex((row) => row.avgRating === null);
  if (firstNull >= 0) {
    expect(body.ranking.slice(firstNull).every((row) => row.avgRating === null)).toBe(true);
  }
});

// ── ratings/[subject] ──────────────────────────────────────────────────────

test('analytics/ratings/[subject] GET 400 (:11) — subject 형식 위반', async () => {
  for (const subject of ['BOGUS:xyz', 'justtext', 'PROVIDER']) {
    const res = await admin.get(`/api/admin/analytics/ratings/${encodeURIComponent(subject)}`);
    expect(res.status(), subject).toBe(400);
    expect((await res.json()).error).toContain('subject는');
  }
});

test('analytics/ratings/[subject] GET 404 (:16) — 형식은 맞지만 대상이 없다', async () => {
  const tech = await admin.get('/api/admin/analytics/ratings/TECHNICIAN:e2e-no-such-technician');
  expect(tech.status()).toBe(404);
  expect(await tech.json()).toMatchObject({ error: '대상을 찾을 수 없습니다' });

  const provider = await admin.get('/api/admin/analytics/ratings/PROVIDER:e2e-no-such-provider');
  expect(provider.status()).toBe(404);
  expect(await provider.json()).toMatchObject({ error: '대상을 찾을 수 없습니다' });
});

test('analytics/ratings/[subject] GET 200 — 리뷰 0건 대상은 빈 상세를 돌려준다', async () => {
  const partner = await f.createPartnerFixture();
  const res = await admin.get(`/api/admin/analytics/ratings/PROVIDER:${partner.providerId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(shapeViolations(body, shapeOf('/api/admin/analytics/ratings/[subject]'))).toEqual([]);
  // 이 대상은 내가 방금 만들었으므로 절대값이 결정적이다 (id 스코프).
  expect(body).toEqual({
    monthly: [],
    reviews: { items: [], total: 0, hasNext: false, nextCursor: null },
  });
});

test('analytics/ratings/[subject] GET 200 — 내 기술자의 제출 리뷰가 월 버킷과 목록에 잡힌다', async () => {
  const tech = await f.createTechFixture();
  const request = await f.createRequestFixture({ status: 'COMPLETED' });
  await prisma.satisfactionSurvey.create({
    data: {
      requestId: request.id,
      token: `e2e-rating-${request.id}`,
      technicianId: tech.technicianId,
      rating: 5,
      comment: 'E2E 리뷰',
      // paidAmount 는 비운다 — 채우면 정산 리포트 집계에 잡힌다.
      submittedAt: PAST_SUBMITTED_AT,
    },
  });

  const res = await admin.get(`/api/admin/analytics/ratings/TECHNICIAN:${tech.technicianId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    monthly: Array<{ bucket: string; avgRating: number | null; reviewCount: number }>;
    reviews: { items: Array<{ rating: number; comment: string | null }>; total: number; hasNext: boolean; nextCursor: string | null };
  };
  expect(shapeViolations(body, shapeOf('/api/admin/analytics/ratings/[subject]'))).toEqual([]);
  expect(body.monthly).toEqual([{ bucket: PAST_BUCKET, avgRating: 5, reviewCount: 1 }]);
  expect(body.reviews.total).toBe(1);
  expect(body.reviews.hasNext).toBe(false);
  expect(body.reviews.nextCursor).toBeNull();
  expect(body.reviews.items).toHaveLength(1);
  expect(body.reviews.items[0]).toMatchObject({ rating: 5, comment: 'E2E 리뷰' });

  // 랭킹에도 같은 대상이 같은 값으로 나타난다 (두 엔드포인트의 일관성).
  const ranking = (await (await admin.get('/api/admin/analytics/ratings')).json()) as {
    ranking: Array<{ subjectKey: string; avgRating: number | null; reviewCount: number; name: string }>;
  };
  const mine = ranking.ranking.find((r) => r.subjectKey === `TECHNICIAN:${tech.technicianId}`);
  expect(mine, '랭킹에 내 기술자가 없다').toBeTruthy();
  expect(mine).toMatchObject({ avgRating: 5, reviewCount: 1, name: tech.name });
});

// ── map/regions ────────────────────────────────────────────────────────────

test('analytics/map/regions GET 200 — 시도 레벨 shape · 내부 일관성', async () => {
  const res = await admin.get('/api/admin/analytics/map/regions');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    level: string;
    sido: string | null;
    regions: Array<{ key: string; name: string; supply: number; demand: number; pressure: number | null; state: string }>;
    gapAlerts: Array<{ key: string; name: string; demand: number }>;
    unknownLocation: { count: number; reasons: Record<string, number> };
  };
  expect(shapeViolations(body, shapeOf('/api/admin/analytics/map/regions'))).toEqual([]);

  expect(body.level).toBe('sido');
  expect(body.sido).toBeNull();
  expect(body.regions.length).toBeGreaterThan(0);
  // 키는 중복되지 않는다.
  const keys = body.regions.map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const row of body.regions) {
    expect(row.supply).toBeGreaterThanOrEqual(0);
    expect(row.demand).toBeGreaterThanOrEqual(0);
    // 시도 레벨에서는 key 자체가 시도명이고 name 도 같다 (mapOverview.ts:113).
    expect(row.name).toBe(row.key);
  }
  // gapAlerts ⊆ regions 이고 전부 CRITICAL_ALERT 다 (:126-129).
  for (const alert of body.gapAlerts) {
    const row = body.regions.find((r) => r.key === alert.key);
    expect(row, `gapAlerts 의 ${alert.key} 가 regions 에 없다`).toBeTruthy();
    expect(row!.state).toBe('CRITICAL_ALERT');
    expect(row!.demand).toBe(alert.demand);
  }
  // unknownLocation.count 는 reasons 의 합이다 (:131-134).
  const reasonSum = Object.values(body.unknownLocation.reasons).reduce((a, b) => a + b, 0);
  expect(body.unknownLocation.count).toBe(reasonSum);
});

test('analytics/map/regions GET 200 — sido 를 주면 시군구 레벨로 내려간다', async () => {
  const res = await admin.get('/api/admin/analytics/map/regions?sido=서울특별시');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    level: string;
    sido: string | null;
    regions: Array<{ key: string; name: string; hasSigungu: boolean }>;
  };
  expect(shapeViolations(body, shapeOf('/api/admin/analytics/map/regions'))).toEqual([]);
  expect(body.level).toBe('sigungu');
  expect(body.sido).toBe('서울특별시');
  expect(body.regions.length).toBeGreaterThan(0);
  for (const row of body.regions) {
    expect(row.key.startsWith('서울특별시 '), row.key).toBe(true);
    expect(row.key).toBe(`서울특별시 ${row.name}`);
    // 시군구 키에는 하위 시군구가 없다 (REGIONS['서울특별시 강남구'] 는 undefined).
    expect(row.hasSigungu).toBe(false);
  }
  expect(body.regions.some((r) => r.key === '서울특별시 강남구')).toBe(true);
});

test('analytics/map/regions GET 400 (:17) — 없는 시도', async () => {
  for (const sido of ['서울', '없는특별시', '강남구']) {
    const res = await admin.get(
      `/api/admin/analytics/map/regions?sido=${encodeURIComponent(sido)}`,
    );
    expect(res.status(), sido).toBe(400);
    expect(await res.json()).toMatchObject({ error: '유효하지 않은 시도입니다' });
  }
});

// ── map/dispatch ───────────────────────────────────────────────────────────

test('analytics/map/dispatch GET 200 — 좌표 있는 내 출동 건만 핀이 된다', async () => {
  const pinned = await f.createRequestFixture({
    status: 'DISPATCHED',
    address: '서울특별시 강남구 테헤란로 152',
    lat: 37.5006,
    lng: 127.0364,
  });
  const noCoords = await f.createRequestFixture({ status: 'DISPATCHED', lat: null, lng: null });
  const notDispatched = await f.createRequestFixture({
    status: 'ACCEPTED',
    lat: 37.4,
    lng: 127.1,
  });

  const res = await admin.get('/api/admin/analytics/map/dispatch');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    pins: Array<{ requestId: string; lookupCode: string; lat: number; lng: number; address: string | null }>;
    unknownCount: number;
  };
  expect(shapeViolations(body, shapeOf('/api/admin/analytics/map/dispatch'))).toEqual([]);

  const mine = body.pins.find((p) => p.requestId === pinned.id);
  expect(mine, '좌표 있는 DISPATCHED 건이 핀에 없다').toBeTruthy();
  expect(mine).toMatchObject({
    lookupCode: pinned.lookupCode,
    address: '서울특별시 강남구 테헤란로 152',
  });
  expect(mine!.lat).toBeCloseTo(37.5006, 4);
  expect(mine!.lng).toBeCloseTo(127.0364, 4);

  // 좌표 없는 출동 건과 출동 아닌 건은 핀이 되지 않는다.
  expect(body.pins.some((p) => p.requestId === noCoords.id)).toBe(false);
  expect(body.pins.some((p) => p.requestId === notDispatched.id)).toBe(false);
  // 좌표 없는 출동 건이 최소 1건 있으므로 unknownCount 의 하한이 성립한다.
  expect(body.unknownCount).toBeGreaterThanOrEqual(1);
});
