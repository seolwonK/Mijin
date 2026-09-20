import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { geocode } from '@/lib/geo';
import { createSessionToken, getSession, SESSION_COOKIE } from '@/lib/auth';
import { sendSms } from '@/lib/sms';
import { smsInspectionApplied } from '@/lib/sms/templates';
import { INSPECTION_PRICE_WON, applyDateIssue, fromDateString, todayKst } from '@/lib/inspection';
import { readInspectionAccount } from '@/lib/inspectionAccount';

// 정기 전기점검 구독 신청 — 계정 생성 + 구독(입금 대기) + 1분기 희망일을 한 번에 받는다.
// 입금 전에 희망일까지 받는 것은 사용자 결정(2026-09-20): 고객이 두 번 들어오지 않게 한다.
//
// 이미 로그인한 고객(CUSTOMER 세션)은 계정을 새로 만들지 않고 구독만 추가한다 — 1년이 지나
// 만료된 구독을 갱신하는 경로다. 진행 중인 구독이 있으면 DB 의 부분 유니크 인덱스가 막는다.

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

const applySchema = z.object({
  // 신규 가입에만 필요하다. 갱신(로그인 상태)에서는 비워 보낸다.
  loginId: z.string().trim().min(3, '아이디는 3자 이상').max(30).optional(),
  password: z.string().min(8, '비밀번호는 8자 이상').optional(),
  name: z.string().trim().min(1, '이름을 입력해 주세요').max(50),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  address: z.string().trim().min(1, '점검받을 주소를 입력해 주세요').max(200),
  addressDetail: z.string().trim().max(100).nullish(),
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
  memo: z.string().trim().max(500).nullish(),
  // 입금자명이 신청자 이름과 다를 수 있다(가족 계좌 등). 비우면 이름을 그대로 쓴다.
  depositorName: z.string().trim().max(50).nullish(),
});

export async function POST(req: NextRequest) {
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 갱신 경로 — 로그인한 고객은 계정을 다시 만들지 않는다.
  const session = await getSession();
  const existingUserId = session?.role === 'CUSTOMER' ? session.userId : null;

  if (!existingUserId) {
    if (!data.loginId || !data.password) {
      return NextResponse.json(
        { error: '아이디와 비밀번호를 입력해 주세요' },
        { status: 400 },
      );
    }
    const dupLogin = await prisma.user.findUnique({
      where: { loginId: data.loginId },
      select: { id: true },
    });
    if (dupLogin) {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
    }
  } else {
    const open = await prisma.inspectionPlan.findFirst({
      where: { userId: existingUserId, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } },
      select: { id: true },
    });
    if (open) {
      return NextResponse.json(
        { error: '이미 진행 중인 점검 구독이 있습니다.' },
        { status: 409 },
      );
    }
  }

  // 좌표는 시도만 한다 — 실패해도 신청은 진행(tech/signup 과 같은 정책).
  const geo = await geocode(data.address);
  const depositorName = data.depositorName || data.name;
  const planData = {
    contactName: data.name,
    contactPhone: data.phone,
    address: data.address,
    addressDetail: data.addressDetail || null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    memo: data.memo || null,
    priceWon: INSPECTION_PRICE_WON,
    depositorName,
    visits: {
      create: {
        quarter: 1,
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
        {
          error: target.includes('loginId')
            ? '이미 사용 중인 아이디입니다'
            : '이미 진행 중인 점검 구독이 있습니다.',
        },
        { status: 409 },
      );
    }
    throw e;
  }

  // 입금 안내 문자 — 계좌가 아직 등록되지 않았다면 금액·입금자명만 안내한다.
  const account = await readInspectionAccount();
  await sendSms(
    data.phone,
    smsInspectionApplied({
      customerName: created.userName,
      priceWon: INSPECTION_PRICE_WON,
      account,
      depositorName,
    }),
  );

  const res = NextResponse.json({ ok: true, planId: created.planId });
  if (!existingUserId) {
    // 신청 직후 자동 로그인 — 입금 안내와 예약 현황이 있는 /my 로 바로 들어간다.
    const token = await createSessionToken({
      userId: created.userId,
      role: 'CUSTOMER',
      name: created.userName,
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return res;
}
