import type { AssignedBy } from '@prisma/client';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsProviderAssigned } from '@/lib/sms/templates';
import type { AssigneeTarget } from '@/lib/assignee';
import { assigneeFk } from '@/lib/assignee';

// 접수가 RECEIVED일 때만 배정 성공 (CAS). 자동배정 워커 vs 관리자,
// 관리자 vs 관리자 간 중복 배정을 DB 수준에서 차단한다.
export async function claimAndAssign(params: {
  requestId: string;
  target: AssigneeTarget;
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
// 수동·자동·재배정 모두 이 함수를 거치므로 배정 안내 문자도 여기서 발송한다.
// 배정 대상은 업체(provider) 또는 기술자(technician) 중 정확히 하나(DB CHECK로 보장).
export async function createAssignment(params: {
  requestId: string;
  target: AssigneeTarget;
  assignedBy: AssignedBy;
  distanceKm?: number | null;
}): Promise<void> {
  await prisma.assignment.create({
    data: {
      requestId: params.requestId,
      ...assigneeFk(params.target),
      assignedBy: params.assignedBy,
      distanceKm: params.distanceKm ?? null,
    },
  });

  // 배정 대상에 안내 문자 (고객 연락처·주소 포함).
  // 발송 실패해도 배정은 유지되며, 응답 지연을 막기 위해 대기하지 않는다.
  void notifyAssignee(params.requestId, params.target, params.distanceKm ?? null);
}

async function notifyAssignee(
  requestId: string,
  target: AssigneeTarget,
  distanceKm: number | null,
): Promise<void> {
  try {
    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
      select: {
        customerName: true,
        customerPhone: true,
        address: true,
        urgency: true,
      },
    });
    if (!request) return;

    const phone =
      target.kind === 'PROVIDER'
        ? (
            await prisma.provider.findUnique({
              where: { id: target.id },
              select: { user: { select: { phone: true } } },
            })
          )?.user.phone
        : (
            await prisma.technician.findUnique({
              where: { id: target.id },
              select: { user: { select: { phone: true } } },
            })
          )?.user.phone;
    if (!phone) return;

    await sendSms(phone, smsProviderAssigned({ ...request, distanceKm }), requestId);
  } catch (e) {
    console.error('[assignment] 배정 문자 발송 실패', e);
  }
}
