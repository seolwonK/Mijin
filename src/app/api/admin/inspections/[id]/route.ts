import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PLAN_WITH_VISITS } from '@/lib/inspectionLifecycle';
import { buildPlanView, type PlanView } from '@/lib/inspectionView';

// 구독 1건의 고객 관리 화면(/admin/inspections/[id]) — 조회와 고객 정보·환불 기록 수정.
//
// 목록은 "지금 처리할 일"만 보여 주므로 완료·취소된 회차는 며칠 뒤 사라진다. 고객이 전화로
// "지난번 점검 때…"라고 물으면 답할 화면이 이것이다: 전체 회차 이력, 같은 계정의 이전 구독,
// 같은 전화번호로 들어온 고장 수리 접수를 한데 모은다.

/** 같은 번호의 고장 수리 접수를 몇 건까지 보여 줄지. 오래된 것은 접수 관리에서 찾는다. */
const REPAIR_LIMIT = 20;

export type AdminInspectionDetail = {
  plan: PlanView;
  account: {
    userId: string;
    loginId: string;
    name: string;
    phone: string | null;
    createdAt: string;
  };
  /** 입금을 확인한 관리자 이름 — 감사 추적. */
  paidConfirmedBy: string | null;
  /** 같은 계정의 다른 구독(갱신 이력). 최신순. */
  otherPlans: {
    id: string;
    status: PlanView['status'];
    termMonths: number;
    priceWon: number;
    startDate: string | null;
    endDate: string | null;
    createdAt: string;
  }[];
  /** 방문지 연락처·계정 전화번호로 들어온 고장 수리 접수. 최신순. */
  repairs: {
    id: string;
    lookupCode: string;
    status: string;
    urgency: string;
    description: string;
    address: string | null;
    createdAt: string;
  }[];
};

// 신청 스키마(api/inspection/apply)와 같은 규칙 — 이 값들은 문자 본문에 들어간다.
const SINGLE_LINE = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u;

const patchSchema = z
  .object({
    contactName: z
      .string()
      .trim()
      .min(1, '이름을 입력해 주세요')
      .max(50, '이름은 50자 이내로 입력해 주세요')
      .regex(SINGLE_LINE, '이름에 줄바꿈을 넣을 수 없습니다')
      .optional(),
    contactPhone: z
      .string()
      .transform((s) => s.replace(/\D/g, ''))
      .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다'))
      .optional(),
    address: z
      .string()
      .trim()
      .min(1, '점검 주소를 입력해 주세요')
      .max(200, '주소는 200자 이내로 입력해 주세요')
      .regex(SINGLE_LINE, '주소에 줄바꿈을 넣을 수 없습니다')
      .optional(),
    addressDetail: z
      .string()
      .trim()
      .max(100, '상세주소는 100자 이내로 입력해 주세요')
      .regex(SINGLE_LINE, '상세주소에 줄바꿈을 넣을 수 없습니다')
      .nullish(),
    memo: z.string().trim().max(500, '요청 사항은 500자 이내로 입력해 주세요').nullish(),
    // 환불 기록. null 이면 기록을 지운다(잘못 입력한 경우).
    refund: z
      .object({
        won: z
          .number({ error: '환불 금액을 입력해 주세요' })
          .int('환불 금액은 원 단위 정수로 입력해 주세요')
          .positive('환불 금액은 0보다 커야 합니다'),
        note: z.string().trim().max(300, '환불 메모는 300자 이내로 입력해 주세요').nullish(),
      })
      .nullable()
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), '변경할 내용이 없습니다');

async function loadDetail(id: string): Promise<AdminInspectionDetail | null> {
  const plan = await prisma.inspectionPlan.findUnique({
    where: { id },
    include: {
      ...PLAN_WITH_VISITS,
      user: { select: { id: true, loginId: true, name: true, phone: true, createdAt: true } },
    },
  });
  if (!plan) return null;

  const phones = [...new Set([plan.contactPhone, plan.user.phone].filter((p): p is string => !!p))];
  const [confirmer, otherPlans, repairs] = await Promise.all([
    plan.paidConfirmedByUserId
      ? prisma.user.findUnique({ where: { id: plan.paidConfirmedByUserId }, select: { name: true } })
      : null,
    prisma.inspectionPlan.findMany({
      where: { userId: plan.userId, id: { not: plan.id } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        termMonths: true,
        priceWon: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
    }),
    prisma.serviceRequest.findMany({
      where: { customerPhone: { in: phones } },
      orderBy: { createdAt: 'desc' },
      take: REPAIR_LIMIT,
      select: {
        id: true,
        lookupCode: true,
        status: true,
        urgency: true,
        description: true,
        address: true,
        createdAt: true,
      },
    }),
  ]);

  const view = buildPlanView(plan, 'admin');
  return {
    plan: view,
    account: {
      userId: plan.user.id,
      loginId: plan.user.loginId,
      name: plan.user.name,
      phone: plan.user.phone,
      createdAt: plan.user.createdAt.toISOString(),
    },
    paidConfirmedBy: confirmer?.name ?? null,
    otherPlans: otherPlans.map((p) => ({
      id: p.id,
      status: p.status,
      termMonths: p.termMonths,
      priceWon: p.priceWon,
      startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
      endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
      createdAt: p.createdAt.toISOString(),
    })),
    repairs: repairs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { id } = await params;
  const detail = await loadDetail(id);
  if (!detail) {
    return NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 });
  }
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const { refund, ...contact } = parsed.data;

  const plan = await prisma.inspectionPlan.findUnique({
    where: { id },
    select: { priceWon: true, paidConfirmedAt: true },
  });
  if (!plan) {
    return NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 });
  }
  // 받은 적 없는 돈은 돌려줄 수 없다 — 입금 확인 전 구독의 환불 기록은 오기입이다.
  if (refund && !plan.paidConfirmedAt) {
    return NextResponse.json(
      { error: '입금 확인 전인 구독에는 환불을 기록할 수 없습니다.' },
      { status: 409 },
    );
  }
  if (refund && refund.won > plan.priceWon) {
    return NextResponse.json(
      { error: '환불 금액이 입금액보다 클 수 없습니다.' },
      { status: 400 },
    );
  }

  await prisma.inspectionPlan.update({
    where: { id },
    data: {
      ...contact,
      ...(contact.addressDetail !== undefined ? { addressDetail: contact.addressDetail || null } : {}),
      ...(contact.memo !== undefined ? { memo: contact.memo || null } : {}),
      // 주소가 바뀌면 이전 좌표는 틀린 값이 된다 — 남겨 두느니 비운다.
      ...(contact.address !== undefined ? { lat: null, lng: null } : {}),
      ...(refund === null ? { refundedWon: null, refundedAt: null, refundNote: null } : {}),
      ...(refund
        ? { refundedWon: refund.won, refundedAt: new Date(), refundNote: refund.note || null }
        : {}),
    },
  });

  return NextResponse.json(await loadDetail(id));
}
