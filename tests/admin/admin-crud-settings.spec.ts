import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient, type AppSettings } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { GATES, expectGate } from '../helpers/gates';

// ───────────────────────────────────────────────────────────────────────────
// 계약: 관리자 설정 (계획 Step 7 — V* / H1 / S1)
//
//   src/app/api/admin/settings/route.ts   GET + PUT
//
// ⚠️ 이 스펙만의 특수 제약 — AppSettings(id=1) 는 **네임스페이스 밖 유일 허용 쓰기**다.
//    같은 행이 `autoAssignEnabled` 를 들고 있고, tests/pretest-guard.ts 가 이 값을
//    실행 전체에 걸쳐 false 로 고정한다(계획 1b·R3). PUT 은 전체 객체를 upsert 하므로
//    (route.ts:61-65) 이 플래그를 되살릴 수 있다. 그래서 여기서는:
//      1) PUT 본문의 autoAssignEnabled 를 **읽은 값 그대로** 되돌려주고
//      2) 매 테스트 finally 에서 원본 행 전체를 prisma 로 직접 복원하며
//         (API 를 거치지 않아 검증 실패로 복원이 막힐 수 없다)
//      3) PUT 후에도 플래그가 false 인지 명시적으로 단언한다.
//
//    또 하나: 사업주 정보 필드는 근로확인서가 스냅샷한다
//    (technicians/[id]/contract/route.ts:18-28). 값을 바꾸는 테스트는 창을 최소화하고
//    즉시 되돌린다. 값 변경 없이도 성립하는 S1(=updatedAt 전진)을 1차 근거로 삼는다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

let admin: APIRequestContext;

// PUT 의 400 은 :52(본문 파싱)와 :58(스키마) 두 개다. 상태코드만 보면 구별되지 않으므로
// 모든 하위 케이스에서 문구를 고정한다. 문구는 그림자 지도에서 끌어온다 —
// 제품이 문구를 바꾸면 gate-map.spec.ts 가 먼저 잡고, 여기는 자동으로 따라간다.
const SCHEMA_400 = expectGate('PUT /api/admin/settings', 58).message!;


test.beforeEach(async ({ playwright }) => {
  admin = await playwright.request.newContext(await apiContextOptions('ADMIN'));
});
test.afterEach(async () => {
  await admin.dispose();
});

/** GET 응답(=AppSettings 행)에서 PUT 스키마가 받는 필드만 추린다. id·updatedAt 은 제외. */
function putPayload(row: AppSettings): Record<string, unknown> {
  return {
    autoAssignEnabled: row.autoAssignEnabled,
    waitMinutesCritical: row.waitMinutesCritical,
    waitMinutesUrgent: row.waitMinutesUrgent,
    waitMinutesNormal: row.waitMinutesNormal,
    employerName: row.employerName,
    employerCeo: row.employerCeo,
    employerAddress: row.employerAddress,
    employerPhone: row.employerPhone,
    employerBizRegNo: row.employerBizRegNo,
    employerSignatureDataUrl: row.employerSignatureDataUrl,
    defaultDailyWage: row.defaultDailyWage,
    defaultMonthlyWage: row.defaultMonthlyWage,
    defaultPayDate: row.defaultPayDate,
    defaultPayMethod: row.defaultPayMethod,
  };
}

async function currentRow(): Promise<AppSettings> {
  const row = await prisma.appSettings.findUnique({ where: { id: 1 } });
  expect(row, 'AppSettings(id=1) 이 없다 — pretest-guard 가 돌지 않았다').toBeTruthy();
  return row!;
}

/** 원본 행 전체를 API 를 거치지 않고 되돌린다 (검증 실패로 복원이 막히지 않도록). */
async function restore(row: AppSettings): Promise<void> {
  await prisma.appSettings.update({ where: { id: 1 }, data: putPayload(row) });
}

// ── GET ────────────────────────────────────────────────────────────────────

test('settings GET 200 — 싱글턴 행을 upsert 해 돌려주고 워커 플래그는 꺼져 있다', async () => {
  const res = await admin.get('/api/admin/settings');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;

  expect(body.id).toBe(1);
  // pretest-guard 가 서버 부팅 **전에** 끈 상태가 실행 내내 유지되어야 한다 (계획 1b).
  expect(body.autoAssignEnabled, 'pretest-guard 의 워커 차단이 풀렸다').toBe(false);
  expect(Object.keys(body).sort()).toEqual(
    [
      'autoAssignEnabled',
      'defaultDailyWage',
      'defaultMonthlyWage',
      'defaultPayDate',
      'defaultPayMethod',
      'employerAddress',
      'employerBizRegNo',
      'employerCeo',
      'employerName',
      'employerPhone',
      'employerSignatureDataUrl',
      'id',
      'updatedAt',
      'waitMinutesCritical',
      'waitMinutesNormal',
      'waitMinutesUrgent',
    ].sort(),
  );
  for (const key of ['waitMinutesCritical', 'waitMinutesUrgent', 'waitMinutesNormal'] as const) {
    expect(typeof body[key]).toBe('number');
    expect(body[key] as number).toBeGreaterThanOrEqual(1);
    expect(body[key] as number).toBeLessThanOrEqual(1440);
  }
  expect(typeof body.employerName).toBe('string');
  expect(new Date(body.updatedAt as string).toString()).not.toBe('Invalid Date');
});

// ── PUT — 4xx 분기 ─────────────────────────────────────────────────────────

test('settings PUT 400 (:52) — 본문이 JSON 이 아니다', async () => {
  const before = await currentRow();
  const res = await admin.put('/api/admin/settings', {
    headers: { 'content-type': 'application/json' },
    // 원시 바이트로 보내야 req.json() 이 실제로 throw 한다 (문자열은 JSON 직렬화됨).
    data: Buffer.from('definitely not json'),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '잘못된 요청입니다' });

  // updatedAt 은 대조 기준으로 쓰지 않는다 — GET 핸들러가 upsert(:36-40) 라서
  // 남의 단순 조회만으로도 전진할 수 있다. 값 자체가 그대로인지를 본다.
  const after = await currentRow();
  expect(putPayload(after)).toEqual(putPayload(before));
  expect(after.autoAssignEnabled).toBe(false);
});

test('settings PUT 400 (:58) — zod 검증 실패는 아무것도 쓰지 않는다', async () => {
  const before = await currentRow();

  // ① 대기시간 범위 밖
  const outOfRange = await admin.put('/api/admin/settings', {
    data: { ...putPayload(before), waitMinutesNormal: 0 },
  });
  expect(outOfRange.status()).toBe(400);
  expect(await outOfRange.json()).toMatchObject({
    error: '설정값을 확인해 주세요 (대기시간은 1~1440분)',
  });

  const tooBig = await admin.put('/api/admin/settings', {
    data: { ...putPayload(before), waitMinutesCritical: 1441 },
  });
  expect(tooBig.status()).toBe(400);
  expect(await tooBig.json()).toMatchObject({ error: SCHEMA_400 });

  // ② 필수 필드 누락 — autoAssignEnabled 는 optional 이 아니다 (:13)
  const partial = { ...putPayload(before) } as Record<string, unknown>;
  delete partial.autoAssignEnabled;
  const missingFlag = await admin.put('/api/admin/settings', { data: partial });
  expect(missingFlag.status()).toBe(400);
  expect(await missingFlag.json()).toMatchObject({ error: SCHEMA_400 });

  // ③ 서명 이미지가 data URL 이 아니다 (:10)
  const badSignature = await admin.put('/api/admin/settings', {
    data: { ...putPayload(before), employerSignatureDataUrl: 'https://example.com/seal.png' },
  });
  expect(badSignature.status()).toBe(400);
  expect(await badSignature.json()).toMatchObject({ error: SCHEMA_400 });

  // ④ 사업주명 공백 (:18 min(1))
  const blankEmployer = await admin.put('/api/admin/settings', {
    data: { ...putPayload(before), employerName: '   ' },
  });
  expect(blankEmployer.status()).toBe(400);
  expect(await blankEmployer.json()).toMatchObject({ error: SCHEMA_400 });

  const after = await currentRow();
  expect(putPayload(after), '400 인데도 값이 바뀌었다').toEqual(putPayload(before));
  expect(after.autoAssignEnabled).toBe(false);
});

// ── PUT — 2xx + 부수효과 ───────────────────────────────────────────────────

test('settings PUT 200 — 같은 값을 되돌려도 행이 갱신되고 플래그는 그대로다 (S1)', async () => {
  const before = await currentRow();
  expect(before.autoAssignEnabled, 'pretest-guard 의 워커 차단이 풀렸다').toBe(false);

  const res = await admin.put('/api/admin/settings', { data: putPayload(before) });
  expect(res.status()).toBe(200);
  const echoed = (await res.json()) as Record<string, unknown>;
  expect(echoed.id).toBe(1);
  expect(echoed.autoAssignEnabled).toBe(false);
  expect(echoed.waitMinutesNormal).toBe(before.waitMinutesNormal);
  expect(echoed.employerName).toBe(before.employerName);

  // @updatedAt 은 값 변화 여부와 무관하게 매 update 마다 전진한다. 같은 밀리초 안에
  // 끝날 수도 있으므로 여기서는 "뒤로 가지 않는다"까지만 단언하고, 진짜 쓰기 증거는
  // 다음 테스트(값 변경 → DB 대조)가 든다.
  const after = await currentRow();
  expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
  expect(putPayload(after)).toEqual(putPayload(before));
  expect(after.autoAssignEnabled).toBe(false);
});

test('settings PUT 200 — 값 변경이 DB 에 반영되고 즉시 복원된다 (S1)', async () => {
  const before = await currentRow();
  const marker = `E2E 임시 주소 ${Date.now()}`;
  try {
    const res = await admin.put('/api/admin/settings', {
      data: {
        ...putPayload(before),
        employerAddress: marker,
        waitMinutesNormal: before.waitMinutesNormal === 60 ? 61 : 60,
      },
    });
    expect(res.status()).toBe(200);
    const echoed = (await res.json()) as Record<string, unknown>;
    expect(echoed.employerAddress).toBe(marker);
    // 응답만 보면 upsert 가 아니라 에코일 수도 있으므로 DB 를 직접 확인한다.
    const written = await currentRow();
    expect(written.employerAddress).toBe(marker);
    expect(written.waitMinutesNormal).toBe(before.waitMinutesNormal === 60 ? 61 : 60);
    expect(written.autoAssignEnabled, 'PUT 이 워커 플래그를 되살렸다').toBe(false);
  } finally {
    await restore(before);
  }

  const restored = await currentRow();
  expect(restored.employerAddress).toBe(before.employerAddress);
  expect(restored.waitMinutesNormal).toBe(before.waitMinutesNormal);
  expect(restored.autoAssignEnabled).toBe(false);
});

test('settings PUT 200 — nullable 필드는 null 로도 저장된다 (:24-29 의 nullish)', async () => {
  const before = await currentRow();
  try {
    const res = await admin.put('/api/admin/settings', {
      data: {
        ...putPayload(before),
        employerCeo: null,
        employerBizRegNo: null,
        defaultDailyWage: null,
        defaultPayMethod: null,
      },
    });
    expect(res.status()).toBe(200);
    const written = await currentRow();
    expect(written.employerCeo).toBeNull();
    expect(written.employerBizRegNo).toBeNull();
    expect(written.defaultDailyWage).toBeNull();
    expect(written.defaultPayMethod).toBeNull();
    expect(written.autoAssignEnabled).toBe(false);
  } finally {
    await restore(before);
  }
  expect((await currentRow()).employerCeo).toBe(before.employerCeo);
});

test('settings PUT 200 — defaultDailyWage 는 문자열 숫자를 coerce 한다 (:26)', async () => {
  const before = await currentRow();
  try {
    const res = await admin.put('/api/admin/settings', {
      data: { ...putPayload(before), defaultDailyWage: '123000' },
    });
    expect(res.status()).toBe(200);
    expect((await currentRow()).defaultDailyWage).toBe(123000);
  } finally {
    await restore(before);
  }
  expect((await currentRow()).defaultDailyWage).toBe(before.defaultDailyWage);
});

// ── 게이트 결박 ────────────────────────────────────────────────────────────
test('gate map 결박 — 이 스펙이 커버하는 분기와 문구가 gates.ts 와 일치한다', () => {
  const covered: Array<[number, number, string | null]> = [
    [52, 400, '잘못된 요청입니다'],
    [58, 400, '설정값을 확인해 주세요 (대기시간은 1~1440분)'],
  ];
  for (const [line, status, message] of covered) {
    const gate = expectGate('PUT /api/admin/settings', line);
    expect(gate.status, `:${line}`).toBe(status);
    expect(gate.message, `:${line}`).toBe(message);
  }
  expect(
    GATES['PUT /api/admin/settings'].gates.map((g) => g.line).sort((a, b) => a - b),
    'PUT /api/admin/settings 의 4xx 분기 중 커버하지 않은 것이 있다',
  ).toEqual(covered.map(([line]) => line).sort((a, b) => a - b));
  // GET 은 4xx 분기가 없다 (401 만 있고 그건 auth-matrix 담당).
  expect(GATES['GET /api/admin/settings']).toBeUndefined();
});
