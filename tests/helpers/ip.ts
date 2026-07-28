import { randomBytes } from 'node:crypto';

// ───────────────────────────────────────────────────────────────────────────
// 레이트리밋 버킷 분리.
//
// 6개 라우트가 클라이언트가 준 x-forwarded-for 를 프록시 allowlist 없이 그대로
// 키로 쓰고, 카운터는 인메모리 Map 이다:
//   tech/signup:34-48        IP당 10분/5회
//   identity/verify:15-27    IP당 10분/10회
//   survey/[token]:6-21      IP당 60초/10회
//   partner/signup · requests/lookup · referrer/lookup  (동형)
//
// 그 Map 은 장수하는 dev 서버의 모듈 상태다. 시드만으로 고정 IP 를 만들면
// 1회차가 태운 버킷이 2회차에 그대로 살아 있어 "연속 2회 그린"이 결정적으로
// 깨진다. 따라서 실행마다 바뀌는 nonce 를 IP 에 섞는다.
//
// ⚠️ 이 우회가 성립한다는 사실 자체가 제품 결함이다(계획 §보고 의무).
//    프록시 allowlist 를 도입하면 여기가 먼저 깨진다 — 그때 원인은 이 파일이다.
// ───────────────────────────────────────────────────────────────────────────

const NONCE_ENV = 'E2E_RUN_NONCE';

/**
 * 실행 단위 nonce. globalSetup 이 process.env 에 심고, 워커는 fork 시점의
 * process.env 를 상속한다(playwright/lib/runner/index.js:1853-1861).
 * globalSetup 을 거치지 않은 경우에도 죽지 않도록 지연 생성 폴백을 둔다.
 */
export function runNonce(): string {
  let nonce = process.env[NONCE_ENV];
  if (!nonce) {
    nonce = randomBytes(2).toString('hex');
    process.env[NONCE_ENV] = nonce;
  }
  return nonce;
}

/** globalSetup 전용 — 실행 nonce 를 확정하고 리포트에 남긴다. */
export function initRunNonce(): string {
  const nonce = randomBytes(2).toString('hex');
  process.env[NONCE_ENV] = nonce;
  return nonce;
}

function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * seed 마다 다르고 실행마다 다른 x-forwarded-for 값.
 *
 * 10.0.0.0/8 사설 대역을 쓴다 — 실 IP 와 섞이지 않아 SmsLog·서버 로그에서
 * 하네스 트래픽을 눈으로 구분할 수 있다.
 * 실패 재현이 필요하면 리포트에 찍힌 nonce 를 `E2E_RUN_NONCE` 로 주면 된다.
 */
export function uniqueIp(seed: string): string {
  const h = hash32(`${runNonce()}:${seed}`);
  const b = (h >>> 16) & 0xff;
  const c = (h >>> 8) & 0xff;
  const d = h & 0xff;
  // 0 과 255 는 네트워크/브로드캐스트 주소라 피한다 (파싱 이슈 예방).
  return `10.${b}.${c}.${Math.min(254, Math.max(1, d))}`;
}

/** 같은 seed 로 여러 요청을 태울 때 매번 새 버킷이 필요하면 이 쪽을 쓴다. */
export function freshIp(seed: string): string {
  return uniqueIp(`${seed}:${randomBytes(4).toString('hex')}`);
}

/** 헤더 객체 형태 — `extraHTTPHeaders` / `headers` 에 그대로 스프레드. */
export function ipHeaders(seed: string): { 'x-forwarded-for': string } {
  return { 'x-forwarded-for': uniqueIp(seed) };
}
