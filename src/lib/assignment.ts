import type { AssignedBy, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsProviderAssigned } from '@/lib/sms/templates';
import type { AssigneeTarget } from '@/lib/assignee';
import { assigneeFk } from '@/lib/assignee';

export class AssignmentTargetUnavailableError extends Error {
  constructor() { super('배정 대상의 활성·승인·계약 상태가 변경되었습니다'); }
}

// 접수가 RECEIVED일 때만 배정 성공 (CAS). 자동배정 워커 vs 관리자,
// 관리자 vs 관리자 간 중복 배정을 DB 수준에서 차단한다.
export async function claimAndAssign(params: {
  requestId: string;
  target: AssigneeTarget;
  assignedBy: AssignedBy;
  distanceKm?: number | null;
}): Promise<boolean> {
  const assigned = await prisma.$transaction(async (tx) => {
    const claimed = await tx.serviceRequest.updateMany({
      where: { id: params.requestId, status: 'RECEIVED' },
      data: { status: 'ASSIGNED', needsAttention: false },
    });
    if (claimed.count === 0) return false;
    // 후보 목록/관리자 화면 조회 이후 자격이 바뀔 수 있다. 커밋까지 공유 잠금을
    // 유지해 영업 중지·승인 철회·계약 변경과 배정의 선후관계를 확정한다.
    const eligible = params.target.kind === 'PROVIDER'
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Provider" WHERE id = ${params.target.id}
          AND "isActive" = true AND "approvalStatus" = 'APPROVED' FOR SHARE
        `
      : await tx.$queryRaw<{ id: string }[]>`
          SELECT t.id FROM "Technician" t
          JOIN "EmploymentContract" c ON c."technicianId" = t.id
          WHERE t.id = ${params.target.id} AND t."isActive" = true
          AND t."approvalStatus" = 'APPROVED' AND c.status = 'CONFIRMED'
          FOR SHARE OF t, c
        `;
    if (eligible.length === 0) throw new AssignmentTargetUnavailableError();
    await tx.assignment.create({
      data: {
        requestId: params.requestId,
        ...assigneeFk(params.target),
        assignedBy: params.assignedBy,
        distanceKm: params.distanceKm ?? null,
      },
    });
    return true;
  });
  if (!assigned) return false;
  // 커밋된 배정만 통지한다. INSERT 실패 시 접수 상태도 함께 롤백된다.
  void notifyAssignee(params.requestId, params.target, params.distanceKm ?? null);
  return true;
}

// 수락·거절·자동 회수·수동 회수는 접수와 배정을 함께 갱신한다.
// 모든 경로가 접수 → 배정 순서로 잠가 취소/배정과의 교착 및 반쪽 저장을 방지한다.
// 후보 조회·문자 발송은 트랜잭션 밖에서 수행한다.
export async function transitionPendingAssignment(params: {
  assignmentId: string;
  requestId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELED';
  rejectReason?: string | null;
  needsAttention?: boolean;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ServiceRequest"
      WHERE id = ${params.requestId} AND status = 'ASSIGNED'
      FOR UPDATE
    `;
    if (locked.length === 0) return false;
    const claimed = await tx.assignment.updateMany({
      where: { id: params.assignmentId, requestId: params.requestId, status: 'REQUESTED' },
      data: { status: params.status, respondedAt: new Date(),
        ...(params.rejectReason !== undefined ? { rejectReason: params.rejectReason } : {}),
      },
    });
    if (claimed.count === 0) return false;
    const data: Prisma.ServiceRequestUpdateManyMutationInput = params.status === 'ACCEPTED'
      ? { status: 'ACCEPTED' }
      : { status: 'RECEIVED', assignBaseAt: new Date() };
    if (params.needsAttention !== undefined) data.needsAttention = params.needsAttention;
    await tx.serviceRequest.update({ where: { id: params.requestId }, data });
    return true;
  });
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
