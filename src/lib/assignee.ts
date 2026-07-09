// 배정 대상(업체 Provider / 개인기술자 Technician)을 다형적으로 다루기 위한 공용 헬퍼.
// Assignment.provider / Assignment.technician 중 하나만 채워지므로, 조회·표시 코드가
// 두 관계를 매번 분기하지 않도록 여기로 모은다.

export type AssigneeKind = 'PROVIDER' | 'TECHNICIAN';

export type AssigneeTarget = { kind: AssigneeKind; id: string };

// Assignment 조회 시 provider·technician + 각 user 이름/전화를 함께 include.
// prisma.assignment.findMany/findUnique 의 include 에 그대로 펼쳐 쓴다.
export const ASSIGNEE_INCLUDE = {
  provider: { include: { user: { select: { name: true, phone: true } } } },
  technician: { include: { user: { select: { name: true, phone: true } } } },
} as const;

export type AssigneeInfo = {
  kind: AssigneeKind;
  id: string;
  name: string;
  phone: string;
};

type AssigneeRelations = {
  provider?: { id: string; user: { name: string; phone: string } } | null;
  technician?: { id: string; user: { name: string; phone: string } } | null;
};

// ASSIGNEE_INCLUDE 로 로드한 Assignment 에서 실제 배정 대상을 뽑아낸다.
export function resolveAssignee(a: AssigneeRelations): AssigneeInfo | null {
  if (a.provider) {
    return {
      kind: 'PROVIDER',
      id: a.provider.id,
      name: a.provider.user.name,
      phone: a.provider.user.phone,
    };
  }
  if (a.technician) {
    return {
      kind: 'TECHNICIAN',
      id: a.technician.id,
      name: a.technician.user.name,
      phone: a.technician.user.phone,
    };
  }
  return null;
}

// providerId/technicianId 컬럼만 있는 행(거절 이력 등)에서 대상 키를 만든다.
export function assigneeKey(row: {
  providerId?: string | null;
  technicianId?: string | null;
}): string | null {
  if (row.providerId) return `PROVIDER:${row.providerId}`;
  if (row.technicianId) return `TECHNICIAN:${row.technicianId}`;
  return null;
}

// Assignment.create 의 data 에 펼쳐 쓸 { providerId, technicianId } 조각.
export function assigneeFk(target: AssigneeTarget): {
  providerId: string | null;
  technicianId: string | null;
} {
  return {
    providerId: target.kind === 'PROVIDER' ? target.id : null,
    technicianId: target.kind === 'TECHNICIAN' ? target.id : null,
  };
}
