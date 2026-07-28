import { expect, request as apiRequest, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { freshIp } from '../helpers/ip';
import { FixtureFactory, ephemeralPhone } from '../helpers/fixtures';
import { smsRequestReceived } from '../../src/lib/sms/templates';

// ───────────────────────────────────────────────────────────────────────────
// 고객 접수 계약 — POST /api/requests (src/app/api/requests/route.ts)
//
// 이 라우트는 IP당 10분 10회 레이트리밋을 가진다(route.ts:78). 그 검사가 본문 파싱보다
// **먼저**라 400 을 노린 요청도 카운터를 올린다 — 그래서 테스트마다 freshIp 로 버킷을
// 분리한다(beforeEach). 레이트리밋 자체는 전용 버킷을 끝까지 태우는 마지막 테스트가 검증한다.
//
// ⚠️ 네임스페이스 주의: 이 스펙이 만드는 접수는 **제품이** 조회코드를 발급하므로
// (route.ts:34-44 randomInt) 9001 대역 밖으로 떨어진다. 따라서 응답 id 를 받는
// 즉시 f.trackRequest() 로 등록하고 afterAll 의 cleanupAll() 로 회수한다.
// 등록 전에 단언을 넣지 말 것 — 실패 시 행이 영구 잔재가 된다(계획 실패 4).
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const f = new FixtureFactory(prisma);

/** 음성만으로 접수했을 때 본문에 들어가는 자리표시자 — src/lib/stt/index.ts:11 */
const VOICE_PLACEHOLDER = '🎤 음성 접수 (텍스트 변환 전)';

/**
 * 이 스펙이 만드는 접수를 식별하는 **유일한 값**. 다른 어떤 스펙·워커도 쓰지 않는다.
 * 접수 id 는 제품이 발급하므로 미리 알 수 없고(9001 대역 밖), 응답을 받아 등록하기
 * 전에 죽으면 id 추적만으로는 정리가 그 행을 영영 못 찾는다. afterAll 이 이 이름으로
 * 전수 회수해 "이 스펙이 만들 수 있는 것은 어느 줄에서 죽든 정리가 찾는다"를 보장한다.
 */
const INTAKE_CUSTOMER = 'E2E 접수고객';

/** 정상 접수 payload. 주소는 formal sido 형(src/lib/regions.ts:114-126 요구). */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    customerName: INTAKE_CUSTOMER,
    customerPhone: ephemeralPhone(),
    description: 'E2E 계약 테스트: 콘센트에서 스파크가 납니다',
    urgency: 'NORMAL',
    lat: null,
    lng: null,
    address: '서울특별시 강남구 테헤란로 152',
    ...overrides,
  };
}

let ctx: APIRequestContext;

// ⚠️ POST /api/requests 는 IP당 10분 10회 레이트리밋을 가진다(route.ts:78) — 그 검사가
// 본문 파싱보다 **먼저**라, 이 스펙의 11개 POST 를 한 버킷에 몰면 뒤쪽 테스트가
// 노린 400 대신 429 를 받는다. 테스트마다 새 버킷을 발급해 격리한다.
// (레이트리밋 자체는 전용 seed 를 끝까지 태우는 별도 테스트가 검증한다.)
test.beforeEach(async () => {
  ctx = await apiRequest.newContext(
    await apiContextOptions(null, {}, { 'x-forwarded-for': freshIp('customer-intake') }),
  );
});

test.afterEach(async () => {
  await ctx.dispose();
});

test.afterAll(async () => {
  // ctx 는 afterEach 가 이미 정리한다 — 여기서 또 dispose 하면 이미 닫힌 컨텍스트다.
  // id 추적과 무관하게 이 스펙의 흔적을 이름으로 전수 회수한다 — 지난 실행의 잔재까지 잡힌다.
  const orphans = await prisma.serviceRequest.findMany({
    where: { customerName: INTAKE_CUSTOMER },
    select: { id: true },
  });
  for (const o of orphans) f.trackRequest(o.id);
  await f.cleanupAll();
  await prisma.$disconnect();
});

/** 응답을 파싱하고, id 가 있으면 **단언보다 먼저** 정리 대상으로 등록한다. */
async function trackedJson(res: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  const body = (await res.json()) as Record<string, unknown>;
  if (typeof body?.id === 'string') f.trackRequest(body.id);
  return body;
}

// ── 성공 경로 ────────────────────────────────────────────────────────────

test('접수 JSON: 200 + 6자리 lookupCode + 접수 SMS 본문이 템플릿과 일치', async () => {
  const data = payload();
  const res = await ctx.post('/api/requests', { data });
  const body = await trackedJson(res);

  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.lookupCode).toMatch(/^\d{6}$/); // route.ts:166
  expect(typeof body.id).toBe('string');

  const row = await prisma.serviceRequest.findUnique({ where: { id: body.id as string } });
  expect(row?.status).toBe('RECEIVED');
  expect(row?.customerName).toBe(data.customerName);
  expect(row?.customerPhone).toBe(data.customerPhone);
  expect(row?.address).toBe(data.address);
  expect(row?.voiceFileId).toBeNull();

  // route.ts:161 은 sendSms 를 **await** 한다 — 응답 시점에 이미 기록돼 있으므로
  // fire-and-forget 6개 사이트(계획 실패 3)와 달리 poll 이 필요 없다.
  const sms = await prisma.smsLog.findFirst({ where: { requestId: body.id as string } });
  expect(sms, 'SmsLog 행이 없습니다 (route.ts:161 은 await 이므로 즉시 있어야 한다)').not.toBeNull();
  expect(sms?.body).toBe(smsRequestReceived(data.customerName)); // templates.ts:8
  expect(sms?.to).toBe(data.customerPhone);
  // 과금 게이트 — 'solapi' 면 실발송이 나간 것이다(계획 Step 8-1, R1).
  expect(sms?.provider, '실 SMS 게이트웨이로 발송됐습니다 — 즉시 중단하세요').toBe('console');
});

test('접수 multipart(음성 없음): 200 + lat/lng 문자열이 숫자로 파싱된다', async () => {
  const data = payload({ urgency: 'URGENT' });
  const res = await ctx.post('/api/requests', {
    multipart: {
      customerName: data.customerName as string,
      customerPhone: data.customerPhone as string,
      description: data.description as string,
      urgency: 'URGENT',
      address: data.address as string,
      lat: '37.5006',
      lng: '127.0364',
    },
  });
  const body = await trackedJson(res);

  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.lookupCode).toMatch(/^\d{6}$/);

  const row = await prisma.serviceRequest.findUnique({ where: { id: body.id as string } });
  expect(row?.urgency).toBe('URGENT');
  expect(row?.lat).toBeCloseTo(37.5006, 4); // route.ts:46-51 formNum
  expect(row?.lng).toBeCloseTo(127.0364, 4);
});

test('접수 multipart(음성 첨부): StoredFile 저장 + 본문이 음성 자리표시자로 채워진다', async () => {
  const data = payload();
  const res = await ctx.post('/api/requests', {
    multipart: {
      customerName: data.customerName as string,
      customerPhone: data.customerPhone as string,
      description: '', // 음성만으로 접수 — route.ts:93-98 은 voice 가 있으므로 통과
      urgency: 'NORMAL',
      address: data.address as string,
      voice: {
        name: 'voice.webm',
        mimeType: 'audio/webm',
        buffer: Buffer.from('e2e-fake-webm-payload'),
      },
    },
  });
  const body = await trackedJson(res);

  expect(res.status(), JSON.stringify(body)).toBe(200);

  const row = await prisma.serviceRequest.findUnique({ where: { id: body.id as string } });
  expect(row?.voiceMime).toBe('audio/webm');
  expect(row?.voiceFileId).not.toBeNull();
  expect(row?.description).toBe(VOICE_PLACEHOLDER); // route.ts:146

  const file = await prisma.storedFile.findUnique({ where: { id: row!.voiceFileId! } });
  expect(file?.mime).toBe('audio/webm');
});

// ── zod 400 (route.ts:84-90) ─────────────────────────────────────────────

test('400: 이름 누락 (:21)', async () => {
  const res = await ctx.post('/api/requests', { data: payload({ customerName: '' }) });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe('이름을 입력해 주세요');
});

test('400: 전화번호 형식 (:22-25)', async () => {
  for (const bad of ['12345678', '1012345678', '0101', '']) {
    const res = await ctx.post('/api/requests', { data: payload({ customerPhone: bad }) });
    expect(res.status(), `phone=${bad}`).toBe(400);
    expect((await res.json()).error, `phone=${bad}`).toBe('전화번호 형식이 올바르지 않습니다');
  }
});

test('400: urgency 열거값 위반 (:28)', async () => {
  for (const bad of ['SOON', '', 'normal']) {
    const res = await ctx.post('/api/requests', { data: payload({ urgency: bad }) });
    expect(res.status(), `urgency=${bad}`).toBe(400);
    // 이 라우트의 400 은 전부 같은 코드라 **메시지를 봐야** 어느 분기가 탔는지 알 수 있다.
    // 이름·전화번호가 유효하므로 issues[0] 은 urgency 여야 한다 (zod 는 필드 선언 순서로 모은다).
    expect((await res.json()).error, `urgency=${bad}`).toContain(
      '"CRITICAL"|"URGENT"|"NORMAL"',
    );
  }
});

test('400: 텍스트도 음성도 없음 (:93-98)', async () => {
  const res = await ctx.post('/api/requests', { data: payload({ description: '   ' }) });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe('고장 내용을 입력하거나 음성으로 남겨 주세요');
});

test('400: 0바이트 음성은 첨부로 세지 않아 "내용 없음" 분기가 탄다 (:66 → :93-98)', async () => {
  // route.ts:66 은 `v.size > 0` 일 때만 File 을 voice 로 인정한다. 빈 녹음 파일이면
  // voice=null 이 되어 MIME 분기(:106)까지 가지 않고 :93-98 이 먼저 탄다.
  // 메시지로 그 사실을 고정한다 — 코드만 보면 MIME 400 과 구분되지 않는다.
  const data = payload();
  const res = await ctx.post('/api/requests', {
    multipart: {
      customerName: data.customerName as string,
      customerPhone: data.customerPhone as string,
      description: '',
      urgency: 'NORMAL',
      voice: { name: 'empty.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(0) },
    },
  });
  const body = await trackedJson(res);
  expect(res.status(), JSON.stringify(body)).toBe(400);
  expect(body.error).toBe('고장 내용을 입력하거나 음성으로 남겨 주세요');
});

test('400: 잘못된 JSON 본문 (:77-81)', async () => {
  // Buffer 로 보내야 원문 그대로 전달된다 — 문자열을 주면 Playwright 가 JSON 으로
  // 다시 직렬화해 유효한 JSON 이 되고, 파싱 분기(:77-81)가 아니라 zod 분기가 탄다.
  const res = await ctx.post('/api/requests', {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"customerName": '),
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe('잘못된 요청입니다');
});

// ── 음성 검증 400 (route.ts:104-117) ─────────────────────────────────────

test('400: 지원하지 않는 음성 MIME (:106-111)', async () => {
  const data = payload();
  const res = await ctx.post('/api/requests', {
    multipart: {
      customerName: data.customerName as string,
      customerPhone: data.customerPhone as string,
      description: data.description as string,
      urgency: 'NORMAL',
      voice: {
        name: 'not-audio.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 e2e'),
      },
    },
  });
  const body = await trackedJson(res);
  expect(res.status(), JSON.stringify(body)).toBe(400);
  expect(body.error).toBe('지원하지 않는 음성 형식입니다');
  // 거부된 요청은 행을 만들지 않는다 (StoredFile 은 MIME 통과 후에야 생성된다).
  expect(body.id).toBeUndefined();
});

test('400: 음성 15MB 초과 (:112-117)', async () => {
  test.setTimeout(120_000); // 15MB 업로드 — 기본 30초로는 부족할 수 있다
  const data = payload();
  const res = await ctx.post('/api/requests', {
    multipart: {
      customerName: data.customerName as string,
      customerPhone: data.customerPhone as string,
      description: data.description as string,
      urgency: 'NORMAL',
      voice: {
        name: 'too-big.webm',
        mimeType: 'audio/webm',
        // MIME 검사(:106)를 통과해야 크기 분기(:112)에 도달한다 — 지원 포맷으로 보낸다.
        buffer: Buffer.alloc(15 * 1024 * 1024 + 1024),
      },
    },
  });
  const body = await trackedJson(res);
  expect(res.status(), JSON.stringify(body)).toBe(400);
  expect(body.error).toBe('음성 파일이 너무 큽니다 (최대 15MB)');
  expect(body.id).toBeUndefined();
});

// ── 레이트리밋 ─────────────────────────────────────────────────────────────
// D1 수정 검증. 이 라우트는 접수 1건마다 실 SMS 를 await 로 보내므로, 제한이 없으면
// 인증 없이 무한 반복해 과금과 제3자 문자 폭탄을 만들 수 있었다.
//
// 카운터를 태울 때 일부러 zod 위반 본문을 쓴다 — 레이트리밋이 파싱보다 먼저라(:78 → :116)
// 카운터는 똑같이 오르면서 ServiceRequest 행은 하나도 만들지 않는다. 즉 이 테스트는
// 정리할 잔재를 남기지 않는다.
test('IP당 10분 10회를 넘으면 429 (route.ts:78) — 그 앞 10회는 정상 처리된다', async () => {
  const burner = await apiRequest.newContext(
    await apiContextOptions(null, {}, { 'x-forwarded-for': freshIp('intake-429') }),
  );
  try {
    const invalid = { customerName: '', customerPhone: '', description: '', urgency: 'NORMAL' };

    // 양성 대조 — 앞 10회는 레이트리밋이 아니라 검증에서 걸린다.
    // 이게 없으면 "이 라우트는 늘 429" 인 결함과 구분되지 않는다.
    for (let i = 1; i <= 10; i++) {
      const res = await burner.post('/api/requests', { data: invalid });
      expect(res.status(), `${i}번째 요청은 아직 한도 안이어야 한다`).toBe(400);
    }

    const limited = await burner.post('/api/requests', { data: invalid });
    const body = await limited.json();
    expect(limited.status(), JSON.stringify(body)).toBe(429);
    expect(body.error).toBe('접수 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

    // 유효한 본문도 똑같이 막힌다 — 제한이 검증보다 앞선다는 증거.
    // (429 가 나므로 접수 행은 생성되지 않는다 — 정리할 잔재 없음.)
    const validButLimited = await burner.post('/api/requests', { data: payload() });
    expect(validButLimited.status()).toBe(429);
  } finally {
    await burner.dispose();
  }
});
