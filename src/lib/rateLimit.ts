// 인메모리 레이트리밋·연속 실패 잠금 헬퍼.
//
// 기존 라우트들(inspection/apply·tech/signup 등)의 `hits` Map 패턴을 일반화한 것이다.
// 단일 프로세스 메모리라 인스턴스가 여럿이면 인스턴스마다 따로 센다 — 기존 관례와 같은 한계.
// 기존 라우트는 손대지 않고 새 라우트(로그인)부터 이 헬퍼를 쓴다.

type Clock = () => number;

/** `x-forwarded-for` 의 첫 값, 없으면 'local' — 기존 라우트들과 같은 키 규칙. */
export function clientIp(req: { headers: Headers }): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export type RateWindow = { limit: number; windowMs: number };

/**
 * 고정 창 여러 개를 동시에 적용하는 제한기. 모든 창이 여유가 있어야 통과한다.
 *
 * `consume` 은 시도를 **먼저** 센다 — 동시에 쏟아지는 요청도 빠짐없이 잡기 위해서다.
 * `refund` 는 그 1회를 되돌린다(예: 로그인 성공은 무차별 대입이 아니므로 버킷을 태우지 않는다).
 */
export function createRateLimiter(windows: RateWindow[], now: Clock = Date.now, maxKeys = 10_000) {
  const buckets = windows.map(() => new Map<string, { count: number; resetAt: number }>());

  function prune(map: Map<string, { count: number; resetAt: number }>, t: number) {
    if (map.size <= maxKeys) return;
    for (const [k, v] of map) if (v.resetAt <= t) map.delete(k);
  }

  return {
    /** 한도를 넘었으면 true(차단). 차단된 시도는 세지 않는다 — 창이 끝나면 곧바로 풀린다. */
    consume(key: string): boolean {
      const t = now();
      const entries = buckets.map((map, i) => {
        prune(map, t);
        let e = map.get(key);
        if (!e || e.resetAt <= t) {
          e = { count: 0, resetAt: t + windows[i].windowMs };
          map.set(key, e);
        }
        return e;
      });
      if (entries.some((e, i) => e.count >= windows[i].limit)) return true;
      for (const e of entries) e.count++;
      return false;
    },
    refund(key: string): void {
      const t = now();
      for (const map of buckets) {
        const e = map.get(key);
        if (e && e.resetAt > t && e.count > 0) e.count--;
      }
    },
    reset(): void {
      for (const map of buckets) map.clear();
    },
  };
}

/**
 * 키(계정)별 연속 실패 잠금.
 *
 * - `begin(key)` 는 잠겨 있으면 true(차단). 아니면 시도를 **실패로 미리 적립**한다 —
 *   같은 계정으로 동시에 수십 건을 쏘면 결과가 나오기 전에 모두 통과하는 틈을 막기 위해서다.
 * - `succeed(key)` 는 카운터를 지운다(성공 시 초기화).
 * - 적립된 실패가 `maxFailures` 에 닿으면 그때부터 `lockMs` 동안 잠긴다.
 * - 실패 기록은 마지막 실패 후 `lockMs` 가 지나면 사라진다(띄엄띄엄 틀린 사용자는 누적되지 않음).
 */
export function createFailureLock(
  opts: { maxFailures: number; lockMs: number },
  now: Clock = Date.now,
  maxKeys = 10_000,
) {
  const state = new Map<string, { failures: number; expiresAt: number; lockedUntil: number }>();

  function current(key: string, t: number) {
    const s = state.get(key);
    if (!s) return undefined;
    if (s.lockedUntil > t) return s;
    if (s.lockedUntil !== 0 || s.expiresAt <= t) {
      // 잠금이 끝났거나 기록이 만료됐다 — 새로 시작한다.
      state.delete(key);
      return undefined;
    }
    return s;
  }

  return {
    isLocked(key: string): boolean {
      const t = now();
      return (current(key, t)?.lockedUntil ?? 0) > t;
    },
    begin(key: string): boolean {
      const t = now();
      if (state.size > maxKeys) {
        for (const [k, v] of state) if (v.lockedUntil <= t && v.expiresAt <= t) state.delete(k);
      }
      const s = current(key, t);
      if (s && s.lockedUntil > t) return true;
      const failures = (s?.failures ?? 0) + 1;
      state.set(key, {
        failures,
        expiresAt: t + opts.lockMs,
        lockedUntil: failures >= opts.maxFailures ? t + opts.lockMs : 0,
      });
      return false;
    },
    succeed(key: string): void {
      state.delete(key);
    },
    failures(key: string): number {
      return current(key, now())?.failures ?? 0;
    },
    reset(): void {
      state.clear();
    },
  };
}
