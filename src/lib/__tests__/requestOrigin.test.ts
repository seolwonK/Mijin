import { describe, expect, it } from 'vitest';
import { isCrossSiteRequest } from '@/lib/requestOrigin';

function req(url: string, headers: Record<string, string>) {
  return { url, headers: new Headers(headers) };
}

describe('isCrossSiteRequest', () => {
  it('Origin 이 없으면 false (비브라우저·Playwright request)', () => {
    expect(isCrossSiteRequest(req('http://localhost:3000/api/auth/login', {}))).toBe(false);
  });

  it('같은 호스트의 Origin 은 false', () => {
    expect(
      isCrossSiteRequest(
        req('http://localhost:3000/api/auth/login', { origin: 'http://localhost:3000', host: 'localhost:3000' }),
      ),
    ).toBe(false);
  });

  it('프록시 뒤: 내부 URL 이 달라도 x-forwarded-host 와 같으면 false (프로토콜 무시)', () => {
    expect(
      isCrossSiteRequest(
        req('http://0.0.0.0:3000/api/auth/login', {
          origin: 'https://mijin.example.kr',
          host: '0.0.0.0:3000',
          'x-forwarded-host': 'mijin.example.kr',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe(false);
  });

  it('다른 호스트의 Origin 은 true', () => {
    expect(
      isCrossSiteRequest(
        req('http://localhost:3000/api/auth/logout', { origin: 'https://evil.example', host: 'localhost:3000' }),
      ),
    ).toBe(true);
  });

  it("Origin: null 은 true", () => {
    expect(isCrossSiteRequest(req('http://localhost:3000/x', { origin: 'null', host: 'localhost:3000' }))).toBe(true);
  });

  it('Sec-Fetch-Site: cross-site 는 Origin 없이도 true, same-origin 은 false', () => {
    expect(isCrossSiteRequest(req('http://localhost:3000/x', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(
      isCrossSiteRequest(
        req('http://localhost:3000/x', {
          'sec-fetch-site': 'same-origin',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        }),
      ),
    ).toBe(false);
  });
});
