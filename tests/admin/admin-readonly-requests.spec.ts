import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { FixtureFactory } from '../helpers/fixtures';
import { shapeViolations, type ShapeNode } from '../helpers/shapes';

// ───────────────────────────────────────────────────────────────────────────
// 계약: 관리자 접수 조회계 4핸들러 (계획 Step 7 — 조회계 표)
//
//   admin/requests            GET   (목록 · status/urgency 필터)
//   admin/requests/[id]       GET   (상세 · 404)
//   admin/requests/[id]/candidates GET (후보 · 404)
//   admin/requests/[id]/voice GET   (음성 · 200/206/416/400/404)
//
// 절대 집계값은 단언하지 않는다. 대신 **내가 만든 접수 id 의 존재/부재**와
// 응답 본문의 자기일관성만 본다 (계획 rev.5: 대역 전체 카운트 금지).
// G1/G2 는 tests/cross/auth-matrix.spec.ts 가 전수 단언한다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

const num: ShapeNode = { kind: 'number' };
const numOrNull: ShapeNode = { kind: 'nullableNumber' };
const str: ShapeNode = { kind: 'string' };
const strOrNull: ShapeNode = { kind: 'nullableString' };
const bool: ShapeNode = { kind: 'boolean' };
const obj = (of: Record<string, ShapeNode>): ShapeNode => ({ kind: 'object', of });
const arr = (of: ShapeNode): ShapeNode => ({ kind: 'array', of });

/** GET /api/admin/requests 목록 항목 — route.ts:37-56 */
const REQUEST_ROW_SHAPE = obj({
  id: str,
  lookupCode: str,
  customerName: str,
  customerPhone: str,
  description: str,
  urgency: str,
  status: str,
  address: strOrNull,
  needsAttention: bool,
  createdAt: str,
  assignBaseAt: str,
  assigneeName: strOrNull,
  assigneeKind: strOrNull,
  // survey 는 COMPLETED 가 아니면 null 이라 shape 로 강제하지 않는다 (:52-55).
});

/** GET /api/admin/requests/[id]/candidates 항목 — src/lib/matching.ts:8-24 */
const CANDIDATE_SHAPE = obj({
  kind: str,
  id: str,
  key: str,
  name: str,
  phone: str,
  address: str,
  regions: arr(str),
  isActive: bool,
  distanceKm: numOrNull,
  coversRegion: bool,
  rejectedThisRequest: bool,
  assigned30d: num,
  avgRating: num,
  reviewCount: num,
});

const SEOUL_ADDRESS = '서울특별시 강남구 테헤란로 152';

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

// ── GET /api/admin/requests ────────────────────────────────────────────────

test('requests GET 200 — 항목 shape 와 내 픽스처 값이 일치한다', async () => {
  const request = await f.createRequestFixture({
    status: 'CANCELED',
    urgency: 'URGENT',
    address: SEOUL_ADDRESS,
    description: 'E2E 조회계 픽스처',
  });

  const res = await admin.get('/api/admin/requests');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { requests: Array<Record<string, unknown>> };

  const row = body.requests.find((r) => r.id === request.id);
  expect(row, '방금 만든 접수가 목록에 없다').toBeTruthy();
  expect(shapeViolations(row, REQUEST_ROW_SHAPE)).toEqual([]);
  expect(Object.keys(row!).sort()).toEqual(
    [
      'address',
      'assignBaseAt',
      'assigneeKind',
      'assigneeName',
      'createdAt',
      'customerName',
      'customerPhone',
      'description',
      'id',
      'lookupCode',
      'needsAttention',
      'status',
      'survey',
      'urgency',
    ].sort(),
  );
  expect(row).toMatchObject({
    lookupCode: request.lookupCode,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    description: 'E2E 조회계 픽스처',
    urgency: 'URGENT',
    status: 'CANCELED',
    address: SEOUL_ADDRESS,
    needsAttention: false,
    assigneeName: null,
    assigneeKind: null,
    // COMPLETED 가 아니면 survey 는 무조건 null 이다 (:52-55).
    survey: null,
  });
});

test('requests GET 200 — status/urgency 필터가 걸리고, 모르는 값은 무시된다 (:20-21)', async () => {
  const request = await f.createRequestFixture({ status: 'CANCELED', urgency: 'NORMAL' });
  const has = async (query: string) => {
    const res = await admin.get(`/api/admin/requests${query}`);
    expect(res.status(), query).toBe(200);
    const body = (await res.json()) as { requests: Array<{ id: string }> };
    return body.requests.some((r) => r.id === request.id);
  };

  expect(await has('?status=CANCELED'), 'status=CANCELED 에 내 건이 없다').toBe(true);
  expect(await has('?status=RECEIVED'), 'status=RECEIVED 가 필터되지 않았다').toBe(false);
  expect(await has('?urgency=CRITICAL'), 'urgency=CRITICAL 이 필터되지 않았다').toBe(false);
  // 화이트리스트에 없는 값은 조건 자체가 붙지 않는다 → 필터 없는 결과와 같다.
  expect(await has('?status=BOGUS'), 'status=BOGUS 가 조용히 무시되지 않았다').toBe(true);
  expect(await has('?urgency=BOGUS'), 'urgency=BOGUS 가 조용히 무시되지 않았다').toBe(true);
});

test('requests GET 200 — 배정 대상이 있으면 assigneeName/Kind 가 채워진다 (:49-50)', async () => {
  const tech = await f.createTechFixture({ contractStatus: 'CONFIRMED' });
  const request = await f.createRequestFixture({ status: 'ACCEPTED' });
  await prisma.assignment.create({
    data: {
      requestId: request.id,
      technicianId: tech.technicianId,
      status: 'ACCEPTED',
      assignedBy: 'ADMIN',
    },
  });

  const res = await admin.get('/api/admin/requests?status=ACCEPTED');
  const body = (await res.json()) as { requests: Array<Record<string, unknown>> };
  const row = body.requests.find((r) => r.id === request.id);
  expect(row).toBeTruthy();
  expect(row).toMatchObject({ assigneeName: tech.name, assigneeKind: 'TECHNICIAN' });
});

// ── GET /api/admin/requests/[id] ───────────────────────────────────────────

test('requests/[id] GET 404 (:28) — 없는 id', async () => {
  const res = await admin.get('/api/admin/requests/e2e-no-such-request');
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '접수를 찾을 수 없습니다' });
});

test('requests/[id] GET 200 — 상세 shape · waitMinutes 가 긴급도별 설정과 맞는다', async () => {
  const request = await f.createRequestFixture({
    status: 'CANCELED',
    urgency: 'URGENT',
    address: SEOUL_ADDRESS,
    lat: 37.5006,
    lng: 127.0364,
  });

  const res = await admin.get(`/api/admin/requests/${request.id}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;

  expect(Object.keys(body).sort()).toEqual(
    [
      'address',
      'assignBaseAt',
      'assignments',
      'autoAssignEnabled',
      'completedAt',
      'createdAt',
      'customerName',
      'customerPhone',
      'description',
      'hasVoice',
      'id',
      'lat',
      'lng',
      'lookupCode',
      'needsAttention',
      'photos',
      'status',
      'survey',
      'urgency',
      'voiceTranscript',
      'waitMinutes',
    ].sort(),
  );
  expect(body).toMatchObject({
    id: request.id,
    lookupCode: request.lookupCode,
    urgency: 'URGENT',
    status: 'CANCELED',
    address: SEOUL_ADDRESS,
    hasVoice: false,
    voiceTranscript: null,
    completedAt: null,
    assignments: [],
    survey: null,
    // pretest-guard 가 서버 부팅 전에 끈 상태가 그대로 보여야 한다 (계획 1b).
    autoAssignEnabled: false,
  });

  // waitMinutes 는 긴급도 → AppSettings 컬럼 매핑이다 (:33-39). 설정값과 대조한다.
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  expect(body.waitMinutes).toBe(settings!.waitMinutesUrgent);
});

test('requests/[id] GET 200 — 배정 이력이 최신순으로 직렬화된다 (:60-69)', async () => {
  const tech = await f.createTechFixture({ contractStatus: 'CONFIRMED' });
  const partner = await f.createPartnerFixture();
  const request = await f.createRequestFixture({ status: 'ACCEPTED' });

  const older = await prisma.assignment.create({
    data: {
      requestId: request.id,
      providerId: partner.providerId,
      status: 'REJECTED',
      assignedBy: 'AUTO',
      rejectReason: '일정 불가',
      respondedAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 120_000),
      distanceKm: 3.5,
    },
  });
  const newer = await prisma.assignment.create({
    data: {
      requestId: request.id,
      technicianId: tech.technicianId,
      status: 'ACCEPTED',
      assignedBy: 'ADMIN',
    },
  });

  const res = await admin.get(`/api/admin/requests/${request.id}`);
  const body = (await res.json()) as {
    assignments: Array<{
      id: string;
      status: string;
      assignedBy: string;
      distanceKm: number | null;
      rejectReason: string | null;
      assignee: { kind: string; name: string } | null;
    }>;
  };
  expect(body.assignments.map((a) => a.id)).toEqual([newer.id, older.id]);
  expect(body.assignments[0]).toMatchObject({
    status: 'ACCEPTED',
    assignedBy: 'ADMIN',
    distanceKm: null,
    rejectReason: null,
  });
  expect(body.assignments[0].assignee).toMatchObject({ kind: 'TECHNICIAN', name: tech.name });
  expect(body.assignments[1]).toMatchObject({
    status: 'REJECTED',
    assignedBy: 'AUTO',
    distanceKm: 3.5,
    rejectReason: '일정 불가',
  });
  expect(body.assignments[1].assignee).toMatchObject({ kind: 'PROVIDER', name: partner.name });
});

// ── GET /api/admin/requests/[id]/candidates ────────────────────────────────

test('candidates GET 404 (:19) — 없는 id', async () => {
  const res = await admin.get('/api/admin/requests/e2e-no-such-request/candidates');
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '접수를 찾을 수 없습니다' });
});

test('candidates GET 200 — 계약·승인·활성 게이트가 멤버십으로 드러난다', async () => {
  // 배정 후보가 되는 조건 (src/lib/matching.ts:44-58):
  //   업체  = isActive && approvalStatus APPROVED
  //   전기기사 = 위 + contract.status === 'CONFIRMED'
  const confirmed = await f.createTechFixture({ contractStatus: 'CONFIRMED' });
  const noContract = await f.createTechFixture();
  const draftContract = await f.createTechFixture({ contractStatus: 'DRAFT' });
  const activeProvider = await f.createPartnerFixture();
  const pendingProvider = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  const inactiveProvider = await f.createPartnerFixture({ isActive: false });

  const request = await f.createRequestFixture({ status: 'CANCELED', address: SEOUL_ADDRESS });
  const res = await admin.get(`/api/admin/requests/${request.id}/candidates`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    candidates: Array<{ key: string; distanceKm: number | null; coversRegion: boolean }>;
    hasCoords: boolean;
  };
  expect(shapeViolations(body.candidates, arr(CANDIDATE_SHAPE))).toEqual([]);

  const keys = new Set(body.candidates.map((c) => c.key));
  // 순서는 단언하지 않는다 — 좌표 유무·타 워커 픽스처에 따라 흔들린다 (계획 R8).
  expect(keys.has(`TECHNICIAN:${confirmed.technicianId}`), 'CONFIRMED 전기기사가 빠졌다').toBe(true);
  expect(keys.has(`PROVIDER:${activeProvider.providerId}`), '승인·활성 업체가 빠졌다').toBe(true);
  expect(keys.has(`TECHNICIAN:${noContract.technicianId}`), '계약 없는 전기기사가 들어왔다').toBe(false);
  expect(keys.has(`TECHNICIAN:${draftContract.technicianId}`), 'DRAFT 계약 전기기사가 들어왔다').toBe(false);
  expect(keys.has(`PROVIDER:${pendingProvider.providerId}`), '미승인 업체가 들어왔다').toBe(false);
  expect(keys.has(`PROVIDER:${inactiveProvider.providerId}`), '비활성 업체가 들어왔다').toBe(false);

  // 접수에 좌표가 없으면 hasCoords=false 이고 거리는 전부 null 이다 (matching.ts:70-73).
  expect(body.hasCoords).toBe(false);
  expect(body.candidates.every((c) => c.distanceKm === null)).toBe(true);
});

test('candidates GET 200 — 좌표가 있으면 hasCoords 와 거리 계산이 켜진다', async () => {
  const tech = await f.createTechFixture({
    contractStatus: 'CONFIRMED',
    lat: 37.4979,
    lng: 127.0276,
  });
  const request = await f.createRequestFixture({
    status: 'CANCELED',
    address: SEOUL_ADDRESS,
    lat: 37.5006,
    lng: 127.0364,
  });

  const res = await admin.get(`/api/admin/requests/${request.id}/candidates`);
  const body = (await res.json()) as {
    candidates: Array<{ key: string; distanceKm: number | null }>;
    hasCoords: boolean;
  };
  expect(body.hasCoords).toBe(true);
  const mine = body.candidates.find((c) => c.key === `TECHNICIAN:${tech.technicianId}`);
  expect(mine, '내 전기기사가 후보에 없다').toBeTruthy();
  expect(mine!.distanceKm).not.toBeNull();
  expect(mine!.distanceKm!).toBeGreaterThan(0);
  expect(mine!.distanceKm!).toBeLessThan(5);
});

test('candidates GET 200 — 이 접수를 거절한 대상은 rejectedThisRequest 로 표시된다', async () => {
  const rejecter = await f.createTechFixture({ contractStatus: 'CONFIRMED' });
  const other = await f.createTechFixture({ contractStatus: 'CONFIRMED' });
  const request = await f.createRequestFixture({ status: 'CANCELED', address: SEOUL_ADDRESS });
  await prisma.assignment.create({
    data: {
      requestId: request.id,
      technicianId: rejecter.technicianId,
      status: 'REJECTED',
      assignedBy: 'ADMIN',
      respondedAt: new Date(),
    },
  });

  const res = await admin.get(`/api/admin/requests/${request.id}/candidates`);
  const body = (await res.json()) as {
    candidates: Array<{ key: string; rejectedThisRequest: boolean }>;
  };
  const find = (key: string) => body.candidates.find((c) => c.key === key);
  expect(find(`TECHNICIAN:${rejecter.technicianId}`)!.rejectedThisRequest).toBe(true);
  expect(find(`TECHNICIAN:${other.technicianId}`)!.rejectedThisRequest).toBe(false);
});

// ── GET /api/admin/requests/[id]/voice ─────────────────────────────────────

const VOICE_BYTES = Buffer.from('E2E-VOICE-PAYLOAD-0123456789', 'utf8');

async function attachVoice(requestId: string): Promise<string> {
  const stored = await prisma.storedFile.create({
    data: { mime: 'audio/webm', data: VOICE_BYTES },
  });
  f.trackFile(stored.id);
  await prisma.serviceRequest.update({
    where: { id: requestId },
    data: { voiceFileId: stored.id, voiceMime: 'audio/webm' },
  });
  return stored.id;
}

test('voice GET 404 (:23) — 접수가 없거나 음성이 붙어 있지 않다', async () => {
  const missing = await admin.get('/api/admin/requests/e2e-no-such-request/voice');
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ error: '음성 녹음이 없습니다' });

  const request = await f.createRequestFixture();
  const noVoice = await admin.get(`/api/admin/requests/${request.id}/voice`);
  expect(noVoice.status()).toBe(404);
  expect(await noVoice.json()).toMatchObject({ error: '음성 녹음이 없습니다' });
});

test('voice GET 404 (:33) — voiceFileId 는 있는데 StoredFile 이 없다', async () => {
  const request = await f.createRequestFixture();
  // ServiceRequest.voiceFileId 는 FK 가 아니라 평범한 문자열이라(schema.prisma:210)
  // 실제로 매달린 참조를 만들 수 있다.
  await prisma.serviceRequest.update({
    where: { id: request.id },
    data: { voiceFileId: 'e2e-dangling-file-id', voiceMime: 'audio/webm' },
  });

  const res = await admin.get(`/api/admin/requests/${request.id}/voice`);
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '파일을 찾을 수 없습니다' });
});

test('voice GET 400 (:41) — 레거시 경로가 업로드 루트를 벗어난다', async () => {
  const request = await f.createRequestFixture();
  await prisma.serviceRequest.update({
    where: { id: request.id },
    data: { voicePath: '../../etc/passwd', voiceMime: 'audio/webm' },
  });

  const res = await admin.get(`/api/admin/requests/${request.id}/voice`);
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '잘못된 경로입니다' });
});

test('voice GET 404 (:46) — 레거시 경로는 안전하지만 파일이 없다', async () => {
  const request = await f.createRequestFixture();
  await prisma.serviceRequest.update({
    where: { id: request.id },
    data: { voicePath: 'uploads/e2e-does-not-exist.webm', voiceMime: 'audio/webm' },
  });

  const res = await admin.get(`/api/admin/requests/${request.id}/voice`);
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '파일을 읽을 수 없습니다' });
});

test('voice GET 200 — 전체 본문과 캐시/Range 헤더', async () => {
  const request = await f.createRequestFixture();
  await attachVoice(request.id);

  const res = await admin.get(`/api/admin/requests/${request.id}/voice`);
  expect(res.status()).toBe(200);
  const headers = res.headers();
  expect(headers['content-type']).toContain('audio/webm');
  expect(headers['accept-ranges']).toBe('bytes');
  // 개인정보라 캐시를 금지한다 (:52).
  expect(headers['cache-control']).toBe('private, no-store');
  expect(headers['content-length']).toBe(String(VOICE_BYTES.length));
  expect(Buffer.compare(await res.body(), VOICE_BYTES)).toBe(0);

  // 상세 API 도 음성 부착을 반영한다 (requests/[id]:47).
  const detail = await admin.get(`/api/admin/requests/${request.id}`);
  expect((await detail.json()).hasVoice).toBe(true);
});

test('voice GET 206 — Range 부분 응답 (:58-74)', async () => {
  const request = await f.createRequestFixture();
  await attachVoice(request.id);
  const total = VOICE_BYTES.length;

  const head = await admin.get(`/api/admin/requests/${request.id}/voice`, {
    headers: { range: 'bytes=0-3' },
  });
  expect(head.status()).toBe(206);
  expect(head.headers()['content-range']).toBe(`bytes 0-3/${total}`);
  expect(head.headers()['content-length']).toBe('4');
  expect(Buffer.compare(await head.body(), VOICE_BYTES.subarray(0, 4))).toBe(0);

  // 열린 범위 — 끝까지.
  const openEnded = await admin.get(`/api/admin/requests/${request.id}/voice`, {
    headers: { range: 'bytes=5-' },
  });
  expect(openEnded.status()).toBe(206);
  expect(openEnded.headers()['content-range']).toBe(`bytes 5-${total - 1}/${total}`);
  expect(Buffer.compare(await openEnded.body(), VOICE_BYTES.subarray(5))).toBe(0);

  // suffix 범위 — 마지막 4바이트 (:59 의 `buf.length - m[2]` 경로).
  const suffix = await admin.get(`/api/admin/requests/${request.id}/voice`, {
    headers: { range: 'bytes=-4' },
  });
  expect(suffix.status()).toBe(206);
  expect(suffix.headers()['content-range']).toBe(`bytes ${total - 4}-${total - 1}/${total}`);
  expect(Buffer.compare(await suffix.body(), VOICE_BYTES.subarray(total - 4))).toBe(0);
});

test('voice GET 416 (:61-66) — 범위가 본문 밖이다', async () => {
  const request = await f.createRequestFixture();
  await attachVoice(request.id);

  const res = await admin.get(`/api/admin/requests/${request.id}/voice`, {
    headers: { range: 'bytes=999999-' },
  });
  expect(res.status()).toBe(416);
  expect(res.headers()['content-range']).toBe(`bytes */${VOICE_BYTES.length}`);
});
