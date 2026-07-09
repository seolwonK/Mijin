import { NextRequest, NextResponse } from 'next/server';
import type { EmploymentContract } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { contractDefaults, wageDefaultsFor } from '@/lib/contractDefaults';
import { techContractSchema } from '@/lib/contract';

// 로그인한 기술자의 근로계약서를 로드(없으면 DRAFT 생성)한다.
// DRAFT 동안엔 근무조건(소정근로시간·근무일)을 현재 근로형태 기준으로 다시 세팅해
// 기술자가 변조할 수 없도록 서버가 강제한다.
async function loadOrCreate(technicianId: string) {
  const tech = await prisma.technician.findUnique({
    where: { id: technicianId },
    include: { user: { select: { name: true } } },
  });
  if (!tech) return null;

  const d = contractDefaults(tech.employmentType);
  let contract = await prisma.employmentContract.findUnique({
    where: { technicianId },
  });

  if (!contract) {
    // 근로형태별 기본 임금(설정)을 생성 시 자동 기입 — 이후 관리자가 수정 가능
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const wage = wageDefaultsFor(tech.employmentType, settings);
    contract = await prisma.employmentContract.create({
      data: {
        technicianId,
        employmentType: tech.employmentType,
        // 근무장소·근로개시일을 기본값으로 미리 채워 가입 직후 바로 서명할 수 있게 한다.
        workLocation: '고객 현장 (출동)',
        contractStartDate: new Date(),
        jobDescription: '전기 설비 점검 및 출동 업무',
        workerAddress: tech.address,
        workerSignatureName: tech.user.name,
        ...d,
        ...wage,
      },
    });
  } else if (contract.status === 'DRAFT') {
    // 임금이 아직 비어 있는 기존 DRAFT 계약(관리자 대기 상태)에도 기본 임금을
    // 소급 적용해, 관리자 확정을 기다리지 않고 바로 서명할 수 있게 한다.
    // 이미 임금이 채워져 있으면(관리자 설정 포함) 덮어쓰지 않는다.
    const wage =
      contract.wageAmount == null
        ? wageDefaultsFor(
            tech.employmentType,
            await prisma.appSettings.findUnique({ where: { id: 1 } }),
          )
        : {};
    // 근무장소·근로개시일이 아직 비어 있으면 기본값을 채워 바로 서명 가능하게 한다.
    const prefill = {
      ...(contract.workLocation ? {} : { workLocation: '고객 현장 (출동)' }),
      ...(contract.contractStartDate ? {} : { contractStartDate: new Date() }),
    };
    contract = await prisma.employmentContract.update({
      where: { technicianId },
      data: { employmentType: tech.employmentType, ...d, ...wage, ...prefill },
    });
  }
  return { contract, employmentType: tech.employmentType };
}

function serialize(contract: EmploymentContract) {
  return {
    status: contract.status,
    employmentType: contract.employmentType,
    contractStartDate: contract.contractStartDate
      ? contract.contractStartDate.toISOString().slice(0, 10)
      : '',
    contractEndDate: contract.contractEndDate
      ? contract.contractEndDate.toISOString().slice(0, 10)
      : null,
    workLocation: contract.workLocation,
    jobDescription: contract.jobDescription,
    workStartTime: contract.workStartTime,
    workEndTime: contract.workEndTime,
    breakStartTime: contract.breakStartTime,
    breakEndTime: contract.breakEndTime,
    hoursNote: contract.hoursNote,
    workDays: contract.workDays,
    weeklyHoliday: contract.weeklyHoliday,
    wageType: contract.wageType,
    wageAmount: contract.wageAmount,
    payDate: contract.payDate,
    payMethod: contract.payMethod,
    workerAddress: contract.workerAddress,
    workerSignatureName: contract.workerSignatureName,
    workerSignatureDataUrl: contract.workerSignatureDataUrl,
    signedAt: contract.signedAt,
    submittedAt: contract.submittedAt,
  };
}

export async function GET() {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const loaded = await loadOrCreate(session.technicianId);
  if (!loaded) {
    return NextResponse.json({ error: '기술자 정보를 찾을 수 없습니다' }, { status: 404 });
  }
  return NextResponse.json({ contract: serialize(loaded.contract) });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = techContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const loaded = await loadOrCreate(session.technicianId);
  if (!loaded) {
    return NextResponse.json({ error: '기술자 정보를 찾을 수 없습니다' }, { status: 404 });
  }
  if (loaded.contract.status === 'CONFIRMED') {
    return NextResponse.json(
      { error: '이미 확정된 계약서는 수정할 수 없습니다. 관리자에게 문의해 주세요.' },
      { status: 409 },
    );
  }

  // 임금은 근로기준법 제17조상 필수 명시사항 — 금액 없이 서명(확정)할 수 없다
  if (loaded.contract.wageAmount == null) {
    return NextResponse.json(
      { error: '임금이 확정되지 않았습니다. 관리자가 임금을 입력한 뒤 서명할 수 있습니다.' },
      { status: 409 },
    );
  }

  // 근무조건은 서버가 근로형태로 강제 (클라이언트 값 무시), 일일 근로자는 계약기간 = 근로개시일 당일.
  // 기술자의 손글씨 서명이 곧 계약 확정이다 → 서명 저장 + status CONFIRMED.
  const d = contractDefaults(loaded.employmentType);
  const startDate = new Date(data.contractStartDate);
  const now = new Date();
  const contract = await prisma.employmentContract.update({
    where: { technicianId: session.technicianId },
    data: {
      employmentType: loaded.employmentType,
      contractStartDate: startDate,
      contractEndDate: loaded.employmentType === 'DAILY' ? startDate : null,
      workLocation: data.workLocation,
      jobDescription: data.jobDescription,
      workerAddress: data.workerAddress,
      workerSignatureName: data.workerSignatureName,
      workerSignatureDataUrl: data.workerSignatureDataUrl,
      ...d,
      status: 'CONFIRMED',
      signedAt: now,
      submittedAt: now,
      confirmedAt: now,
    },
  });
  return NextResponse.json({ contract: serialize(contract) });
}
