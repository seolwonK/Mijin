import type { AssignedBy } from '@prisma/client';
import { prisma } from '@/lib/db';

// 접수가 RECEIVED일 때만 배정 성공 (CAS). 자동배정 워커 vs 관리자,
// 관리자 vs 관리자 간 중복 배정을 DB 수준에서 차단한다.
export async function claimAndAssign(params: {
  requestId: string;
  providerId: string;
  assignedBy: AssignedBy;
  distanceKm?: number | null;
}): Promise<boolean> {
  const claimed = await prisma.serviceRequest.updateMany({
    where: { id: params.requestId, status: 'RECEIVED' },
    data: { status: 'ASSIGNED', needsAttention: false },
  });
  if (claimed.count === 0) return false;
  await createAssignment(params);
  return true;
}

// 접수 상태 전이 없이 Assignment만 생성.
// claimAndAssign과, 거절 직후 재배정(접수가 이미 ASSIGNED 유지)에서 공용.
// 업체는 포털 폴링으로 신규 배정을 확인한다 (문자는 접수 완료 시 고객에게만 발송하는 정책).
export async function createAssignment(params: {
  requestId: string;
  providerId: string;
  assignedBy: AssignedBy;
  distanceKm?: number | null;
}): Promise<void> {
  await prisma.assignment.create({
    data: {
      requestId: params.requestId,
      providerId: params.providerId,
      assignedBy: params.assignedBy,
      distanceKm: params.distanceKm ?? null,
    },
  });
}
