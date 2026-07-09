import { NextRequest, NextResponse } from 'next/server';
import type { EmploymentContract } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { adminWageSchema } from '@/lib/contract';

function serialize(c: EmploymentContract) {
  return {
    ...c,
    contractStartDate: c.contractStartDate
      ? c.contractStartDate.toISOString().slice(0, 10)
      : null,
    contractEndDate: c.contractEndDate
      ? c.contractEndDate.toISOString().slice(0, 10)
      : null,
  };
}

async function loadEmployer() {
  const s = await prisma.appSettings.findUnique({ where: { id: 1 } });
  return {
    name: s?.employerName ?? '미진전기',
    ceo: s?.employerCeo ?? null,
    address: s?.employerAddress ?? null,
    phone: s?.employerPhone ?? null,
    bizRegNo: s?.employerBizRegNo ?? null,
    signatureDataUrl: s?.employerSignatureDataUrl ?? null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const tech = await prisma.technician.findUnique({
    where: { id },
    include: { user: { select: { name: true, phone: true } }, contract: true },
  });
  if (!tech) {
    return NextResponse.json({ error: '기술자를 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({
    technician: {
      id: tech.id,
      name: tech.user.name,
      phone: tech.user.phone,
      address: tech.address,
      employmentType: tech.employmentType,
    },
    employer: await loadEmployer(),
    contract: tech.contract ? serialize(tech.contract) : null,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = adminWageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const contract = await prisma.employmentContract.findUnique({
    where: { technicianId: id },
  });
  if (!contract) {
    return NextResponse.json(
      { error: '기술자가 아직 계약서를 작성하지 않았습니다' },
      { status: 404 },
    );
  }

  // 계약 완료(CONFIRMED)는 기술자의 서명으로 이뤄진다. 서명 완료본은 수정 불가.
  if (contract.status === 'CONFIRMED') {
    return NextResponse.json(
      { error: '기술자가 서명 완료한 계약서는 수정할 수 없습니다' },
      { status: 409 },
    );
  }

  const updated = await prisma.employmentContract.update({
    where: { technicianId: id },
    data: {
      wageType: data.wageType ?? null,
      wageAmount: data.wageAmount ?? null,
      bonusExists: data.bonusExists,
      bonusAmount: data.bonusExists ? data.bonusAmount ?? null : null,
      otherPayExists: data.otherPayExists,
      otherPayDesc: data.otherPayExists ? data.otherPayDesc ?? null : null,
      otherPayAmount: data.otherPayExists ? data.otherPayAmount ?? null : null,
      payDate: data.payDate ?? null,
      payMethod: data.payMethod ?? null,
      insuranceEmployment: data.insuranceEmployment,
      insuranceAccident: data.insuranceAccident,
      insurancePension: data.insurancePension,
      insuranceHealth: data.insuranceHealth,
    },
  });

  return NextResponse.json({ contract: serialize(updated) });
}
