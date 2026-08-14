// ───────────────────────────────────────────────────────────────────────────
// 분기 그림자 지도 — 각 핸들러의 4xx 게이트 **순서**와 도달 조건.
//
// 왜 필요한가: 라우트는 검사를 순서대로 통과시킨다. 앞선 게이트가 걸리면
// 뒤 게이트는 **실행조차 되지 않는다**. 그래서 "잘못된 입력 → 4xx" 형태의
// 테스트는 자기가 의도한 분기가 아니라 **더 앞선 분기**를 때리고도 초록으로
// 통과한다. 이것이 false-green 이다.
//
// 실측 사례 (worker-cross, Step 3):
//   POST /api/tech/jobs/[id]/status 는 zod(:27-30)가 소유권(:36-38)보다 먼저다.
//   남의 배정에 `{}` 를 보내면 400 이 나오고, "404 를 기대" 하지 않는 한
//   테스트는 소유권 검사를 **한 번도 실행하지 않은 채** 통과한다.
//
// 이 표의 용도 2가지:
//  1) 분기를 **의도대로 때리기** — `reach` 가 그 분기에 도달하기 위한 최소 조건.
//  2) 상태코드가 같은 분기를 **구별하기** — `message` 로 단언하면
//     "400 이 나왔다" 가 아니라 "의도한 그 400 이 나왔다" 를 단언하게 된다.
//     예: POST /api/admin/providers 는 400 이 5개다. 상태코드만 보면 무의미하다.
//
// 근거: src/app/api/**/route.ts 전수 정독 (2026-07-28). line 은 그 파일 기준.
// 401 세션 가드는 tests/cross/auth-matrix.spec.ts 가 58핸들러 전수 커버하므로
// 여기서는 **비401 분기만** 다룬다.
// ───────────────────────────────────────────────────────────────────────────

export type GateKind =
  /** IP 레이트리밋. 항상 맨 앞이라 다른 모든 분기를 가린다. */
  | 'rate-limit'
  /** 본문 파싱 실패 (req.json() / req.formData() throw). */
  | 'body-parse'
  /** zod safeParse 실패. */
  | 'schema'
  /** 대상 행이 없음. */
  | 'not-found'
  /** 값·상태 검증 (형식·소유권·전이 가능 여부). */
  | 'state'
  /** 중복·CAS 충돌. */
  | 'conflict'
  /** 진짜 동시성이 있어야만 도달 — 순차 클라이언트로는 재현 불가. */
  | 'race'
  /** 외부 의존(카카오 지오코딩 등)이 실패해야 도달. 결정적이지 않다. */
  | 'external';

export type Gate = {
  /** 핸들러 안에서의 검사 순서 (1부터). 이보다 앞선 게이트가 전부 통과해야 도달한다. */
  order: number;
  status: number;
  /** route.ts 기준 행 번호. */
  line: number;
  kind: GateKind;
  /**
   * 응답 `error` 문자열. zod 에 위임하는 분기는 입력에 따라 달라지므로 null.
   * 같은 상태코드가 여럿인 핸들러에서는 이 값으로 단언해야 분기가 특정된다.
   */
  message: string | null;
  /** 이 분기에 **도달하기 위해** 갖춰야 하는 조건. */
  reach: string;
  /** 이 분기를 노리다 잘못 맞기 쉬운 앞선 게이트. 없으면 생략. */
  trap?: string;
};

export type HandlerGates = {
  file: string;
  /** 비401 4xx 분기. order 오름차순. */
  gates: Gate[];
  /** 핸들러 전체에 걸리는 주의사항. */
  note?: string;
};

/** 키는 tests/helpers/routes.ts 의 `routeKey()` 와 같은 `${METHOD} ${path}` 형식. */
export const GATES: Record<string, HandlerGates> = {
  // ═══ 관리자 — 변경 핸들러 ═══════════════════════════════════════════════

  'POST /api/admin/requests/[id]/assign': {
    file: 'src/app/api/admin/requests/[id]/assign/route.ts',
    note:
      '409 CAS 는 앞의 게이트 5개를 **전부** 통과해야 도달한다. 특히 전기기사 대상이면 ' +
      '계약 CONFIRMED 가 필수다 — createTechFixture() 기본값은 계약 행이 아예 없어 ' +
      'contract?.status !== "CONFIRMED" 가 참이 되고 :59 의 400 으로 떨어진다.',
    gates: [
      {
        order: 1,
        status: 400,
        line: 25,
        kind: 'body-parse',
        message: '잘못된 요청입니다',
        reach: 'JSON 이 아닌 본문',
      },
      {
        order: 2,
        status: 400,
        line: 29,
        kind: 'schema',
        message: '배정 대상을 선택해 주세요',
        reach: 'assigneeKind/assigneeId 누락 또는 형식 위반',
      },
      {
        order: 3,
        status: 404,
        line: 35,
        kind: 'not-found',
        message: '접수를 찾을 수 없습니다',
        reach: '존재하지 않는 requestId + **유효한** 본문',
        trap: '본문이 부실하면 :29 의 400 이 먼저 나온다',
      },
      {
        order: 4,
        status: 400,
        line: 46,
        kind: 'state',
        message: '배정할 수 없는 대상입니다 (미등록·비활성·미승인)',
        reach: '대상이 없거나 isActive=false 이거나 approvalStatus!=APPROVED',
      },
      {
        order: 5,
        status: 400,
        line: 59,
        kind: 'state',
        message: '근로확인서 서명이 완료되지 않은 전기기사입니다',
        reach: 'assigneeKind=TECHNICIAN 이고 계약이 CONFIRMED 가 아님(행 없음 포함)',
        trap: 'PROVIDER 대상은 이 게이트를 통째로 건너뛴다',
      },
      {
        order: 6,
        status: 409,
        line: 81,
        kind: 'conflict',
        message: '배정 대기 상태가 아닙니다. 이미 배정되었거나 취소되었을 수 있습니다.',
        reach:
          'claimAndAssign 의 CAS 실패 — 접수가 RECEIVED 가 아님. ' +
          '대상은 활성·승인 상태여야 하고, 전기기사면 계약 CONFIRMED 여야 여기까지 온다',
        trap: '계약 미확정 전기기사로 시도하면 409 가 아니라 :59 의 400 이 나온다',
      },
    ],
  },

  'POST /api/admin/requests/[id]/unassign': {
    file: 'src/app/api/admin/requests/[id]/unassign/route.ts',
    note:
      '404 가 없다 — 존재하지 않는 requestId 도 :26 의 **409** 로 떨어진다(findFirst 가 null). ' +
      '두 409 는 상태코드가 같아 message 로만 구별된다.',
    gates: [
      {
        order: 1,
        status: 409,
        line: 26,
        kind: 'conflict',
        message: '회수할 응답 대기 배정이 없습니다 (담당자가 이미 응답했을 수 있습니다)',
        reach: 'status=REQUESTED 인 Assignment 가 없음 (없는 접수 id 포함)',
      },
      {
        order: 2,
        status: 409,
        line: 37,
        kind: 'race',
        message: '담당자가 방금 응답하여 회수할 수 없습니다',
        reach:
          'findFirst(:18-22) 시점엔 REQUESTED 였는데 updateMany(:30-33) 시점엔 아님. ' +
          '**순차 호출로는 도달 불가** — 두 클라이언트 동시 실행이 필요하다',
        trap: 'unassign 을 두 번 부르면 두 번째는 :26 에 걸린다. :37 이 아니다',
      },
    ],
  },

  'POST /api/admin/requests/[id]/cancel': {
    file: 'src/app/api/admin/requests/[id]/cancel/route.ts',
    note:
      '존재하지 않는 접수도 404 가 아니라 409 다(updateMany count=0). ' +
      '또한 createRequestFixture() 기본값이 CANCELED 라 **기본 픽스처는 취소가 409 다** — ' +
      '200 을 보려면 RECEIVED/ASSIGNED/ACCEPTED/DISPATCHED 로 만들어야 한다.',
    gates: [
      {
        order: 1,
        status: 409,
        line: 18,
        kind: 'conflict',
        message: '취소할 수 없는 상태입니다',
        reach: '접수가 RECEIVED·ASSIGNED·ACCEPTED·DISPATCHED 중 어느 것도 아님 (없는 id 포함)',
      },
    ],
  },

  'POST /api/admin/providers': {
    file: 'src/app/api/admin/providers/route.ts',
    note:
      '**400 이 5개다. 상태코드만으로는 어느 분기인지 알 수 없다 — message 로 단언할 것.** ' +
      ':96 은 카카오 지오코딩 실패에 걸리는 외부 의존 분기라, lat/lng 를 명시하지 않으면 ' +
      '키 만료·네트워크 장애가 happy path 200 테스트를 400 으로 뒤집는다.',
    gates: [
      {
        order: 1,
        status: 400,
        line: 64,
        kind: 'body-parse',
        message: '잘못된 요청입니다',
        reach: 'JSON 이 아닌 본문',
      },
      {
        order: 2,
        status: 400,
        line: 70,
        kind: 'schema',
        message: null,
        reach: 'zod 위반. message 는 첫 issue 문구',
      },
      {
        order: 3,
        status: 400,
        line: 81,
        kind: 'state',
        message: '사업자등록번호가 올바르지 않습니다',
        reach: 'bizRegNo 가 빈 문자열이 아니면서 검증번호 불일치',
        trap: 'bizRegNo 를 비우거나 생략하면 이 게이트를 건너뛴다 (조건부)',
      },
      {
        order: 4,
        status: 400,
        line: 96,
        kind: 'external',
        message: '주소를 좌표로 변환하지 못했습니다. 위도/경도를 직접 입력해 주세요.',
        reach: 'lat 또는 lng 가 null/생략 **이고** 카카오 지오코딩이 실패',
        trap:
          '반대로 200 을 기대하는 테스트는 lat/lng 를 **반드시 명시**해야 한다. ' +
          '지오코딩은 실호출이라 결정적이지 않다',
      },
      {
        order: 5,
        status: 400,
        line: 124,
        kind: 'state',
        message: '추천인을 찾을 수 없습니다',
        reach: 'referrerUserId 지정 + 그 유저가 없거나 미승인이거나 비활성',
      },
      {
        order: 6,
        status: 400,
        line: 129,
        kind: 'state',
        message: '본인을 추천인으로 지정할 수 없습니다',
        reach: '추천인이 승인·활성이고 `referrer.phone === data.phone` (**전화번호** 비교)',
      },
      {
        order: 7,
        status: 409,
        line: 163,
        kind: 'conflict',
        message: '이미 사용 중인 아이디 또는 사업자등록번호입니다',
        reach: 'P2002 — loginId 또는 bizRegNo 중복. 앞의 6게이트를 전부 통과해야 도달',
        trap: 'lat/lng 를 생략하면 지오코딩(:96)에서 먼저 막혀 409 를 못 본다',
      },
    ],
  },

  'POST /api/admin/technicians': {
    file: 'src/app/api/admin/technicians/route.ts',
    note: 'providers POST 와 같은 구조에서 사업자등록번호 게이트만 빠졌다. 400 이 4개.',
    gates: [
      { order: 1, status: 400, line: 66, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 2, status: 400, line: 72, kind: 'schema', message: null, reach: 'zod 위반' },
      {
        order: 3,
        status: 400,
        line: 87,
        kind: 'external',
        message: '주소를 좌표로 변환하지 못했습니다. 위도/경도를 직접 입력해 주세요.',
        reach: 'lat/lng 생략 + 카카오 지오코딩 실패',
        trap: '200 기대 테스트는 lat/lng 를 명시할 것',
      },
      {
        order: 4,
        status: 400,
        line: 115,
        kind: 'state',
        message: '추천인을 찾을 수 없습니다',
        reach: 'referrerUserId 지정 + 미존재/미승인/비활성',
      },
      {
        order: 5,
        status: 400,
        line: 120,
        kind: 'state',
        message: '본인을 추천인으로 지정할 수 없습니다',
        reach: '`referrer.phone === data.phone` (**전화번호** 비교)',
      },
      {
        order: 6,
        status: 409,
        line: 154,
        kind: 'conflict',
        message: '이미 사용 중인 아이디입니다',
        reach: 'P2002 loginId 중복. 지오코딩까지 통과해야 도달',
      },
    ],
  },

  'PATCH /api/admin/technicians/[id]': {
    file: 'src/app/api/admin/technicians/[id]/route.ts',
    note:
      'POST 와 달리 자기추천 판정이 **userId 비교**(`referrer.id === technician.userId`)다. ' +
      'POST 는 전화번호 비교였다 — 같은 문구의 400 이지만 트리거 조건이 다르다.',
    gates: [
      { order: 1, status: 400, line: 108, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 2, status: 400, line: 114, kind: 'schema', message: null, reach: 'zod 위반' },
      {
        order: 3,
        status: 404,
        line: 121,
        kind: 'not-found',
        message: '전기기사를 찾을 수 없습니다',
        reach: '없는 전기기사 id + **유효한** 본문',
        trap: '본문이 부실하면 :114 의 400 이 먼저다',
      },
      {
        order: 4,
        status: 400,
        line: 155,
        kind: 'state',
        message: '추천인을 찾을 수 없습니다',
        reach: 'referredByUserId 가 null 이 아닌 값 + 미존재/미승인/비활성',
      },
      {
        order: 5,
        status: 400,
        line: 160,
        kind: 'state',
        message: '본인을 추천인으로 지정할 수 없습니다',
        reach: '`referrer.id === technician.userId` (**userId** 비교)',
      },
    ],
  },

  'PATCH /api/admin/providers/[id]': {
    file: 'src/app/api/admin/providers/[id]/route.ts',
    note: 'technicians PATCH 와 동형. 자기추천은 `referrer.id === provider.userId` (userId 비교).',
    gates: [
      { order: 1, status: 400, line: 107, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 2, status: 400, line: 113, kind: 'schema', message: null, reach: 'zod 위반' },
      {
        order: 3,
        status: 404,
        line: 120,
        kind: 'not-found',
        message: '업체를 찾을 수 없습니다',
        reach: '없는 업체 id + 유효한 본문',
        trap: '본문이 부실하면 :112 의 400 이 먼저다',
      },
      {
        order: 4,
        status: 400,
        line: 153,
        kind: 'state',
        message: '추천인을 찾을 수 없습니다',
        reach: 'referredByUserId 지정 + 미존재/미승인/비활성',
      },
      {
        order: 5,
        status: 400,
        line: 158,
        kind: 'state',
        message: '본인을 추천인으로 지정할 수 없습니다',
        reach: '`referrer.id === provider.userId`',
      },
    ],
  },

  'PUT /api/admin/technicians/[id]/contract': {
    file: 'src/app/api/admin/technicians/[id]/contract/route.ts',
    note:
      ':89 의 404 는 **전기기사**가 아니라 **근로확인서 행**이 없을 때다. 없는 전기기사 id 와 ' +
      '근로확인서 미작성 전기기사가 같은 응답을 내므로 둘은 구별되지 않는다.',
    gates: [
      { order: 1, status: 400, line: 72, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 2, status: 400, line: 78, kind: 'schema', message: null, reach: 'adminWageSchema 위반' },
      {
        order: 3,
        status: 404,
        line: 89,
        kind: 'not-found',
        message: '전기기사가 아직 근로확인서를 작성하지 않았습니다',
        reach: 'EmploymentContract 행 없음 — createTechFixture() 를 contractStatus 없이 만들면 이 상태',
      },
      {
        order: 4,
        status: 409,
        line: 97,
        kind: 'conflict',
        message: '전기기사가 서명 완료한 근로확인서는 수정할 수 없습니다',
        reach: "createTechFixture({ contractStatus: 'CONFIRMED' })",
      },
    ],
  },

  'PUT /api/admin/settings': {
    file: 'src/app/api/admin/settings/route.ts',
    note:
      'settingsSchema 는 대부분 필수 필드다 — 빈 객체 `{}` 는 :58 의 400 으로 안전하게 떨어진다. ' +
      '반대로 200 을 내는 본문은 AppSettings(id=1) 를 **실제로 덮어쓴다**. ' +
      'autoAssignEnabled 도 이 스키마에 포함돼 있어 pretest-guard 의 차단을 되돌릴 수 있으니, ' +
      '이 핸들러의 happy path 는 반드시 원래 값을 읽어 복원하는 try/finally 안에서 태울 것.',
    gates: [
      { order: 1, status: 400, line: 52, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      {
        order: 2,
        status: 400,
        line: 58,
        kind: 'schema',
        message: '설정값을 확인해 주세요 (대기시간은 1~1440분)',
        reach: '필수 필드 누락 또는 대기시간 범위 위반. `{}` 로 도달',
      },
    ],
  },

  'POST /api/admin/eggs': {
    file: 'src/app/api/admin/eggs/route.ts',
    note:
      '알 크레딧 충전(charge)·정정(adjust). charge 는 chargeKey @unique 멱등 — 중복 제출은 ' +
      '4xx 가 아니라 200 { result: "ALREADY_CHARGED" } 로 흡수된다(더블서브밋 방어).',
    gates: [
      { order: 1, status: 400, line: 44, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      {
        order: 2,
        status: 400,
        line: 48,
        kind: 'schema',
        message: null,
        reach: 'zod 위반(kind·id·action·memo, charge 시 count≥3+chargeKey, adjust 시 delta≠0). message 는 첫 issue 문구',
      },
      { order: 3, status: 404, line: 54, kind: 'state', message: '대상을 찾을 수 없습니다', reach: 'kind+id 로 업체/전기기사 조회 실패' },
      {
        order: 4,
        status: 409,
        line: 75,
        kind: 'conflict',
        message: '정정 결과 잔액이 음수가 될 수 없습니다',
        reach: 'adjust 감액분이 현재 잔액 초과 (eggs.ts 가 DB 조건으로 차단 후 throw)',
      },
    ],
  },

  'GET /api/admin/eggs': {
    file: 'src/app/api/admin/eggs/route.ts',
    gates: [
      { order: 1, status: 400, line: 99, kind: 'schema', message: null, reach: 'kind/id 쿼리 zod 위반. message 는 첫 issue 문구' },
      { order: 2, status: 404, line: 105, kind: 'state', message: '대상을 찾을 수 없습니다', reach: 'kind+id 조회 실패' },
    ],
  },

  'POST /api/admin/commissions/pay': {
    file: 'src/app/api/admin/commissions/pay/route.ts',
    gates: [
      { order: 1, status: 400, line: 22, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      {
        order: 2,
        status: 400,
        line: 26,
        kind: 'schema',
        message: '요청 형식이 올바르지 않습니다',
        reach: 'paySchema 위반. `{}` 로 도달',
      },
    ],
  },

  'POST /api/admin/technicians/[id]/approve': {
    file: 'src/app/api/admin/technicians/[id]/approve/route.ts',
    gates: [
      { order: 1, status: 404, line: 15, kind: 'not-found', message: '전기기사를 찾을 수 없습니다', reach: '없는 id' },
      {
        order: 2,
        status: 409,
        line: 18,
        kind: 'conflict',
        message: '이미 승인된 전기기사입니다',
        reach: 'approvalStatus 가 이미 APPROVED — createTechFixture() **기본값이 APPROVED** 라 기본 픽스처가 곧 이 케이스',
        trap: "200 을 보려면 createTechFixture({ approvalStatus: 'PENDING' })",
      },
    ],
  },

  'POST /api/admin/providers/[id]/approve': {
    file: 'src/app/api/admin/providers/[id]/approve/route.ts',
    gates: [
      { order: 1, status: 404, line: 15, kind: 'not-found', message: '업체를 찾을 수 없습니다', reach: '없는 id' },
      {
        order: 2,
        status: 409,
        line: 18,
        kind: 'conflict',
        message: '이미 승인된 업체입니다',
        reach: 'createPartnerFixture() **기본값이 APPROVED** 라 기본 픽스처가 곧 이 케이스',
        trap: "200 을 보려면 createPartnerFixture({ approvalStatus: 'PENDING' })",
      },
    ],
  },

  'POST /api/admin/technicians/[id]/reject': {
    file: 'src/app/api/admin/technicians/[id]/reject/route.ts',
    note: '본문 파싱은 try 안에서 조용히 삼켜진다(:18) — 본문 없이 호출해도 400 이 아니다.',
    gates: [
      { order: 1, status: 404, line: 26, kind: 'not-found', message: '전기기사를 찾을 수 없습니다', reach: '없는 id' },
      { order: 2, status: 409, line: 31, kind: 'conflict', message: null, reach: '이미 반려된 상태' },
    ],
  },

  'POST /api/admin/providers/[id]/reject': {
    file: 'src/app/api/admin/providers/[id]/reject/route.ts',
    note: '본문 파싱은 try 안에서 조용히 삼켜진다(:18).',
    gates: [
      { order: 1, status: 404, line: 26, kind: 'not-found', message: '업체를 찾을 수 없습니다', reach: '없는 id' },
      { order: 2, status: 409, line: 31, kind: 'conflict', message: null, reach: '이미 반려된 상태' },
    ],
  },

  // ═══ 관리자 — 조회 핸들러 ═══════════════════════════════════════════════

  'GET /api/admin/analytics/ratings/[subject]': {
    file: 'src/app/api/admin/analytics/ratings/[subject]/route.ts',
    note:
      'subject 는 `PROVIDER:<id>` / `TECHNICIAN:<id>` 형식이다. ' +
      "`technician` 같은 맨 문자열은 :11 의 400 이지 404 가 아니다.",
    gates: [
      {
        order: 1,
        status: 400,
        line: 11,
        kind: 'schema',
        message: 'subject는 PROVIDER:<id> 또는 TECHNICIAN:<id> 형식이어야 합니다',
        reach: '형식 위반 문자열',
      },
      {
        order: 2,
        status: 404,
        line: 16,
        kind: 'not-found',
        message: '대상을 찾을 수 없습니다',
        reach: '형식은 맞고 id 가 없음 — 예: `TECHNICIAN:e2e-missing`',
        trap: '접두사를 빼면 :11 의 400 이 먼저다',
      },
    ],
  },

  'GET /api/admin/rotation': {
    file: 'src/app/api/admin/rotation/route.ts',
    gates: [
      { order: 1, status: 400, line: 19, kind: 'state', message: '시/도를 선택해 주세요', reach: 'sido 파라미터 없음/빈값' },
      {
        order: 2,
        status: 400,
        line: 24,
        kind: 'state',
        message: '올바르지 않은 지역입니다',
        reach: 'sido 는 있으나 regionKey 가 유효하지 않음 — 예: `?sido=없는시도`',
      },
    ],
  },

  'GET /api/admin/analytics/dashboard': {
    file: 'src/app/api/admin/analytics/dashboard/route.ts',
    gates: [
      {
        order: 1,
        status: 400,
        line: 15,
        kind: 'schema',
        message: 'period는 day, week, month 중 하나여야 합니다',
        reach: '`?period=<day|week|month 아님>`. 생략하면 day 기본값이라 200',
      },
    ],
  },

  'GET /api/admin/analytics/map/regions': {
    file: 'src/app/api/admin/analytics/map/regions/route.ts',
    gates: [
      {
        order: 1,
        status: 400,
        line: 17,
        kind: 'schema',
        message: '유효하지 않은 시도입니다',
        reach: '`?sido=<REGIONS 키 아님>`. 생략하면 200',
      },
    ],
  },

  'GET /api/admin/geocode': {
    file: 'src/app/api/admin/geocode/route.ts',
    gates: [
      { order: 1, status: 400, line: 13, kind: 'state', message: '주소를 입력해 주세요', reach: 'query 파라미터 없음/공백' },
    ],
  },

  'GET /api/admin/providers/[id]/cert': {
    file: 'src/app/api/admin/providers/[id]/cert/route.ts',
    note:
      ':52·:64 는 **레거시 bizCertPath 경로 전용**이다 — bizCertFileId 가 null 이면서 ' +
      'bizCertPath 가 있어야 도달한다. createPartnerFixture() 는 둘 다 만들지 않으므로 ' +
      '픽스처만으로는 도달 불가하고 DB 직접 조작이 필요하다.',
    gates: [
      {
        order: 1,
        status: 404,
        line: 31,
        kind: 'not-found',
        message: '첨부된 증빙이 없습니다',
        reach: '업체가 없거나 증빙이 아예 없음 — **두 경우가 구별되지 않는다**',
      },
      {
        order: 2,
        status: 404,
        line: 39,
        kind: 'not-found',
        message: '파일을 찾을 수 없습니다',
        reach: 'bizCertFileId 는 있는데 StoredFile 행이 없음 (댕글링)',
      },
      { order: 3, status: 400, line: 52, kind: 'state', message: '잘못된 경로입니다', reach: '레거시 bizCertPath 가 경로 검증 실패' },
      { order: 4, status: 404, line: 64, kind: 'state', message: '파일을 읽을 수 없습니다', reach: '레거시 경로의 fs 읽기 실패' },
    ],
  },

  'GET /api/admin/providers/[id]/elec-cert': {
    file: 'src/app/api/admin/providers/[id]/elec-cert/route.ts',
    note: 'cert 와 동형이지만 **레거시 파일시스템 폴백이 없다** — DB(StoredFile)만 본다.',
    gates: [
      {
        order: 1,
        status: 404,
        line: 20,
        kind: 'not-found',
        message: '첨부된 증빙이 없습니다',
        reach: '업체가 없거나 elecCertFileId 없음 — **두 경우가 구별되지 않는다**',
      },
      {
        order: 2,
        status: 404,
        line: 27,
        kind: 'not-found',
        message: '파일을 찾을 수 없습니다',
        reach: 'elecCertFileId 는 있는데 StoredFile 행이 없음 (댕글링)',
      },
    ],
  },

  'GET /api/admin/requests/[id]/voice': {
    file: 'src/app/api/admin/requests/[id]/voice/route.ts',
    note:
      '**416 분기가 있다**(:63) — 계획의 어느 표에도 없다. Range 헤더 처리 경로다. ' +
      ':41·:46 은 레거시 voicePath 전용이라 픽스처로는 도달 불가.',
    gates: [
      {
        order: 1,
        status: 404,
        line: 23,
        kind: 'not-found',
        message: '음성 녹음이 없습니다',
        reach: '접수가 없거나 음성이 없음 — 두 경우가 구별되지 않는다',
      },
      { order: 2, status: 404, line: 33, kind: 'not-found', message: '파일을 찾을 수 없습니다', reach: 'voiceFileId 댕글링' },
      { order: 3, status: 400, line: 41, kind: 'state', message: '잘못된 경로입니다', reach: '레거시 voicePath 경로 검증 실패' },
      { order: 4, status: 404, line: 46, kind: 'state', message: '파일을 읽을 수 없습니다', reach: '레거시 경로 fs 읽기 실패' },
      {
        order: 5,
        status: 416,
        line: 63,
        kind: 'state',
        message: null,
        reach: '음성이 실재하는 접수에 `Range: bytes=<파일크기 이상>-` 을 보냄. 본문 없이 Content-Range 헤더만',
      },
    ],
  },

  'GET /api/admin/requests/[id]': {
    file: 'src/app/api/admin/requests/[id]/route.ts',
    gates: [{ order: 1, status: 404, line: 28, kind: 'not-found', message: '접수를 찾을 수 없습니다', reach: '없는 id' }],
  },

  'GET /api/admin/requests/[id]/candidates': {
    file: 'src/app/api/admin/requests/[id]/candidates/route.ts',
    gates: [{ order: 1, status: 404, line: 19, kind: 'not-found', message: '접수를 찾을 수 없습니다', reach: '없는 id' }],
  },

  'GET /api/admin/technicians/[id]': {
    file: 'src/app/api/admin/technicians/[id]/route.ts',
    gates: [{ order: 1, status: 404, line: 43, kind: 'not-found', message: '전기기사를 찾을 수 없습니다', reach: '없는 id' }],
  },

  'GET /api/admin/providers/[id]': {
    file: 'src/app/api/admin/providers/[id]/route.ts',
    gates: [{ order: 1, status: 404, line: 41, kind: 'not-found', message: '업체를 찾을 수 없습니다', reach: '없는 id' }],
  },

  'GET /api/admin/technicians/[id]/contract': {
    file: 'src/app/api/admin/technicians/[id]/contract/route.ts',
    gates: [{ order: 1, status: 404, line: 44, kind: 'not-found', message: '전기기사를 찾을 수 없습니다', reach: '없는 id' }],
  },

  // ═══ 전기기사 ════════════════════════════════════════════════════════════

  'POST /api/tech/jobs/[id]/status': {
    file: 'src/app/api/tech/jobs/[id]/status/route.ts',
    note:
      '**이 핸들러가 그림자 지도를 만들게 한 원본 사례다.** zod(:27-30)가 소유권(:36-38)보다 먼저라, ' +
      "남의 배정에 `{}` 를 보내면 404 가 아니라 400 이 나온다. 소유권을 검증하려면 " +
      "본문을 `{ status: 'DISPATCHED' }` 로 **유효하게** 줘야 한다.",
    gates: [
      { order: 1, status: 400, line: 25, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      {
        order: 2,
        status: 400,
        line: 29,
        kind: 'schema',
        message: '상태값이 올바르지 않습니다',
        reach: "status 가 DISPATCHED/COMPLETED 가 아님. `{}` 로 도달",
      },
      {
        order: 3,
        status: 404,
        line: 37,
        kind: 'state',
        message: '배정 건을 찾을 수 없습니다',
        reach: '배정이 없거나 **내 것이 아님** + 유효한 본문',
        trap: '본문이 부실하면 :29 의 400 이 먼저 — 소유권 검사는 실행조차 안 된다',
      },
      {
        order: 4,
        status: 409,
        line: 40,
        kind: 'conflict',
        message: '수락된 배정만 진행할 수 있습니다',
        reach: '내 배정이지만 Assignment.status !== ACCEPTED (REQUESTED 상태로 바로 status 호출)',
      },
      {
        order: 5,
        status: 409,
        line: 49,
        kind: 'conflict',
        message: '출동을 시작할 수 없는 상태입니다',
        reach: 'Assignment 는 ACCEPTED 인데 ServiceRequest 가 ACCEPTED 가 아님',
      },
      {
        order: 6,
        status: 409,
        line: 59,
        kind: 'conflict',
        message: '완료 처리할 수 없는 상태입니다 (출동 시작을 먼저 눌러주세요)',
        reach: "status='COMPLETED' 인데 ServiceRequest 가 DISPATCHED 가 아님",
      },
    ],
  },

  'POST /api/tech/jobs/[id]/accept': {
    file: 'src/app/api/tech/jobs/[id]/accept/route.ts',
    gates: [
      {
        order: 1,
        status: 404,
        line: 21, // egg-credit: spendEggOnAccept import 1줄로 +1
        kind: 'state',
        message: '배정 건을 찾을 수 없습니다',
        reach: '배정 없음 또는 남의 배정. **본문 검증이 없어 바로 도달한다**',
      },
      {
        order: 2,
        status: 409,
        line: 30, // egg-credit: +1
        kind: 'conflict',
        message: '이미 처리된 배정입니다',
        reach: '내 배정이지만 status !== REQUESTED (재수락·거절 후 수락)',
      },
    ],
  },

  'POST /api/tech/jobs/[id]/reject': {
    file: 'src/app/api/tech/jobs/[id]/reject/route.ts',
    note:
      '본문 파싱 실패는 try 안에서 삼켜진다(:23-28) — 본문 없이 호출해도 400 이 아니다. ' +
      '따라서 소유권 404 에 바로 도달한다. ' +
      '⚠️ assignedBy=AUTO 인 배정을 거절하면 :48-66 에서 **다음 후보로 실제 재배정**되어 ' +
      'Assignment 가 새로 생기고 SMS 가 나간다. 픽스처는 assignedBy=ADMIN 으로 만들 것.',
    gates: [
      { order: 1, status: 404, line: 35, kind: 'state', message: '배정 건을 찾을 수 없습니다', reach: '배정 없음 또는 남의 배정' },
      { order: 2, status: 409, line: 44, kind: 'conflict', message: '이미 처리된 배정입니다', reach: 'status !== REQUESTED' },
    ],
  },

  'GET /api/tech/eggs': {
    file: 'src/app/api/tech/eggs/route.ts',
    gates: [
      { order: 1, status: 404, line: 14, kind: 'state', message: '프로필을 찾을 수 없습니다', reach: '세션 technicianId 의 프로필 행이 없는 경우(실무상 희귀)' },
    ],
  },

  'GET /api/tech/jobs/[id]': {
    file: 'src/app/api/tech/jobs/[id]/route.ts',
    gates: [
      { order: 1, status: 404, line: 20, kind: 'state', message: '배정 건을 찾을 수 없습니다', reach: '배정 없음 또는 남의 배정' },
    ],
  },

  'PUT /api/tech/contract': {
    file: 'src/app/api/tech/contract/route.ts',
    note:
      '**409 가 2개이고 서로 배타적이다.** :152 는 CONFIRMED, :160 은 임금 미확정. ' +
      "createTechFixture({ contractStatus: 'DRAFT' }) 는 wageAmount 를 넣지 않으므로 " +
      '**서명(200)이 아니라 :160 의 409 가 나온다.** 200 을 보려면 관리자가 ' +
      'PUT /api/admin/technicians/[id]/contract 로 임금을 먼저 넣어야 한다 — 역할 간 선행 의존이다.',
    gates: [
      { order: 1, status: 400, line: 134, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 2, status: 400, line: 140, kind: 'schema', message: null, reach: 'techContractSchema 위반. `{}` 로 도달' },
      {
        order: 3,
        status: 404,
        line: 147,
        kind: 'not-found',
        message: '전기기사 정보를 찾을 수 없습니다',
        reach: '세션의 technicianId 가 실재하지 않음',
      },
      {
        order: 4,
        status: 409,
        line: 152,
        kind: 'conflict',
        message: '이미 확정된 근로확인서는 수정할 수 없습니다. 관리자에게 문의해 주세요.',
        reach: "contractStatus: 'CONFIRMED'",
      },
      {
        order: 5,
        status: 409,
        line: 160,
        kind: 'conflict',
        message: '임금이 확정되지 않았습니다. 관리자가 임금을 입력한 뒤 서명할 수 있습니다.',
        reach: '계약이 CONFIRMED 가 아니고 wageAmount 가 null — 픽스처 기본 상태',
        trap: 'CONFIRMED 로 만들면 :152 가 먼저 잡는다',
      },
    ],
  },

  'GET /api/tech/contract': {
    file: 'src/app/api/tech/contract/route.ts',
    note: 'loadOrCreate 가 근로확인서 행을 **없으면 만든다** — GET 이 부수효과를 낸다.',
    gates: [
      { order: 1, status: 404, line: 119, kind: 'not-found', message: '전기기사 정보를 찾을 수 없습니다', reach: '세션의 technicianId 미존재' },
    ],
  },

  'POST /api/tech/signup': {
    file: 'src/app/api/tech/signup/route.ts',
    note:
      '**게이트 10개. 429 가 맨 앞이고 IP당 10분/5회다** — 400 분기 4개를 연속으로 태우면 ' +
      '5번째 호출부터 429 가 나온다. 호출마다 freshIp() 를 쓸 것(uniqueIp(seed) 는 고정이라 부족). ' +
      '또한 **loginId 중복 409(:80)가 본인인증 검증 전체보다 앞선다** — 인증 분기를 테스트하려면 ' +
      'loginId 는 매번 새로 만들어야 한다.',
    gates: [
      {
        order: 1,
        status: 429,
        line: 55,
        kind: 'rate-limit',
        message: '신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        reach: '같은 IP 로 10분 내 6회째',
      },
      { order: 2, status: 400, line: 63, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      {
        order: 3,
        status: 400,
        line: 70,
        kind: 'schema',
        message: null,
        reach: 'zod 위반 — **verificationId 누락도 여기다**(별도 분기가 아님)',
      },
      {
        order: 4,
        status: 409,
        line: 80,
        kind: 'conflict',
        message: '이미 사용 중인 아이디입니다',
        reach: 'loginId 중복',
        trap: '아래 본인인증 분기 5개를 전부 가린다',
      },
      {
        order: 5,
        status: 400,
        line: 91,
        kind: 'state',
        message: '본인인증 정보를 찾을 수 없습니다. 다시 인증해 주세요.',
        reach: '없는 verificationId',
      },
      {
        order: 6,
        status: 400,
        line: 97,
        kind: 'state',
        message: '이미 사용된 본인인증입니다. 다시 인증해 주세요.',
        reach: 'createIdentityVerification({ consumedAt: new Date() })',
        trap: '만료 분기(:103)를 노리면서 consumedAt 까지 주면 여기 걸린다',
      },
      {
        order: 7,
        status: 400,
        line: 103,
        kind: 'state',
        message: '본인인증 유효시간이 지났습니다. 다시 인증해 주세요.',
        reach: 'createIdentityVerification({ expiresAt: <과거> }) — consumedAt 은 null 로 둘 것',
      },
      {
        order: 8,
        status: 400,
        line: 109,
        kind: 'state',
        message: '본인인증한 번호와 가입 번호가 다릅니다. 다시 인증해 주세요.',
        reach: '인증 레코드의 phone 과 가입 본문의 phone 이 다름',
      },
      { order: 9, status: 400, line: 135, kind: 'state', message: '추천인을 찾을 수 없습니다', reach: 'referrerUserId 미존재/미승인/비활성' },
      {
        order: 10,
        status: 400,
        line: 140,
        kind: 'state',
        message: '본인을 추천인으로 지정할 수 없습니다',
        reach: '`referrer.phone === iv.phone` — 제출값이 아니라 **인증된 번호** 기준',
      },
      {
        order: 11,
        status: 400,
        line: 190,
        kind: 'race',
        message: '이미 사용된 본인인증입니다. 다시 인증해 주세요.',
        reach: '트랜잭션 내부 IDENTITY_ALREADY_USED — 같은 인증으로 **동시** 가입해야 도달. 순차로는 :97 이 잡는다',
        trap:
          '⚠️ :97 과 상태코드도 문구도 **완전히 같다**. 이 분기를 때렸다는 것은 응답으로 증명 불가하며, ' +
          '동시 요청 2건 중 성공한 User 가 1건뿐임을 DB 로 확인하는 간접 증거밖에 없다. ' +
          '커버리지를 주장하지 말 것',
      },
    ],
  },

  // ═══ 업체 ══════════════════════════════════════════════════════════════

  'POST /api/partner/signup': {
    file: 'src/app/api/partner/signup/route.ts',
    note:
      '**multipart 전용이다.** JSON 을 보내면 req.formData() 가 throw 해서 :65 의 400 이 나온다. ' +
      '⚠️ **사업자등록번호 검증(:89)이 파일 게이트 6개보다 앞선다** — bizCert/elecCert 미첨부/용량/MIME 를 ' +
      '테스트하려면 bizRegNo 를 **검증번호까지 유효하게** 넣어야 한다. 아니면 체크섬 400 을 맞고 ' +
      '파일 게이트를 한 번도 실행하지 않은 채 초록이 된다. 중복 409 2개도 마찬가지로 ' +
      '유효한 파일 2개(bizCert·elecCert)가 첨부돼야 도달한다. elecCert 게이트 3개는 ' +
      'bizCert 3개를 전부 통과해야 도달한다.',
    gates: [
      {
        order: 1,
        status: 429,
        line: 57,
        kind: 'rate-limit',
        message: '신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        reach: '같은 IP 로 10분 내 6회째',
      },
      {
        order: 2,
        status: 400,
        line: 65,
        kind: 'body-parse',
        message: '잘못된 요청입니다',
        reach: 'multipart 가 아닌 본문 — **JSON 을 보내면 여기다**',
      },
      { order: 3, status: 400, line: 80, kind: 'schema', message: null, reach: 'fieldsSchema 위반' },
      {
        order: 4,
        status: 400,
        line: 89,
        kind: 'state',
        message: '사업자등록번호가 올바르지 않습니다 (10자리 숫자, 검증번호 불일치)',
        reach: '체크섬 불일치. admin POST 와 달리 **조건 없이 항상** 검사한다',
        trap: '아래 파일 게이트 6개와 중복 409 2개를 전부 가린다',
      },
      {
        order: 5,
        status: 400,
        line: 97,
        kind: 'state',
        message: '사업자등록증 사진을 첨부해 주세요',
        reach: 'bizCert 필드 없음 또는 size 0. **유효한 bizRegNo 필수**',
      },
      { order: 6, status: 400, line: 103, kind: 'state', message: '파일이 너무 큽니다 (8MB 이하)', reach: 'bizCert 8MB 초과' },
      {
        order: 7,
        status: 400,
        line: 109,
        kind: 'state',
        message: '이미지(JPG/PNG/WEBP/HEIC) 또는 PDF만 첨부할 수 있습니다',
        reach: 'bizCert 허용 목록 밖 MIME. **8MB 이하여야 여기까지 온다**',
      },
      {
        order: 8,
        status: 400,
        line: 117,
        kind: 'state',
        message: '전기공사업 등록증 사진을 첨부해 주세요',
        reach: 'elecCert 필드 없음 또는 size 0. **유효한 bizCert 필수**',
      },
      { order: 9, status: 400, line: 123, kind: 'state', message: '전기공사업 등록증 파일이 너무 큽니다 (8MB 이하)', reach: 'elecCert 8MB 초과' },
      {
        order: 10,
        status: 400,
        line: 129,
        kind: 'state',
        message: '전기공사업 등록증은 이미지(JPG/PNG/WEBP/HEIC) 또는 PDF만 첨부할 수 있습니다',
        reach: 'elecCert 허용 목록 밖 MIME',
      },
      { order: 11, status: 409, line: 138, kind: 'conflict', message: '이미 사용 중인 아이디입니다', reach: 'loginId 중복 + 유효 파일 2개 첨부' },
      {
        order: 12,
        status: 409,
        line: 143,
        kind: 'conflict',
        message: '이미 가입 신청된 사업자등록번호입니다',
        reach: 'bizRegNo 중복 + loginId 는 신규 + 유효 파일 2개 첨부',
        trap: 'loginId 까지 중복이면 :138 이 먼저다',
      },
      { order: 13, status: 400, line: 168, kind: 'state', message: '추천인을 찾을 수 없습니다', reach: 'referrerUserId 미존재/미승인/비활성' },
      { order: 14, status: 400, line: 173, kind: 'state', message: '본인을 추천인으로 지정할 수 없습니다', reach: '자기 자신 지정' },
    ],
  },

  'POST /api/partner/jobs/[id]/status': {
    file: 'src/app/api/partner/jobs/[id]/status/route.ts',
    note: 'tech 쪽과 완전 동형 — zod 가 소유권보다 먼저다. 같은 함정이 그대로 있다.',
    gates: [
      { order: 1, status: 400, line: 25, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 2, status: 400, line: 29, kind: 'schema', message: '상태값이 올바르지 않습니다', reach: '`{}` 로 도달' },
      {
        order: 3,
        status: 404,
        line: 37,
        kind: 'state',
        message: '배정 건을 찾을 수 없습니다',
        reach: '배정 없음 또는 남의 배정 + **유효한 본문**',
        trap: '본문이 부실하면 :29 가 먼저',
      },
      { order: 4, status: 409, line: 40, kind: 'conflict', message: '수락된 배정만 진행할 수 있습니다', reach: 'Assignment !== ACCEPTED' },
      { order: 5, status: 409, line: 49, kind: 'conflict', message: '출동을 시작할 수 없는 상태입니다', reach: 'ServiceRequest !== ACCEPTED' },
      {
        order: 6,
        status: 409,
        line: 59,
        kind: 'conflict',
        message: '완료 처리할 수 없는 상태입니다 (출동 시작을 먼저 눌러주세요)',
        reach: 'ServiceRequest !== DISPATCHED',
      },
    ],
  },

  'POST /api/partner/jobs/[id]/accept': {
    file: 'src/app/api/partner/jobs/[id]/accept/route.ts',
    gates: [
      { order: 1, status: 404, line: 21, kind: 'state', message: '배정 건을 찾을 수 없습니다', reach: '배정 없음 또는 남의 배정' }, // egg-credit: +1
      { order: 2, status: 409, line: 30, kind: 'conflict', message: '이미 처리된 배정입니다', reach: 'status !== REQUESTED' }, // egg-credit: +1
    ],
  },

  'POST /api/partner/jobs/[id]/reject': {
    file: 'src/app/api/partner/jobs/[id]/reject/route.ts',
    note: 'tech 와 동일하게 assignedBy=AUTO 면 실제 재배정이 일어난다. 픽스처는 ADMIN 으로.',
    gates: [
      { order: 1, status: 404, line: 35, kind: 'state', message: '배정 건을 찾을 수 없습니다', reach: '배정 없음 또는 남의 배정' },
      { order: 2, status: 409, line: 44, kind: 'conflict', message: '이미 처리된 배정입니다', reach: 'status !== REQUESTED' },
    ],
  },

  'GET /api/partner/jobs/[id]': {
    file: 'src/app/api/partner/jobs/[id]/route.ts',
    gates: [{ order: 1, status: 404, line: 20, kind: 'state', message: '배정 건을 찾을 수 없습니다', reach: '배정 없음 또는 남의 배정' }],
  },

  'GET /api/partner/eggs': {
    file: 'src/app/api/partner/eggs/route.ts',
    gates: [
      { order: 1, status: 404, line: 14, kind: 'state', message: '프로필을 찾을 수 없습니다', reach: '세션 providerId 의 프로필 행이 없는 경우(실무상 희귀)' },
    ],
  },

  'GET /api/partner/profile': {
    file: 'src/app/api/partner/profile/route.ts',
    gates: [{ order: 1, status: 404, line: 32, kind: 'not-found', message: '업체 정보를 찾을 수 없습니다', reach: '세션 providerId 미존재' }],
  },

  'PATCH /api/partner/profile': {
    file: 'src/app/api/partner/profile/route.ts',
    note:
      'patchSchema 는 전 필드 optional 이라 `{}` 가 **통과한다** — 400 이 아니라 200(무변경)이다. ' +
      '또한 address 를 주면 카카오 지오코딩을 실호출한다(:77).',
    gates: [
      { order: 1, status: 400, line: 55, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      {
        order: 2,
        status: 400,
        line: 61,
        kind: 'schema',
        message: null,
        reach: '값을 주되 형식을 틀려야 한다 — 예: `{ phone: "abc" }`. `{}` 로는 도달 못 한다',
      },
      { order: 3, status: 404, line: 70, kind: 'not-found', message: '업체 정보를 찾을 수 없습니다', reach: '세션 providerId 미존재' },
    ],
  },

  // ═══ 공개 ══════════════════════════════════════════════════════════════

  'GET /api/auth/check-login-id': {
    file: 'src/app/api/auth/check-login-id/route.ts',
    note:
      '가입 폼의 아이디 중복 확인 — 공개 엔드포인트라 계정 열거 남용 방지용 ' +
      '레이트리밋(10분 30회)이 첫 게이트다. 최종 차단은 가입 API 409 가 담당한다.',
    gates: [
      {
        order: 1,
        status: 429,
        line: 28,
        kind: 'rate-limit',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        reach: '같은 IP 로 10분 내 31회째',
      },
      {
        order: 2,
        status: 400,
        line: 36,
        kind: 'schema',
        message: '아이디는 3자 이상 30자 이하여야 합니다',
        reach: 'loginId 파라미터 없음/3자 미만/30자 초과',
      },
    ],
  },

  'POST /api/auth/login': {
    file: 'src/app/api/auth/login/route.ts',
    note:
      '⚠️ **:37 의 401 은 세션 가드가 아니다** — 자격증명 불일치다. 이 라우트가 공개라는 사실과 ' +
      '모순되지 않으니 auth-matrix 의 401 단언 대상으로 오해하지 말 것. ' +
      '**그리고 :37 이 승인 게이트(:52·:61)보다 앞선다** — "승인 대기 업체는 로그인 차단(403)" 을 ' +
      '검증하려면 비밀번호를 **맞게** 줘야 한다. 틀리면 401 이 나오고 403 은 실행조차 안 된다.',
    gates: [
      { order: 1, status: 400, line: 17, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 2, status: 400, line: 23, kind: 'schema', message: null, reach: 'loginSchema 위반. `{}` 로 도달' },
      {
        order: 3,
        status: 401,
        line: 37,
        kind: 'state',
        message: '아이디 또는 비밀번호가 올바르지 않습니다',
        reach: '없는 loginId 또는 비밀번호 불일치',
        trap: '아래 403 두 개를 전부 가린다',
      },
      {
        order: 4,
        status: 403,
        line: 52,
        kind: 'state',
        message: '가입 승인 대기 중입니다. 승인 완료 후 다시 로그인해 주세요.',
        reach: "approvalStatus='PENDING' + **올바른 비밀번호**",
      },
      {
        order: 5,
        status: 403,
        line: 61,
        kind: 'state',
        message: null,
        reach: "approvalStatus='REJECTED' + 올바른 비밀번호. message 에 rejectReason 이 끼어들어 고정 문자열이 아니다",
      },
    ],
  },

  'POST /api/requests': {
    file: 'src/app/api/requests/route.ts',
    note:
      '레이트리밋(:78)이 **모든 분기보다 먼저**다 — IP당 10분 10회. 같은 IP 로 11번째 ' +
      'POST 하면 어떤 400 을 노렸든 429 가 나온다. 400 분기를 연속으로 태우는 스펙은 ' +
      'freshIp() 를 써야 한다. 본문 파싱 분기는 content-type 에 따라 갈린다' +
      '(:91 multipart / :108 JSON). 음성 게이트 2개는 multipart 에서만 도달한다.',
    gates: [
      {
        order: 1,
        status: 429,
        line: 78,
        kind: 'rate-limit',
        message: '접수 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        reach: '같은 x-forwarded-for 로 10분 내 11회째 POST',
      },
      { order: 2, status: 400, line: 91, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'content-type 이 multipart 인데 formData 파싱 실패' },
      { order: 3, status: 400, line: 108, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 경로에서 파싱 실패' },
      { order: 4, status: 400, line: 116, kind: 'schema', message: null, reach: 'createSchema 위반' },
      {
        order: 5,
        status: 400,
        line: 124,
        kind: 'state',
        message: '고장 내용을 입력하거나 음성으로 남겨 주세요',
        reach: 'zod 통과 + description 비어 있음 + 음성 첨부도 없음',
      },
      {
        order: 6,
        status: 400,
        line: 137,
        kind: 'state',
        message: '지원하지 않는 음성 형식입니다',
        reach: 'multipart + 음성 첨부 + 허용 목록 밖 MIME',
      },
      {
        order: 7,
        status: 400,
        line: 143,
        kind: 'state',
        message: '음성 파일이 너무 큽니다 (최대 15MB)',
        reach: '15MB 초과 + **지원되는 MIME**',
        trap: 'MIME 이 틀리면 :109 가 먼저 — 용량 게이트는 실행되지 않는다',
      },
    ],
  },

  'POST /api/survey/[token]': {
    file: 'src/app/api/survey/[token]/route.ts',
    note:
      '**레이트리밋이 IP당 60초에 10회로 앱에서 가장 빡빡하다.** rating 경계값을 연속으로 ' +
      '태우면 금세 429 다 — 호출마다 freshIp() 를 쓸 것. GET 에는 레이트리밋이 없다.',
    gates: [
      {
        order: 1,
        status: 429,
        line: 65,
        kind: 'rate-limit',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        reach: '같은 IP 로 60초 내 11회째',
      },
      { order: 2, status: 400, line: 75, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 3, status: 400, line: 81, kind: 'schema', message: null, reach: 'rating 범위·comment 길이·paidAmount 형식 위반' },
      {
        order: 4,
        status: 409,
        line: 98,
        kind: 'conflict',
        message: '이미 제출된 설문입니다',
        reach: '토큰은 실재하고 submittedAt 이 이미 채워짐',
      },
      {
        order: 5,
        status: 404,
        line: 100,
        kind: 'not-found',
        message: '설문을 찾을 수 없습니다',
        reach: '토큰 자체가 없음. :98 과 같은 `count===0` 에서 갈린다',
      },
    ],
  },

  'GET /api/survey/[token]': {
    file: 'src/app/api/survey/[token]/route.ts',
    note: '레이트리밋 없음.',
    gates: [{ order: 1, status: 404, line: 48, kind: 'not-found', message: '설문을 찾을 수 없습니다', reach: '없는 토큰' }],
  },

  'POST /api/identity/verify': {
    file: 'src/app/api/identity/verify/route.ts',
    gates: [
      {
        order: 1,
        status: 429,
        line: 35,
        kind: 'rate-limit',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        reach: '같은 IP 로 10분 내 11회째',
      },
      { order: 2, status: 400, line: 43, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      {
        order: 3,
        status: 400,
        line: 48,
        kind: 'schema',
        message: '입력값을 확인해 주세요',
        reach:
          'bodySchema 는 **세 필드가 전부 optional** 이라 `{}` 로는 도달하지 못한다. ' +
          '타입 위반(`{ name: 123 }`) 또는 길이 초과(name>50, phone>30)가 필요하다',
        trap: '`{}` 는 zod 를 통과해 :56 으로 간다',
      },
      {
        order: 4,
        status: 400,
        line: 56,
        kind: 'state',
        message: null,
        reach:
          'confirmIdentity 가 throw. mock provider(IDENTITY_PROVIDER!=portone) 기준 두 갈래 — ' +
          '`{}` 또는 이름/번호 누락 → 「이름과 휴대폰번호를 입력해 주세요 (개발용 인증)」(mock.ts:12), ' +
          '숫자만 남겼을 때 `^0\\d{8,10}$` 위반 → 「인증된 휴대폰번호 형식이 올바르지 않습니다」(identity/index.ts:51). ' +
          'message 가 고정이 아니므로 문구로 단언하려면 어느 갈래인지 먼저 정할 것',
      },
    ],
  },

  'POST /api/requests/lookup': {
    file: 'src/app/api/requests/lookup/route.ts',
    gates: [
      { order: 1, status: 429, line: 35, kind: 'rate-limit', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', reach: '같은 IP 반복' },
      { order: 2, status: 400, line: 43, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 3, status: 400, line: 49, kind: 'schema', message: null, reach: 'lookupSchema 위반' },
    ],
  },

  'POST /api/referrer/lookup': {
    file: 'src/app/api/referrer/lookup/route.ts',
    gates: [
      { order: 1, status: 429, line: 44, kind: 'rate-limit', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', reach: '같은 IP 반복' },
      { order: 2, status: 400, line: 52, kind: 'body-parse', message: '잘못된 요청입니다', reach: 'JSON 이 아닌 본문' },
      { order: 3, status: 400, line: 58, kind: 'schema', message: null, reach: 'lookupSchema 위반' },
    ],
  },

  'GET /api/geo/reverse': {
    file: 'src/app/api/geo/reverse/route.ts',
    note: '레이트리밋 없음 — 계획이 나열한 6개 라우트에 포함되지 않는다.',
    gates: [
      { order: 1, status: 400, line: 10, kind: 'state', message: '좌표가 올바르지 않습니다', reach: 'lat/lng 가 유한수로 파싱되지 않음' },
    ],
  },

  'GET /api/internal/auto-assign': {
    file: 'src/app/api/internal/auto-assign/route.ts',
    note:
      'GET·POST 가 같은 handle() 을 쓰고 authorized() 가 x-cron-secret 과 Authorization: Bearer 를 ' +
      '**둘 다** 받는다(:10-11). 메서드별 헤더 제약이 아니다. Authorization 은 `Bearer ${secret}` 과 ' +
      '문자열 완전 일치여야 한다.',
    gates: [
      { order: 1, status: 401, line: 16, kind: 'state', message: '권한이 없습니다', reach: '두 헤더 모두 없거나 값 불일치' },
    ],
  },

  'POST /api/internal/auto-assign': {
    file: 'src/app/api/internal/auto-assign/route.ts',
    gates: [
      { order: 1, status: 401, line: 16, kind: 'state', message: '권한이 없습니다', reach: '두 헤더 모두 없거나 값 불일치' },
    ],
  },
};

/** `${METHOD} ${path}` 로 게이트 목록을 얻는다. 없으면 401 가드 외 4xx 분기가 없는 핸들러다. */
export function gatesFor(method: string, path: string): HandlerGates | undefined {
  return GATES[`${method} ${path}`];
}

/**
 * 특정 분기를 노린 테스트가 **그 분기에 실제로 도달했는지** 확인한다.
 * 상태코드만 보는 단언이 앞선 게이트를 때리고도 통과하는 것을 막는다.
 *
 *   const gate = expectGate('POST /api/admin/providers', 96);
 *   expect(res.status()).toBe(gate.status);
 *   expect((await res.json()).error).toBe(gate.message);
 */
export function expectGate(handlerKey: string, line: number): Gate {
  const handler = GATES[handlerKey];
  if (!handler) throw new Error(`gates.ts 에 ${handlerKey} 항목이 없습니다`);
  const gate = handler.gates.find((g) => g.line === line);
  if (!gate) {
    throw new Error(
      `${handlerKey} 에 :${line} 분기가 없습니다. 있는 분기: ${handler.gates
        .map((g) => `${g.status}@:${g.line}`)
        .join(', ')}`,
    );
  }
  return gate;
}

/** 상태코드가 같은 분기가 2개 이상이라 message 단언이 필수인 핸들러들. */
export function ambiguousHandlers(): string[] {
  return Object.entries(GATES)
    .filter(([, h]) => {
      const counts = new Map<number, number>();
      for (const g of h.gates) counts.set(g.status, (counts.get(g.status) ?? 0) + 1);
      return [...counts.values()].some((n) => n > 1);
    })
    .map(([key]) => key)
    .sort();
}

/** 순차 클라이언트로는 도달 불가한 분기 — 진짜 동시성이 필요하다. */
export function raceOnlyGates(): Array<{ handler: string; gate: Gate }> {
  return Object.entries(GATES).flatMap(([handler, h]) =>
    h.gates.filter((g) => g.kind === 'race').map((gate) => ({ handler, gate })),
  );
}

/** 외부 의존(지오코딩) 실패에 걸리는 분기 — happy path 를 흔드는 원인이 된다. */
export function externalGates(): Array<{ handler: string; gate: Gate }> {
  return Object.entries(GATES).flatMap(([handler, h]) =>
    h.gates.filter((g) => g.kind === 'external').map((gate) => ({ handler, gate })),
  );
}
