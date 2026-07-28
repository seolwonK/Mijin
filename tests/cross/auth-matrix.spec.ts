import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  GUARDED_ROUTES,
  PUBLIC_ROUTES,
  ROUTES,
  fillPath,
  routeKey,
  type RouteEntry,
  type HttpMethod,
} from '../helpers/routes';
import { apiContextOptions, type SessionRole } from '../helpers/auth';
import { ipHeaders, runNonce } from '../helpers/ip';

// ───────────────────────────────────────────────────────────────────────────
// 무세션·교차역할 401 전수 (계획 Step 3a)
//
// 표(helpers/routes.ts)를 돌면서 가드 핸들러 58개마다 테스트를 하나씩 만든다.
// 루프가 아니라 테스트를 생성하는 이유: 리포터 출력에 58개 (path, method) 가
// 이름으로 남아야 "조용히 빠진 라우트"가 눈에 보인다. 매트릭스 완전성 자체는
// matrix-completeness.spec.ts 가 파일시스템과 대조해 보증한다.
//
// 경로 파라미터는 **존재하지 않는 id** 를 쓴다. 가드가 세션 검사를 먼저 하므로
// 401 판정에는 영향이 없고(전 라우트 실측: 401 반환 지점은 세션 가드가 유일),
// 양성대조(올바른 역할 → 401 아님)에서도 DB 를 건드리지 않는다.
// ───────────────────────────────────────────────────────────────────────────

const MISSING_ID = `e2e-missing-${runNonce()}`;
const PATH_PARAMS = { id: MISSING_ID, subject: 'technician', token: MISSING_ID };

/** 라우트 역할별로, 401 이 나와야 하는 **다른** 역할들. */
const MISMATCHED_ROLES: Record<SessionRole, SessionRole[]> = {
  ADMIN: ['TECHNICIAN', 'PROVIDER'],
  TECHNICIAN: ['ADMIN', 'PROVIDER'],
  PROVIDER: ['ADMIN', 'TECHNICIAN'],
};

/** 교차역할 세션에 넣을 합성 id — 실존하지 않아도 역할 판정에는 충분하다. */
const SYNTHETIC_IDS: Record<SessionRole, Record<string, string>> = {
  ADMIN: {},
  TECHNICIAN: { technicianId: `${MISSING_ID}-tech` },
  PROVIDER: { providerId: `${MISSING_ID}-partner` },
};

async function send(ctx: APIRequestContext, path: string, method: HttpMethod) {
  const url = fillPath(path, PATH_PARAMS);
  // 변경 메서드에는 빈 JSON 을 준다. 가드를 통과하는 양성대조에서도
  // 전 핸들러가 zod 400 또는 404 로 떨어지고 어떤 행도 쓰지 않는다(실측).
  switch (method) {
    case 'GET':
      return ctx.get(url);
    case 'POST':
      return ctx.post(url, { data: {} });
    case 'PUT':
      return ctx.put(url, { data: {} });
    case 'PATCH':
      return ctx.patch(url, { data: {} });
    case 'DELETE':
      return ctx.delete(url);
  }
}

let anon: APIRequestContext;
const sessions = new Map<SessionRole, APIRequestContext>();

test.beforeAll(async ({ playwright }) => {
  anon = await playwright.request.newContext({
    ...(await apiContextOptions(null, {}, ipHeaders('auth-matrix-anon'))),
  });
  for (const role of ['ADMIN', 'TECHNICIAN', 'PROVIDER'] as const) {
    sessions.set(
      role,
      await playwright.request.newContext(
        await apiContextOptions(role, SYNTHETIC_IDS[role], ipHeaders(`auth-matrix-${role}`)),
      ),
    );
  }
});

test.afterAll(async () => {
  await anon.dispose();
  for (const ctx of sessions.values()) await ctx.dispose();
});

test('매트릭스 분류: 가드 58 / 공개 13, 가입 2건은 공개로 유지된다', () => {
  expect(ROUTES.length).toBe(71);
  expect(GUARDED_ROUTES.length).toBe(58);
  expect(PUBLIC_ROUTES.length).toBe(13);
  // 이 둘은 설계상 공개다. 가드로 옮기면 401 을 단언하는 붉은 테스트가 두 개
  // 생기지만 제품은 정상이다 — 분류를 여기서 못 박아 그 사고를 막는다.
  for (const path of ['/api/tech/signup', '/api/partner/signup']) {
    expect(
      PUBLIC_ROUTES.some((r) => r.path === path),
      `${path} 는 공개여야 한다 (가입 입구)`,
    ).toBe(true);
  }
  // 가드 목록에 공개 라우트가 섞여 들어오지 않았는지.
  expect(GUARDED_ROUTES.filter((r) => r.isPublic)).toEqual([]);
});

for (const entry of GUARDED_ROUTES as RouteEntry[]) {
  const label = routeKey(entry.path, entry.method);
  const owner = entry.role!;

  test(`가드: ${label}`, async () => {
    const unauthed = await send(anon, entry.path, entry.method);
    expect(unauthed.status(), `${label} — 무세션은 401 이어야 한다`).toBe(
      entry.expectedUnauthedStatus,
    );

    for (const role of MISMATCHED_ROLES[owner]) {
      const res = await send(sessions.get(role)!, entry.path, entry.method);
      expect(res.status(), `${label} — ${role} 세션(타역할)은 401 이어야 한다`).toBe(401);
    }

    // 양성대조: 401 이 "언제나 401" 이 아님을 보인다.
    // 존재하지 않는 id 를 줬으므로 400/404 등으로 떨어지지만 401 은 아니어야 한다.
    const owned = await send(sessions.get(owner)!, entry.path, entry.method);
    expect(owned.status(), `${label} — ${owner} 세션은 401 이면 안 된다`).not.toBe(401);
  });
}

test('공개 가입·로그인 입구는 무세션에서도 401 이 아니다', async () => {
  // 여기서 부르는 3개는 잘못된 본문이면 400 에서 멈추고 어떤 행도 쓰지 않는다.
  // 나머지 공개 10개(POST /api/requests 등)는 호출 자체가 데이터를 만들거나
  // 레이트리밋 버킷을 태우므로 각 역할 스펙에서 다룬다.
  const probes: Array<[string, Record<string, unknown>]> = [
    ['/api/tech/signup', {}],
    ['/api/partner/signup', {}],
    ['/api/auth/login', {}],
  ];
  for (const [path, body] of probes) {
    const res = await anon.post(path, { data: body, headers: ipHeaders(`public-probe:${path}`) });
    expect(res.status(), `${path} 는 공개 핸들러다`).not.toBe(401);
  }
});
