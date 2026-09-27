import { describe, expect, it } from 'vitest';
import { decodeJwt, jwtVerify } from 'jose';
import {
  CUSTOMER_REFRESH_THRESHOLD_SECONDS,
  pickSessionClaims,
  sessionCookieOptions,
  sessionMaxAgeSeconds,
  shouldRefreshSession,
  signSession,
} from '@/lib/sessionPolicy';

const DAY = 86_400;
const secret = new TextEncoder().encode('unit-test-secret-unit-test-secret');

describe('sessionMaxAgeSeconds', () => {
  it('CUSTOMER 는 30일, 나머지 역할은 7일', () => {
    expect(sessionMaxAgeSeconds('CUSTOMER')).toBe(30 * DAY);
    for (const role of ['ADMIN', 'PROVIDER', 'TECHNICIAN']) {
      expect(sessionMaxAgeSeconds(role)).toBe(7 * DAY);
    }
  });

  it('쿠키 속성은 기존과 같고 maxAge 만 역할을 따른다', () => {
    const o = sessionCookieOptions('CUSTOMER');
    expect(o).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * DAY });
    expect(sessionCookieOptions('ADMIN').maxAge).toBe(7 * DAY);
  });
});

describe('signSession', () => {
  it('exp = iat + 역할별 수명', async () => {
    const now = 1_800_000_000;
    const c = decodeJwt(await signSession({ userId: 'u', role: 'CUSTOMER', name: '고객' }, secret, now));
    expect(c.iat).toBe(now);
    expect(c.exp).toBe(now + 30 * DAY);
    const t = decodeJwt(
      await signSession({ userId: 'u', role: 'TECHNICIAN', name: '기사', technicianId: 't1' }, secret, now),
    );
    expect(t.exp).toBe(now + 7 * DAY);
    expect(t.technicianId).toBe('t1');
  });

  it('재발급 토큰은 같은 세션 필드를 유지하고 검증을 통과한다', async () => {
    const old = await signSession({ userId: 'u1', role: 'CUSTOMER', name: '홍길동' }, secret);
    const { payload } = await jwtVerify(old, secret);
    const claims = pickSessionClaims(payload);
    expect(claims).toEqual({ userId: 'u1', role: 'CUSTOMER', name: '홍길동' });
    const fresh = await jwtVerify(await signSession(claims, secret), secret);
    expect(pickSessionClaims(fresh.payload)).toEqual(claims);
  });
});

describe('shouldRefreshSession', () => {
  const now = 1_800_000_000;
  it('CUSTOMER 이고 남은 기간이 15일 미만일 때만 true', () => {
    expect(shouldRefreshSession({ role: 'CUSTOMER', exp: now + 14 * DAY }, now)).toBe(true);
    expect(shouldRefreshSession({ role: 'CUSTOMER', exp: now + CUSTOMER_REFRESH_THRESHOLD_SECONDS - 1 }, now)).toBe(true);
    expect(shouldRefreshSession({ role: 'CUSTOMER', exp: now + CUSTOMER_REFRESH_THRESHOLD_SECONDS }, now)).toBe(false);
    expect(shouldRefreshSession({ role: 'CUSTOMER', exp: now + 30 * DAY }, now)).toBe(false);
  });
  it('다른 역할·exp 없음·이미 만료는 false', () => {
    expect(shouldRefreshSession({ role: 'ADMIN', exp: now + DAY }, now)).toBe(false);
    expect(shouldRefreshSession({ role: 'TECHNICIAN', exp: now + DAY }, now)).toBe(false);
    expect(shouldRefreshSession({ role: 'CUSTOMER' }, now)).toBe(false);
    expect(shouldRefreshSession({ role: 'CUSTOMER', exp: now - 1 }, now)).toBe(false);
  });
});
