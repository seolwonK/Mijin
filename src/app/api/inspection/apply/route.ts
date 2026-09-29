import { NextRequest, NextResponse, after } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { geocode } from '@/lib/geo';
import { createSessionToken, getSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { isCrossSiteRequest } from '@/lib/requestOrigin';
import { sendSms } from '@/lib/sms';
import { smsInspectionApplied } from '@/lib/sms/templates';
import { INSPECTION_PRICING, applyDateIssue, fromDateString, todayKst } from '@/lib/inspection';
import { readInspectionAccount } from '@/lib/inspectionAccount';
import { expireDuePlans } from '@/lib/inspectionLifecycle';

// 정기 전기점검 구독 신청 — 계정 생성 + 구독(입금 대기, 1년·2년 약정) + 1회차 희망일을 한 번에 받는다.
// 입금 전에 희망일까지 받는 것은 사용자 결정(2026-09-20): 고객이 두 번 들어오지 않게 한다.
//
// 이미 로그인한 고객(CUSTOMER 세션)은 계정을 새로 만들지 않고 구독만 추가한다 — 기간이 지나
// 만료된 구독을 갱신하는 경로다. 진행 중인 구독이 있으면 DB 의 부분 유니크 인덱스가 막는다.
// 로그인하지 않았어도 기존 아이디·비밀번호·전화번호로 본인이 확인되면 같은 갱신 경로를 탄다(renewed).

// 인메모리 레이트리밋: IP당 10분에 5회 (가입 계열과 동일 — tech/signup:35-48).
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  h.count++;
  return h.count > 5;
}

// 이름과 입금자명은 입금 안내 문자 본문에 그대로 들어간다. trim() 은 양 끝만 다듬으므로
// 가운데의 줄바꿈이 살아남으면, 실제 계좌가 찍힌 문자에 "※ 계좌 변경: …" 같은 줄을 끼워
// 임의의 번호로 보낼 수 있다(본인인증 없는 공개 라우트다).
// \p{Cc} 만으로는 U+2028/U+2029(줄·문단 구분자)와 서식 문자(Cf)가 빠진다 — 문자 템플릿의
// oneLine()(lib/sms/templates.ts)과 같은 범주를 막는다. 한 줄 입력란(주소·상세주소)도
// 업체 배정 문자 등으로 흘러갈 수 있어 같은 규칙을 건다. 메모는 여러 줄 입력란이라 제외.
const SINGLE_LINE = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u;

// 오류를 어느 입력란 옆에 보일지 클라이언트에 알린다(응답의 field). 여기 없는 필드는 생략(폼 상단에 표시).
// 반환문은 헬퍼로 접지 않는다 — 게이트 지도(tests/helpers/gates.ts)가 각 줄의 `status: 4xx` 리터럴로 대조한다.
type ErrorField = 'loginId' | 'preferredDate' | 'phone';
const ERROR_FIELDS: readonly string[] = ['loginId', 'preferredDate', 'phone'];

// 지오코딩 전체 상한 — 카카오(4초) → OSM(4초×최대 2회)이 모두 늘어지면 12초가 된다.
// 좌표는 없어도 신청이 진행되므로, 계정 생성이 클라이언트 타임아웃(20초)을 넘기지 않게 자른다.
const GEOCODE_BUDGET_MS = 6_000;
async function geocodeWithin(address: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), GEOCODE_BUDGET_MS);
  });
  try {
    return await Promise.race([geocode(address).catch(() => null), budget]);
  } finally {
    clearTimeout(timer);
  }
}

async function withSessionCookie(
  res: NextResponse,
  user: { userId: string; name: string },
): Promise<NextResponse> {
  const token = await createSessionToken({ userId: user.userId, role: 'CUSTOMER', name: user.name });
  // 수명은 역할별 세션 정책(고객 30일)을 따른다 — 로그인 라우트와 같은 옵션.
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions('CUSTOMER'));
  return res;
}

const applySchema = z.object({
  // 신규 가입에만 필요하다. 갱신(로그인 상태)에서는 비워 보낸다.
  loginId: z
    .string()
    .trim()
    .min(3, '아이디는 3자 이상')
    .max(30, '아이디는 30자 이내로 입력해 주세요')
    .optional(),
  // bcrypt 는 72바이트 뒤를 버린다 — 그 뒤가 달라도 같은 비밀번호로 통과하지 않게 막는다.
  password: z
    .string()
    .min(8, '비밀번호는 8자 이상')
    .refine((v) => new TextEncoder().encode(v).length <= 72, '비밀번호가 너무 깁니다(72바이트 이내)')
    .optional(),
  name: z
    .string()
    .trim()
    .min(1, '이름을 입력해 주세요')
    .max(50, '이름은 50자 이내로 입력해 주세요')
    .regex(SINGLE_LINE, '이름에 줄바꿈을 넣을 수 없습니다'),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  address: z
    .string()
    .trim()
    .min(1, '점검받을 주소를 입력해 주세요')
    .max(200, '주소는 200자 이내로 입력해 주세요')
    .regex(SINGLE_LINE, '주소에 줄바꿈을 넣을 수 없습니다'),
  addressDetail: z
    .string()
    .trim()
    .max(100, '상세주소는 100자 이내로 입력해 주세요')
    .regex(SINGLE_LINE, '상세주소에 줄바꿈을 넣을 수 없습니다')
    .nullish(),
  // 희망일은 형식뿐 아니라 "언제부터 언제까지"라는 규칙까지 스키마가 본다 —
  // 같은 판정을 화면(apply-form)도 같은 함수로 쓰므로 양쪽이 어긋나지 않는다.
  preferredDate: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const issue = applyDateIssue(value, todayKst());
      if (issue) ctx.addIssue({ code: 'custom', message: issue });
    }),
  timeSlot: z.enum(['MORNING', 'AFTERNOON', 'ANY']),
  // 요금제 — 2년 약정(월 5,500원)·1년 약정(월 7,700원). 금액은 서버의 요금표로 정한다(클라이언트 값 불신).
  term: z.enum(['ONE_YEAR', 'TWO_YEAR'], { error: '요금제를 선택해 주세요' }),
  memo: z.string().trim().max(500, '요청 사항은 500자 이내로 입력해 주세요').nullish(),
  // 입금자명이 신청자 이름과 다를 수 있다(가족 계좌 등). 비우면 이름을 그대로 쓴다.
  depositorName: z
    .string()
    .trim()
    .max(50, '입금자명은 50자 이내로 입력해 주세요')
    .regex(SINGLE_LINE, '입금자명에 줄바꿈을 넣을 수 없습니다')
    .nullish(),
});

export async function POST(req: NextRequest) {
  // 자동 로그인 쿠키를 발급하는 경로라 로그인 CSRF 와 같은 위험 — 다른 사이트의 폼 제출을 막는다
  // (Origin 없는 비브라우저 호출은 통과).
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청입니다' }, { status: 403 });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = String(issue?.path[0] ?? '');
    const field = ERROR_FIELDS.includes(key) ? (key as ErrorField) : undefined;
    return NextResponse.json(
      { error: issue?.message ?? '입력값을 확인해 주세요', ...(field ? { field } : {}) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 갱신 경로 — 로그인한 고객은 계정을 다시 만들지 않는다.
  const session = await getSession();
  // 업체·기사·관리자로 로그인한 채 신청하면 새 고객 세션 쿠키가 그 세션을 덮어써, 본인 포털에서
  // 말없이 로그아웃된다.
  if (session && session.role !== 'CUSTOMER') {
    return NextResponse.json(
      { error: '다른 계정으로 로그인되어 있습니다. 로그아웃한 뒤 신청해 주세요.' },
      { status: 409 },
    );
  }
  let existingUserId = session ? session.userId : null;
  // 로그인 없이 기존 계정으로 본인 확인된 갱신 — 끝에서 그 계정의 세션 쿠키를 발급한다.
  let renewed = false;

  if (!existingUserId) {
    // 아이디·비밀번호가 둘 다 없으면 갱신 화면에서 온 요청이다 — 그 사이 세션이 끝난 것이므로
    // 입력을 요구하지 않고 로그인으로 돌려보낸다(클라이언트가 401 을 보고 /my/login 으로 보낸다).
    if (!data.loginId && !data.password) {
      return NextResponse.json({ error: '로그인이 필요합니다', field: null }, { status: 401 });
    }
    if (!data.loginId || !data.password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력해 주세요' }, { status: 400 });
    }
    const dupLogin = await prisma.user.findUnique({
      where: { loginId: data.loginId },
      select: { id: true, name: true, role: true, phone: true, passwordHash: true },
    });
    if (dupLogin) {
      // 같은 전화번호에 비밀번호까지 맞으면 본인이다 — 새 계정은 만들지 않는다.
      // 본인 확인에 실패하면 남의 아이디이므로 아이디 중복으로 돌려보낸다.
      const verified =
        dupLogin.role === 'CUSTOMER' &&
        dupLogin.phone === data.phone &&
        (await bcrypt.compare(data.password, dupLogin.passwordHash));
      if (!verified) {
        return NextResponse.json(
          { error: '이미 사용 중인 아이디입니다', field: 'loginId' },
          { status: 409 },
        );
      }
      // 기간이 끝났는데 아직 ACTIVE 로 남은 구독을 먼저 내린다(세션 갱신 경로와 같은 이유).
      await expireDuePlans({ userId: dupLogin.id });
      const open = await prisma.inspectionPlan.findFirst({
        where: { userId: dupLogin.id, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (open) {
        // 방금 끊긴 신청의 재시도 — 계정·구독은 이미 만들어졌는데 응답(쿠키)만 못 받은 경우다.
        // 이번 입력은 저장하지 않고 로그인시켜 기존 신청으로 보낸다.
        return withSessionCookie(
          NextResponse.json({ ok: true, planId: open.id, resumed: true }),
          { userId: dupLogin.id, name: dupLogin.name },
        );
      }
      // 만료·취소된 구독만 있는 기존 고객 — 로그인 없이 온 갱신 신청이다.
      // 아래 세션 갱신 경로와 같은 구독 생성 로직으로 그 계정에 새 구독을 만든다.
      existingUserId = dupLogin.id;
      renewed = true;
    }
  } else {
    // 만료는 읽기 경로가 맡는데, 기간이 끝난 뒤 /my 를 열지 않고 곧장 갱신하러 온 고객은
    // 아직 ACTIVE 로 남아 있다 — 여기서 내리지 않으면 갱신이 "진행 중인 구독"에 막힌다.
    await expireDuePlans({ userId: existingUserId });
    const open = await prisma.inspectionPlan.findFirst({
      where: { userId: existingUserId, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } },
      select: { id: true },
    });
    if (open) {
      return NextResponse.json({ error: '이미 진행 중인 점검 구독이 있습니다.' }, { status: 409 });
    }
  }

  // 좌표는 시도만 한다 — 실패해도 신청은 진행(tech/signup 과 같은 정책). 상한을 둬 늘어지지 않게 한다.
  const geo = await geocodeWithin(data.address);
  const depositorName = data.depositorName || data.name;
  const pricing = INSPECTION_PRICING[data.term];
  const planData = {
    contactName: data.name,
    contactPhone: data.phone,
    address: data.address,
    addressDetail: data.addressDetail || null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    memo: data.memo || null,
    termMonths: pricing.months,
    priceWon: pricing.totalWon,
    // 매월 자동이체(사용자 결정 2026-09-29) — 첫 달 입금 확인 때 이 금액으로 납부 일정이 만들어진다.
    monthlyWon: pricing.monthlyWon,
    depositorName,
    visits: {
      create: {
        round: 1,
        preferredDate: fromDateString(data.preferredDate),
        timeSlot: data.timeSlot,
        note: data.memo || null,
      },
    },
  };

  let created: { userId: string; userName: string; planId: string };
  try {
    if (existingUserId) {
      const plan = await prisma.inspectionPlan.create({
        data: { userId: existingUserId, ...planData },
        select: { id: true, user: { select: { id: true, name: true } } },
      });
      created = { userId: plan.user.id, userName: plan.user.name, planId: plan.id };
    } else {
      const passwordHash = await bcrypt.hash(data.password!, 10);
      const user = await prisma.user.create({
        data: {
          loginId: data.loginId!,
          passwordHash,
          name: data.name,
          phone: data.phone,
          role: 'CUSTOMER',
          inspectionPlans: { create: planData },
        },
        select: { id: true, name: true, inspectionPlans: { select: { id: true } } },
      });
      created = {
        userId: user.id,
        userName: user.name,
        planId: user.inspectionPlans[0].id,
      };
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // loginId 유니크 또는 InspectionPlan_one_open_per_user(부분 유니크) 충돌 —
      // 위의 사전 검사와 이 사이의 동시 요청만 여기에 닿는다.
      const target = String(e.meta?.target ?? '');
      return NextResponse.json(
        target.includes('loginId')
          ? { error: '이미 사용 중인 아이디입니다', field: 'loginId' }
          : { error: '이미 진행 중인 점검 구독이 있습니다.' },
        { status: 409 },
      );
    }
    throw e;
  }

  // 입금 안내 문자는 응답 뒤로 미룬다(next/server after). 문자 공급자는 최대 20초까지
  // 늘어질 수 있는데, 그걸 기다리다 클라이언트가 끊으면 계정은 생기고 쿠키는 못 받는다.
  // 계좌가 아직 등록되지 않았다면 금액·입금자명만 안내한다. 실패는 로그만 남긴다.
  const applied = created;
  after(async () => {
    try {
      const account = await readInspectionAccount();
      await sendSms(
        data.phone,
        smsInspectionApplied({
          customerName: applied.userName,
          years: pricing.months / 12,
          monthlyWon: pricing.monthlyWon,
          account,
          depositorName,
        }),
      );
    } catch (e) {
      console.error('[점검 신청 입금 안내 문자 실패]', e);
    }
  });

  const res = NextResponse.json({
    ok: true,
    planId: created.planId,
    ...(renewed ? { renewed: true } : {}),
  });
  if (existingUserId && !renewed) return res;
  // 신청 직후 자동 로그인 — 입금 안내와 예약 현황이 있는 /my 로 바로 들어간다.
  return withSessionCookie(res, { userId: created.userId, name: created.userName });
}
