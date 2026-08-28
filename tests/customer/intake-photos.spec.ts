import { expect, request as apiRequest, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { freshIp, ipHeaders } from '../helpers/ip';
import { FixtureFactory, ephemeralPhone } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 접수 사진 계약 — POST /api/requests(사진 첨부) + GET /api/requests/[id]/photos/[photoId]
//
// 두 가지를 못 박는다:
//   ① 저장   — 선언된 MIME 이 아니라 **파일 내용**으로 포맷을 정하고, 지원 밖 포맷·장수·
//              용량 초과는 접수 자체를 400 으로 막는다.
//   ② 열람   — 사진은 집 내부가 찍히는 개인정보다. 관리자와 **그 접수에 배정된** 업체/
//              기술자만 통과하고, 나머지는 무세션과 같은 401 로 떨어진다.
//
// E2E 서버는 R2_BUCKET 이 빈 값이다(playwright.config.ts) — 사진은 DB(StoredFile) 폴백으로
// 저장되고, 운영 버킷에 테스트 오브젝트가 쌓이지 않는다. 그 폴백 행은 픽스처 정리가
// RequestPhoto.fileId 를 걷어 회수한다(helpers/fixtures.ts).
//
// ⚠️ POST /api/requests 는 IP당 10분 10회 레이트리밋을 가진다 — 테스트마다 freshIp 로
// 버킷을 분리한다(intake-api.spec.ts 와 같은 이유).
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const f = new FixtureFactory(prisma);

/** 이 스펙이 만드는 접수를 식별하는 유일한 값 — afterAll 이 이 이름으로 전수 회수한다. */
const PHOTO_CUSTOMER = 'E2E 사진접수고객';

/** 서버는 매직바이트로 포맷을 판정하므로(photos.ts:sniffPhotoMime) 헤더만 진짜면 된다. */
function jpegBytes(marker: number): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, marker, 0x11, 0x22, 0x33]);
}
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const GIF_BYTES = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

type MultipartFile = { name: string; mimeType: string; buffer: Buffer };

function photoPart(buffer: Buffer, name: string, mimeType: string): MultipartFile {
  return { name, mimeType, buffer };
}

/** 정상 접수 multipart 본문. photos 는 호출부가 덧붙인다. */
function base(): Record<string, string> {
  return {
    customerName: PHOTO_CUSTOMER,
    customerPhone: ephemeralPhone(),
    description: 'E2E 계약 테스트: 분전반 차단기가 내려갑니다',
    urgency: 'NORMAL',
    address: '서울특별시 강남구 테헤란로 152',
  };
}

let ctx: APIRequestContext;

test.beforeEach(async () => {
  ctx = await apiRequest.newContext(
    await apiContextOptions(null, {}, { 'x-forwarded-for': freshIp('customer-photos') }),
  );
});

test.afterEach(async () => {
  await ctx.dispose();
});

test.afterAll(async () => {
  const orphans = await prisma.serviceRequest.findMany({
    where: { customerName: PHOTO_CUSTOMER },
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

/** 사진 n장을 붙여 접수하고 접수 id 를 돌려준다. */
async function intakeWithPhotos(files: MultipartFile[]): Promise<string> {
  // Playwright 의 multipart 는 객체 키가 필드명이라 같은 이름을 두 번 줄 수 없다.
  // FormData 를 직접 만들어 photos 를 반복 append 한다.
  const form = new FormData();
  for (const [k, v] of Object.entries(base())) form.append(k, v);
  for (const file of files) {
    form.append(
      'photos',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
      file.name,
    );
  }
  const res = await ctx.post('/api/requests', { multipart: form });
  const body = await trackedJson(res);
  expect(res.status(), JSON.stringify(body)).toBe(200);
  return body.id as string;
}

// ── ① 저장 ───────────────────────────────────────────────────────────────

test('사진 2장 첨부: RequestPhoto 2행 + 첨부 순서(sort) 보존 + DB 폴백 저장', async () => {
  const id = await intakeWithPhotos([
    photoPart(jpegBytes(0xaa), 'first.jpg', 'image/jpeg'),
    photoPart(PNG_BYTES, 'second.png', 'image/png'),
  ]);

  const photos = await prisma.requestPhoto.findMany({
    where: { requestId: id },
    orderBy: { sort: 'asc' },
  });
  expect(photos).toHaveLength(2);
  expect(photos.map((p) => p.mime)).toEqual(['image/jpeg', 'image/png']);
  expect(photos.map((p) => p.sort)).toEqual([0, 1]);
  expect(photos[0].size).toBe(jpegBytes(0xaa).byteLength);

  // R2_BUCKET 이 빈 값이므로 본문은 StoredFile 로 간다(photos.ts:saveRequestPhotos).
  expect(photos[0].storageKey).toBeNull();
  expect(photos[0].fileId).not.toBeNull();
  const stored = await prisma.storedFile.findUnique({ where: { id: photos[0].fileId! } });
  expect(Buffer.from(stored!.data)).toEqual(jpegBytes(0xaa));
});

test('사진 없이 접수해도 그대로 200 — 사진은 선택 항목이다', async () => {
  const id = await intakeWithPhotos([]);
  expect(await prisma.requestPhoto.count({ where: { requestId: id } })).toBe(0);
});

test('선언된 MIME 이 아니라 파일 내용으로 포맷을 정한다', async () => {
  // 브라우저가 붙이는 타입은 확장자에서 온다. 그대로 믿고 저장하면 나중에 그 MIME 그대로
  // 되돌려주게 되고, 관리자 브라우저가 못 여는 파일이 조용히 쌓인다.
  const id = await intakeWithPhotos([photoPart(jpegBytes(0xbb), 'liar.png', 'image/png')]);
  const photo = await prisma.requestPhoto.findFirst({ where: { requestId: id } });
  expect(photo?.mime).toBe('image/jpeg');
});

test('400: 지원하지 않는 형식은 접수를 막는다', async () => {
  const form = new FormData();
  for (const [k, v] of Object.entries(base())) form.append(k, v);
  form.append('photos', new Blob([new Uint8Array(GIF_BYTES)], { type: 'image/gif' }), 'x.gif');

  const res = await ctx.post('/api/requests', { multipart: form });
  const body = await trackedJson(res);
  expect(res.status()).toBe(400);
  expect(body.error).toBe('지원하지 않는 사진 형식입니다 (JPG·PNG·WEBP만 가능)');
});

test('400: 6장째부터는 거부한다 (상한 5장)', async () => {
  const form = new FormData();
  for (const [k, v] of Object.entries(base())) form.append(k, v);
  for (let i = 0; i < 6; i++) {
    form.append(
      'photos',
      new Blob([new Uint8Array(jpegBytes(i))], { type: 'image/jpeg' }),
      `${i}.jpg`,
    );
  }

  const res = await ctx.post('/api/requests', { multipart: form });
  const body = await trackedJson(res);
  expect(res.status()).toBe(400);
  expect(body.error).toBe('사진은 최대 5장까지 첨부할 수 있습니다');
});

// ── ② 열람 ───────────────────────────────────────────────────────────────

test('사진 열람: 관리자만 통과하고, 배정된 기술자도 통과한다', async () => {
  const requestId = await intakeWithPhotos([photoPart(jpegBytes(0xcc), 'a.jpg', 'image/jpeg')]);
  const photo = await prisma.requestPhoto.findFirstOrThrow({ where: { requestId } });
  const url = `/api/requests/${requestId}/photos/${photo.id}`;

  // 무세션 — 사진은 공개 URL 로 나가지 않는다.
  const anon = await apiRequest.newContext(await apiContextOptions(null));
  expect((await anon.get(url)).status()).toBe(401);
  await anon.dispose();

  // 관리자 — 본문까지 그대로 돌려준다.
  const admin = await apiRequest.newContext(await apiContextOptions('ADMIN'));
  const adminRes = await admin.get(url);
  expect(adminRes.status()).toBe(200);
  expect(adminRes.headers()['content-type']).toBe('image/jpeg');
  // 선언 MIME 을 그대로 싣는 응답이므로 브라우저 스니핑을 막아둔다.
  expect(adminRes.headers()['x-content-type-options']).toBe('nosniff');
  // 캐시를 허용하면 **권한이 바뀐 뒤에도** 같은 URL 이 캐시에서 열린다 — 배포 환경에서
  // 무세션 요청이 캐시 히트로 200 을 받는 것을 실측했다(2026-08-20). 음성 라우트와 동일 정책.
  expect(adminRes.headers()['cache-control']).toBe('private, no-store');
  expect(Buffer.from(await adminRes.body())).toEqual(jpegBytes(0xcc));
  await admin.dispose();

  const tech = await f.createTechFixture();

  // 배정 전 — 접수와 아무 관계가 없으므로 무세션과 같은 401.
  const before = await apiRequest.newContext(
    await apiContextOptions('TECHNICIAN', { technicianId: tech.technicianId }),
  );
  expect((await before.get(url)).status()).toBe(401);
  await before.dispose();

  // 배정 후 — 응답 대기(REQUESTED) 단계에서도 봐야 출동 여부를 판단할 수 있다.
  await prisma.assignment.create({
    data: {
      requestId,
      technicianId: tech.technicianId,
      status: 'REQUESTED',
      assignedBy: 'ADMIN',
    },
  });
  const after = await apiRequest.newContext(
    await apiContextOptions('TECHNICIAN', { technicianId: tech.technicianId }),
  );
  const afterRes = await after.get(url);
  expect(afterRes.status()).toBe(200);
  expect(Buffer.from(await afterRes.body())).toEqual(jpegBytes(0xcc));
  await after.dispose();
});

test('사진 열람: 배정 없는 업체는 401, 다른 접수의 사진 id 는 404', async () => {
  const [mine, other] = await Promise.all([
    intakeWithPhotos([photoPart(jpegBytes(0x11), 'mine.jpg', 'image/jpeg')]),
    intakeWithPhotos([photoPart(jpegBytes(0x22), 'other.jpg', 'image/jpeg')]),
  ]);
  const otherPhoto = await prisma.requestPhoto.findFirstOrThrow({
    where: { requestId: other },
  });

  const partner = await f.createPartnerFixture();
  const partnerCtx = await apiRequest.newContext(
    await apiContextOptions('PROVIDER', { providerId: partner.providerId }),
  );
  const minePhoto = await prisma.requestPhoto.findFirstOrThrow({ where: { requestId: mine } });
  expect((await partnerCtx.get(`/api/requests/${mine}/photos/${minePhoto.id}`)).status()).toBe(
    401,
  );
  await partnerCtx.dispose();

  // 권한은 접수 단위로 검사한다 — 통과한 접수에 다른 접수의 사진 id 를 끼워 넣지 못한다.
  const admin = await apiRequest.newContext(await apiContextOptions('ADMIN'));
  const crossed = await admin.get(`/api/requests/${mine}/photos/${otherPhoto.id}`);
  expect(crossed.status()).toBe(404);
  await admin.dispose();
});

// ── ③ 접수 화면(UI) ──────────────────────────────────────────────────────

/**
 * 진짜 1×1 PNG. 브라우저가 **디코드할 수 있어야** 하므로 매직바이트만 흉내낸 버퍼로는
 * 안 된다 — 접수 화면은 원본을 캔버스에 다시 그려 JPEG 으로 인코딩해 올리고
 * (PhotoInput.tsx: EXIF 회전 반영 + GPS 등 메타데이터 제거), 디코드가 실패하면
 * 업로드가 아니라 안내 문구가 뜬다.
 */
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('접수 화면 사진 첨부(UI)', () => {
  // UI 층도 고유 IP 버킷을 쓴다 — 접수 POST 는 IP당 10분 10회다.
  test.use({ extraHTTPHeaders: ipHeaders('customer-photos-ui') });

  test('앨범에서 고른 PNG 가 JPEG 으로 변환돼 첨부되고, 관리자가 그 본문을 받는다', async ({
    page,
  }) => {
    // next dev 의 콜드 컴파일을 감안한다(journey.spec.ts 의 COLD_NAV 와 같은 이유).
    test.setTimeout(180_000);

    const customerPhone = ephemeralPhone();
    await page.goto('/request/new');

    // 파일 입력은 감춰져 있고 버튼으로만 연다 — setInputFiles 는 보이지 않아도 동작한다.
    await page.locator('#req-photos input[type="file"][multiple]').setInputFiles({
      name: 'site.png',
      mimeType: 'image/png',
      buffer: REAL_PNG,
    });
    // 변환·썸네일 생성이 끝나야 미리보기가 뜬다.
    await expect(page.getByAltText('첨부한 사진 1')).toBeVisible();

    await page.locator('#req-desc textarea').fill('E2E UI: 분전반 사진을 첨부합니다');
    await page.getByRole('radio', { name: '일반' }).click();
    await page
      .locator('#req-loc input[type="text"]')
      .fill('서울특별시 강남구 테헤란로 152');
    await page.locator('#req-name').fill(PHOTO_CUSTOMER);
    await page.locator('#req-phone').fill(customerPhone);
    await page.locator('#req-agree').check();
    await page.getByRole('button', { name: '접수하기' }).click();

    await expect(page).toHaveURL(/\/request\/complete\/[^/]+$/, { timeout: 60_000 });
    const requestId = new URL(page.url()).pathname.split('/').pop()!;
    f.trackRequest(requestId);

    const photo = await prisma.requestPhoto.findFirstOrThrow({ where: { requestId } });
    // PNG 로 골랐지만 브라우저가 재인코딩해 보내므로 JPEG 으로 저장된다.
    expect(photo.mime).toBe('image/jpeg');

    const admin = await apiRequest.newContext(await apiContextOptions('ADMIN'));
    const res = await admin.get(`/api/requests/${requestId}/photos/${photo.id}`);
    expect(res.status()).toBe(200);
    const body = Buffer.from(await res.body());
    expect(body.byteLength).toBe(photo.size);
    expect([...body.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // JPEG SOI
    await admin.dispose();
  });
});
