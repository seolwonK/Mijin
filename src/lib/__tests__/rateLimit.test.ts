import { describe, expect, it } from 'vitest';
import { clientIp, createFailureLock, createRateLimiter } from '@/lib/rateLimit';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('clientIp', () => {
  it('x-forwarded-for 첫 값, 없으면 local', () => {
    expect(clientIp({ headers: new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }) })).toBe('1.2.3.4');
    expect(clientIp({ headers: new Headers() })).toBe('local');
  });
});

describe('createRateLimiter — 1분 10회 / 10분 30회', () => {
  const windows = [
    { limit: 10, windowMs: 60_000 },
    { limit: 30, windowMs: 600_000 },
  ];

  it('1분에 11번째부터 차단, 창이 지나면 풀린다', () => {
    const c = clock();
    const l = createRateLimiter(windows, c.now);
    for (let i = 0; i < 10; i++) expect(l.consume('ip')).toBe(false);
    expect(l.consume('ip')).toBe(true);
    expect(l.consume('other')).toBe(false);
    c.advance(60_000);
    expect(l.consume('ip')).toBe(false);
  });

  it('10분 창은 31번째부터 차단', () => {
    const c = clock();
    const l = createRateLimiter(windows, c.now);
    let allowed = 0;
    for (let m = 0; m < 5; m++) {
      for (let i = 0; i < 10; i++) if (!l.consume('ip')) allowed++;
      c.advance(60_000);
    }
    expect(allowed).toBe(30);
  });

  it('refund 한 시도는 세지 않는다(성공 로그인)', () => {
    const l = createRateLimiter(windows, clock().now);
    for (let i = 0; i < 50; i++) {
      expect(l.consume('ip')).toBe(false);
      l.refund('ip');
    }
  });
});

describe('createFailureLock — 실패 10회 → 15분 잠금', () => {
  const LOCK = 15 * 60_000;

  it('10번째 실패까지는 통과, 11번째 시도부터 잠김, 15분 뒤 풀림', () => {
    const c = clock();
    const lock = createFailureLock({ maxFailures: 10, lockMs: LOCK }, c.now);
    for (let i = 0; i < 10; i++) expect(lock.begin('kim')).toBe(false);
    expect(lock.begin('kim')).toBe(true);
    expect(lock.isLocked('kim')).toBe(true);
    expect(lock.begin('lee')).toBe(false);
    c.advance(LOCK - 1);
    expect(lock.begin('kim')).toBe(true);
    c.advance(1);
    expect(lock.begin('kim')).toBe(false);
    expect(lock.failures('kim')).toBe(1);
  });

  it('성공하면 카운터가 초기화된다', () => {
    const lock = createFailureLock({ maxFailures: 10, lockMs: LOCK }, clock().now);
    for (let i = 0; i < 9; i++) lock.begin('kim');
    lock.succeed('kim');
    expect(lock.failures('kim')).toBe(0);
    for (let i = 0; i < 10; i++) expect(lock.begin('kim')).toBe(false);
    expect(lock.begin('kim')).toBe(true);
  });

  it('마지막 실패 후 15분이 지나면 누적이 사라진다', () => {
    const c = clock();
    const lock = createFailureLock({ maxFailures: 10, lockMs: LOCK }, c.now);
    for (let i = 0; i < 9; i++) lock.begin('kim');
    c.advance(LOCK);
    expect(lock.failures('kim')).toBe(0);
    expect(lock.begin('kim')).toBe(false);
  });
});
