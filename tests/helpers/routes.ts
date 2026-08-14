// ───────────────────────────────────────────────────────────────────────────
// API 라우트 매트릭스 — 단일 진실 원천.
//
// 64개 route.ts 파일이 75개 핸들러를 export 한다 (11개 라우트가 2개 메서드).
// 그중 13개가 설계상 공개이고, 나머지 **62개가 가드 대상**이다.
//
// 이 표를 손으로 유지하지 않는다: tests/cross/matrix-completeness.spec.ts 가
// src/app/api/** 를 걸어 실제 export 와 대조하므로, 라우트가 추가·삭제되면
// 그 메타테스트가 즉시 빨개진다. "전수"는 약속이 아니라 실패 가능한 단언이다.
// ───────────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RouteEntry = {
  /** Next 파일 규약 그대로의 경로. `[id]` 등 동적 세그먼트를 유지한다. */
  path: string;
  method: HttpMethod;
  /** 설계상 무세션 접근이 허용되는가. true 면 401 단언에서 제외한다. */
  isPublic: boolean;
  /** 무세션 호출의 기대 상태코드. 공개 라우트는 null (핸들러마다 다름). */
  expectedUnauthedStatus: number | null;
  /** 401 을 내는 세션 역할 — 교차역할 단언에 쓴다. */
  role?: 'ADMIN' | 'PROVIDER' | 'TECHNICIAN';
  note?: string;
};

const admin = (path: string, method: HttpMethod): RouteEntry => ({
  path,
  method,
  isPublic: false,
  expectedUnauthedStatus: 401,
  role: 'ADMIN',
});
const tech = (path: string, method: HttpMethod): RouteEntry => ({
  path,
  method,
  isPublic: false,
  expectedUnauthedStatus: 401,
  role: 'TECHNICIAN',
});
const partner = (path: string, method: HttpMethod): RouteEntry => ({
  path,
  method,
  isPublic: false,
  expectedUnauthedStatus: 401,
  role: 'PROVIDER',
});
const open = (path: string, method: HttpMethod, note: string): RouteEntry => ({
  path,
  method,
  isPublic: true,
  expectedUnauthedStatus: null,
  note,
});

export const ROUTES: RouteEntry[] = [
  // ── 관리자 (38 핸들러, 전부 ADMIN 세션 필요) ──────────────────────────
  admin('/api/admin/analytics/dashboard', 'GET'),
  admin('/api/admin/analytics/map/dispatch', 'GET'),
  admin('/api/admin/analytics/map/regions', 'GET'),
  admin('/api/admin/analytics/ratings', 'GET'),
  admin('/api/admin/analytics/ratings/[subject]', 'GET'),
  admin('/api/admin/analytics/summary', 'GET'),
  admin('/api/admin/analytics/surveys', 'GET'),
  admin('/api/admin/commissions', 'GET'),
  admin('/api/admin/commissions/pay', 'POST'),
  admin('/api/admin/eggs', 'GET'),
  admin('/api/admin/eggs', 'POST'),
  admin('/api/admin/geocode', 'GET'),
  admin('/api/admin/providers', 'GET'),
  admin('/api/admin/providers', 'POST'),
  admin('/api/admin/providers/[id]', 'GET'),
  admin('/api/admin/providers/[id]', 'PATCH'),
  admin('/api/admin/providers/[id]/approve', 'POST'),
  admin('/api/admin/providers/[id]/cert', 'GET'),
  admin('/api/admin/providers/[id]/reject', 'POST'),
  admin('/api/admin/requests', 'GET'),
  admin('/api/admin/requests/[id]', 'GET'),
  admin('/api/admin/requests/[id]/assign', 'POST'),
  admin('/api/admin/requests/[id]/cancel', 'POST'),
  admin('/api/admin/requests/[id]/candidates', 'GET'),
  admin('/api/admin/requests/[id]/unassign', 'POST'),
  admin('/api/admin/requests/[id]/voice', 'GET'),
  admin('/api/admin/rotation', 'GET'),
  admin('/api/admin/settings', 'GET'),
  admin('/api/admin/settings', 'PUT'),
  admin('/api/admin/settlements', 'GET'),
  admin('/api/admin/technicians', 'GET'),
  admin('/api/admin/technicians', 'POST'),
  admin('/api/admin/technicians/[id]', 'GET'),
  admin('/api/admin/technicians/[id]', 'PATCH'),
  admin('/api/admin/technicians/[id]/approve', 'POST'),
  admin('/api/admin/technicians/[id]/contract', 'GET'),
  admin('/api/admin/technicians/[id]/contract', 'PUT'),
  admin('/api/admin/technicians/[id]/reject', 'POST'),

  // ── 전기기사 (12 핸들러, TECHNICIAN 세션 필요) ─────────────────────────
  tech('/api/tech/commissions', 'GET'),
  tech('/api/tech/contract', 'GET'),
  tech('/api/tech/contract', 'PUT'),
  tech('/api/tech/eggs', 'GET'),
  tech('/api/tech/jobs', 'GET'),
  tech('/api/tech/jobs/[id]', 'GET'),
  tech('/api/tech/jobs/[id]/accept', 'POST'),
  tech('/api/tech/jobs/[id]/reject', 'POST'),
  tech('/api/tech/jobs/[id]/status', 'POST'),
  tech('/api/tech/referrals', 'GET'),
  tech('/api/tech/reviews', 'GET'),
  tech('/api/tech/stats', 'GET'),

  // ── 업체 (12 핸들러, PROVIDER 세션 필요) ─────────────────────────────
  partner('/api/partner/commissions', 'GET'),
  partner('/api/partner/eggs', 'GET'),
  partner('/api/partner/jobs', 'GET'),
  partner('/api/partner/jobs/[id]', 'GET'),
  partner('/api/partner/jobs/[id]/accept', 'POST'),
  partner('/api/partner/jobs/[id]/reject', 'POST'),
  partner('/api/partner/jobs/[id]/status', 'POST'),
  partner('/api/partner/profile', 'GET'),
  partner('/api/partner/profile', 'PATCH'),
  partner('/api/partner/referrals', 'GET'),
  partner('/api/partner/reviews', 'GET'),
  partner('/api/partner/stats', 'GET'),

  // ── 공개 13 핸들러 — 401 단언에서 제외한다 ───────────────────────────
  open('/api/auth/login', 'POST', '로그인 자체 — 세션을 만드는 입구'),
  open('/api/auth/logout', 'POST', '로그아웃 — 세션 없이 호출해도 무해'),
  open('/api/geo/reverse', 'GET', '역지오코딩 — 접수 화면(무세션)에서 호출'),
  open('/api/identity/verify', 'POST', '휴대폰 본인인증 — 가입 전 단계'),
  open('/api/internal/auto-assign', 'GET', 'cron 백업. Authorization: Bearer 로 인증(route.ts:9-11)'),
  open('/api/internal/auto-assign', 'POST', 'cron 백업. x-cron-secret 으로 인증(route.ts:9-11)'),
  open('/api/partner/signup', 'POST', '업체 셀프 가입 — 승인 전 PENDING(signup:184)'),
  open('/api/referrer/lookup', 'POST', '추천인 조회 — 가입 폼에서 호출'),
  open('/api/requests', 'POST', '고객 접수 — 서비스의 공개 진입점'),
  open('/api/requests/lookup', 'POST', '고객 조회 — lookupCode + 전화번호'),
  open('/api/survey/[token]', 'GET', '만족도 조사 — 토큰이 곧 인증'),
  open('/api/survey/[token]', 'POST', '만족도 조사 제출 — 토큰이 곧 인증'),
  open('/api/tech/signup', 'POST', '전기기사 셀프 가입 — 즉시 APPROVED(signup:176)'),
];

/** 무세션 401 을 단언해야 하는 핸들러 (75 − 공개 13 = 62). */
export const GUARDED_ROUTES = ROUTES.filter((r) => !r.isPublic);

/** 설계상 공개인 핸들러 — 401 오탐 방지용으로 명시 보관한다. */
export const PUBLIC_ROUTES = ROUTES.filter((r) => r.isPublic);

export function routeKey(path: string, method: string): string {
  return `${method} ${path}`;
}

/** 동적 세그먼트를 실제 값으로 치환한다. `[subject]` 같은 이름도 키로 받는다. */
export function fillPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\[(\.{3})?(\w+)\]/g, (_match, _spread, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`경로 파라미터 [${name}] 값이 없습니다: ${path}`);
    }
    return encodeURIComponent(value);
  });
}
