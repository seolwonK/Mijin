import { expect, test } from '@playwright/test';

// 전 응답 공통 보안 헤더 계약 (next.config.ts).
//
// 본인확인 이용기관 자체점검에서 브라우저 측 방어선으로 함께 확인되는 항목들이라,
// 누가 next.config.ts 의 headers() 를 지우면 여기서 걸리게 못박는다.
// CloudType 엣지가 주는 HSTS 에 기대지 않고 앱이 직접 내리는 것이 요점이다.

const EXPECTED: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(self), geolocation=(self), payment=()',
};

test('페이지 응답에 보안 헤더가 모두 실린다', async ({ request }) => {
  const res = await request.get('/tech/signup');
  expect(res.status()).toBe(200);
  const headers = res.headers();
  for (const [key, value] of Object.entries(EXPECTED)) {
    expect(headers[key], key).toBe(value);
  }
});

test('API 응답에도 같은 헤더가 실린다', async ({ request }) => {
  const res = await request.get('/api/identity/config');
  expect(res.status()).toBe(200);
  const headers = res.headers();
  for (const [key, value] of Object.entries(EXPECTED)) {
    expect(headers[key], key).toBe(value);
  }
});
