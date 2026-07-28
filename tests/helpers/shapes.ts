// ───────────────────────────────────────────────────────────────────────────
// 관리자 분석 엔드포인트 응답 shape — 단일 상수.
//
// 목적(계획 1h·Step 9): 기존 9개 스펙이 page.route() 로 만들어내는 가짜 응답과
// 실제 서버 응답이 소리 없이 갈라지는 것을 구조적으로 막는다.
//   · Layer 1(계약 테스트)은 **실응답**을 이 shape 로 단언하고,
//   · Layer 3(기존 목킹 스펙)은 **같은 상수**로 목 본문을 만든다.
// 두 쪽이 한 정의를 공유하므로 드리프트가 성립할 수 없다.
//
// 집계 절대값은 담지 않는다 — 실 DB 를 쓰므로 값은 변한다. 담는 것은 키 구조뿐.
// ───────────────────────────────────────────────────────────────────────────

/** 값이 있어야 하는 자리를 표시하는 최소 서술자. */
export type ShapeNode =
  | { kind: 'number' }
  | { kind: 'nullableNumber' }
  | { kind: 'string' }
  | { kind: 'nullableString' }
  | { kind: 'boolean' }
  | { kind: 'isoDate' }
  | { kind: 'record' } // Record<string, number> 처럼 키가 데이터에 따라 변하는 자리
  | { kind: 'array'; of: Shape }
  | { kind: 'object'; of: Record<string, ShapeNode> };

export type Shape = ShapeNode;

const num: ShapeNode = { kind: 'number' };
const numOrNull: ShapeNode = { kind: 'nullableNumber' };
const str: ShapeNode = { kind: 'string' };
const strOrNull: ShapeNode = { kind: 'nullableString' };
const bool: ShapeNode = { kind: 'boolean' };
const iso: ShapeNode = { kind: 'isoDate' };
const rec: ShapeNode = { kind: 'record' };
const obj = (of: Record<string, ShapeNode>): ShapeNode => ({ kind: 'object', of });
const arr = (of: ShapeNode): ShapeNode => ({ kind: 'array', of });

const percentile = obj({ mean: numOrNull, median: numOrNull, p90: numOrNull });

/** GET /api/admin/analytics/summary — src/lib/analyticsStats.ts:68-86 */
export const SUMMARY_SHAPE = obj({
  received: num,
  needsAttention: num,
  urgentOpen: num,
  updatedAt: iso,
});

/** GET /api/admin/analytics/dashboard?period=day|week|month — analyticsStats.ts:17-43 */
export const DASHBOARD_SHAPE = obj({
  operational: obj({ byStatus: rec, needsAttention: num, byUrgencyOpen: rec }),
  trend: arr(obj({ bucket: str, received: num, completed: num })),
  performance: obj({
    op: obj({
      firstOfferSec: percentile,
      offerAcceptRate: numOrNull,
      accepted: num,
      rejected: num,
    }),
    cust: obj({
      acceptSec: percentile,
      requestSuccessRate: numOrNull,
      requestsWithAccepted: num,
      totalRequests: num,
    }),
  }),
  money: obj({
    surveyPaid: obj({ sum: num, count: num, avg: numOrNull }),
    commission: obj({ PENDING: num, PAID: num }),
  }),
  updatedAt: iso,
});

/** GET /api/admin/analytics/surveys — src/lib/surveyAnalytics.ts:13-28 */
export const SURVEYS_SHAPE = obj({
  responseRate: numOrNull,
  submitted: num,
  total: num,
  pending: obj({
    items: arr(
      obj({
        surveyId: str,
        requestCode: str,
        customerName: str,
        customerPhone: str,
        elapsedDays: num,
      }),
    ),
    total: num,
    hasNext: bool,
  }),
  paidStats: obj({ sum: num, count: num, avg: numOrNull }),
  updatedAt: iso,
});

/** GET /api/admin/analytics/ratings — src/lib/ratingsAnalytics.ts:5-12 */
export const RATINGS_SHAPE = obj({
  ranking: arr(
    obj({
      subjectKey: str,
      name: str,
      type: str,
      avgRating: numOrNull,
      reviewCount: num,
      completed: num,
    }),
  ),
});

/** GET /api/admin/analytics/ratings/[subject] — ratingsAnalytics.ts:120-129 */
export const RATING_SUBJECT_SHAPE = obj({
  monthly: arr(obj({ bucket: str, avgRating: numOrNull, reviewCount: num })),
  reviews: obj({
    items: arr(obj({ rating: num, comment: strOrNull, submittedAt: iso })),
    total: num,
    hasNext: bool,
    nextCursor: strOrNull,
  }),
});

/** GET /api/admin/analytics/map/regions — src/lib/mapOverview.ts:41-60 */
export const MAP_REGIONS_SHAPE = obj({
  level: str,
  sido: strOrNull,
  regions: arr(
    obj({
      key: str,
      name: str,
      hasSigungu: bool,
      supply: num,
      demand: num,
      pressure: numOrNull,
      state: str,
    }),
  ),
  gapAlerts: arr(obj({ key: str, name: str, demand: num })),
  unknownLocation: obj({ count: num, reasons: rec }),
  sigunguUnknown: num,
  sourceLabel: str,
  asOf: iso,
});

/** GET /api/admin/analytics/map/dispatch — src/lib/mapOverview.ts:140-146 */
export const MAP_DISPATCH_SHAPE = obj({
  pins: arr(obj({ requestId: str, lookupCode: str, lat: num, lng: num, address: strOrNull })),
  unknownCount: num,
  asOf: iso,
});

export const ANALYTICS_SHAPES = {
  '/api/admin/analytics/summary': SUMMARY_SHAPE,
  '/api/admin/analytics/dashboard': DASHBOARD_SHAPE,
  '/api/admin/analytics/surveys': SURVEYS_SHAPE,
  '/api/admin/analytics/ratings': RATINGS_SHAPE,
  '/api/admin/analytics/ratings/[subject]': RATING_SUBJECT_SHAPE,
  '/api/admin/analytics/map/regions': MAP_REGIONS_SHAPE,
  '/api/admin/analytics/map/dispatch': MAP_DISPATCH_SHAPE,
} as const;

// ───────────────────────────────────────────────────────────────────────────
// 검증 — 실응답이 shape 를 만족하는지. 위반 경로를 사람이 읽을 문자열로 돌려준다.
// (Layer 1 에서 `expect(violations(...)).toEqual([])` 로 쓴다.)
// ───────────────────────────────────────────────────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function shapeViolations(value: unknown, shape: ShapeNode, path = '$'): string[] {
  const fail = (expected: string) => [`${path}: ${expected} 이어야 하는데 ${describe(value)}`];

  switch (shape.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? [] : fail('유한 number');
    case 'nullableNumber':
      return value === null || (typeof value === 'number' && Number.isFinite(value))
        ? []
        : fail('number|null');
    case 'string':
      return typeof value === 'string' ? [] : fail('string');
    case 'nullableString':
      return value === null || typeof value === 'string' ? [] : fail('string|null');
    case 'boolean':
      return typeof value === 'boolean' ? [] : fail('boolean');
    case 'isoDate':
      return typeof value === 'string' && ISO_RE.test(value) ? [] : fail('ISO 8601 문자열');
    case 'record':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? []
        : fail('객체(Record)');
    case 'array': {
      if (!Array.isArray(value)) return fail('배열');
      return value.flatMap((item, i) => shapeViolations(item, shape.of, `${path}[${i}]`));
    }
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('객체');
      const record = value as Record<string, unknown>;
      const out: string[] = [];
      for (const [key, child] of Object.entries(shape.of)) {
        if (!(key in record)) {
          out.push(`${path}.${key}: 키가 없습니다`);
          continue;
        }
        out.push(...shapeViolations(record[key], child, `${path}.${key}`));
      }
      return out;
    }
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `배열(${value.length})`;
  return `${typeof value}(${JSON.stringify(value)?.slice(0, 40) ?? ''})`;
}

// ───────────────────────────────────────────────────────────────────────────
// 목 본문 생성 — Step 9 가 page.route() 본문을 이 함수로 만든다.
// shape 를 만족하는 최소 유효 응답이므로, shape 가 바뀌면 목도 함께 바뀐다.
// ───────────────────────────────────────────────────────────────────────────

export function emptyFromShape(shape: ShapeNode): unknown {
  switch (shape.kind) {
    case 'number':
      return 0;
    case 'nullableNumber':
      return null;
    case 'string':
      return '';
    case 'nullableString':
      return null;
    case 'boolean':
      return false;
    case 'isoDate':
      return new Date(0).toISOString();
    case 'record':
      return {};
    case 'array':
      return [];
    case 'object':
      return Object.fromEntries(
        Object.entries(shape.of).map(([key, child]) => [key, emptyFromShape(child)]),
      );
  }
}

/** 빈 골격 위에 원하는 값만 덮어쓴 목 본문. */
export function mockFromShape<T extends Record<string, unknown>>(
  shape: ShapeNode,
  overrides: Partial<T> = {} as Partial<T>,
): T {
  return { ...(emptyFromShape(shape) as T), ...overrides };
}
