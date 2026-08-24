import { test, expect } from '@playwright/test';

// 브라우저가 본인인증 시작 전에 받아가는 공개 설정 계약 (src/app/api/identity/config/route.ts).
// E2E 서버는 IDENTITY_PROVIDER 미설정(mock) 이므로 mock 을 돌려주고, API Secret 같은 비밀은
// 어떤 경우에도 응답에 실리지 않는다.
test('GET /api/identity/config — mock 환경에서는 provider=mock 만 내려주고 비밀값은 없다', async ({
  request,
}) => {
  const res = await request.get('/api/identity/config');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('no-store');
  const body = await res.json();
  expect(body).toEqual({ provider: 'mock' });
  expect(JSON.stringify(body)).not.toMatch(/secret/i);
});
