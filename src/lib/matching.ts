import { prisma } from '@/lib/db';
import { haversineKm } from '@/lib/geo/distance';
import type { AssigneeKind } from '@/lib/assignee';
import { assigneeKey } from '@/lib/assignee';

export type Candidate = {
  kind: AssigneeKind; // 업체(PROVIDER) / 개인기술자(TECHNICIAN)
  id: string; // provider.id 또는 technician.id
  name: string;
  phone: string;
  address: string;
  isActive: boolean;
  distanceKm: number | null;
  rejectedThisRequest: boolean;
};

// 승인(APPROVED)된 활성 업체·기술자를 거리순으로 정렬해 반환.
// 이 접수를 거절한 대상과 좌표 미등록 대상은 후순위로 민다.
export async function getCandidates(request: {
  id: string;
  lat: number | null;
  lng: number | null;
}): Promise<Candidate[]> {
  const [providers, technicians, rejectedRows] = await Promise.all([
    prisma.provider.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      include: { user: { select: { name: true, phone: true } } },
    }),
    prisma.technician.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      include: { user: { select: { name: true, phone: true } } },
    }),
    prisma.assignment.findMany({
      where: { requestId: request.id, status: 'REJECTED' },
      select: { providerId: true, technicianId: true },
    }),
  ]);

  const rejected = new Set<string>();
  for (const r of rejectedRows) {
    const key = assigneeKey(r);
    if (key) rejected.add(key);
  }

  const distanceTo = (lat: number | null, lng: number | null): number | null =>
    request.lat != null && request.lng != null && lat != null && lng != null
      ? haversineKm(request.lat, request.lng, lat, lng)
      : null;

  const candidates: Candidate[] = [
    ...providers.map((p) => ({
      kind: 'PROVIDER' as const,
      id: p.id,
      name: p.user.name,
      phone: p.user.phone,
      address: p.address,
      isActive: p.isActive,
      distanceKm: distanceTo(p.lat, p.lng),
      rejectedThisRequest: rejected.has(`PROVIDER:${p.id}`),
    })),
    ...technicians.map((t) => ({
      kind: 'TECHNICIAN' as const,
      id: t.id,
      name: t.user.name,
      phone: t.user.phone,
      address: t.address,
      isActive: t.isActive,
      distanceKm: distanceTo(t.lat, t.lng),
      rejectedThisRequest: rejected.has(`TECHNICIAN:${t.id}`),
    })),
  ];

  candidates.sort((a, b) => {
    if (a.rejectedThisRequest !== b.rejectedThisRequest)
      return a.rejectedThisRequest ? 1 : -1;
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
  return candidates;
}
