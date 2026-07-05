import { prisma } from '@/lib/db';
import { haversineKm } from '@/lib/geo/distance';

export type Candidate = {
  providerId: string;
  name: string;
  phone: string;
  address: string;
  isActive: boolean;
  distanceKm: number | null;
  rejectedThisRequest: boolean;
};

// 승인(APPROVED)된 활성 업체를 거리순으로 정렬해 반환.
// 이 접수를 거절한 업체와 좌표 미등록 업체는 후순위로 민다.
export async function getCandidates(request: {
  id: string;
  lat: number | null;
  lng: number | null;
}): Promise<Candidate[]> {
  const providers = await prisma.provider.findMany({
    where: { isActive: true, approvalStatus: 'APPROVED' },
    include: { user: { select: { name: true, phone: true } } },
  });
  const rejectedRows = await prisma.assignment.findMany({
    where: { requestId: request.id, status: 'REJECTED' },
    select: { providerId: true },
  });
  const rejected = new Set(rejectedRows.map((a) => a.providerId));

  const candidates: Candidate[] = providers.map((p) => ({
    providerId: p.id,
    name: p.user.name,
    phone: p.user.phone,
    address: p.address,
    isActive: p.isActive,
    distanceKm:
      request.lat != null && request.lng != null && p.lat != null && p.lng != null
        ? haversineKm(request.lat, request.lng, p.lat, p.lng)
        : null,
    rejectedThisRequest: rejected.has(p.id),
  }));

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
