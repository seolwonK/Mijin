import { prisma } from '@/lib/db';
import { haversineKm } from '@/lib/geo/distance';
import { coversRegion, regionFromAddress } from '@/lib/regions';
import type { AssigneeKind } from '@/lib/assignee';
import { assigneeKey } from '@/lib/assignee';

export type Candidate = {
  kind: AssigneeKind; // 업체(PROVIDER) / 개인기술자(TECHNICIAN)
  id: string; // provider.id 또는 technician.id
  name: string;
  phone: string;
  address: string;
  regions: string[]; // 서비스 가능 지역 (빈 배열 = 전 지역)
  isActive: boolean;
  distanceKm: number | null;
  coversRegion: boolean; // 이 접수의 지역을 담당하는지 (담당 안 하면 후순위)
  rejectedThisRequest: boolean;
};

// 승인(APPROVED)된 활성 업체·기술자를 거리순으로 정렬해 반환.
// 요청 지역을 담당하지 않는 대상, 이 접수를 거절한 대상, 좌표 미등록 대상은 후순위로 민다.
export async function getCandidates(request: {
  id: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}): Promise<Candidate[]> {
  const reqRegion = regionFromAddress(request.address);
  const [providers, technicians, rejectedRows] = await Promise.all([
    prisma.provider.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      include: { user: { select: { name: true, phone: true } } },
    }),
    // 기술자는 근로계약서 서명 완료(CONFIRMED) 후에만 배정 대상이 된다
    prisma.technician.findMany({
      where: {
        isActive: true,
        approvalStatus: 'APPROVED',
        contract: { status: 'CONFIRMED' },
      },
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
      regions: p.regions,
      isActive: p.isActive,
      distanceKm: distanceTo(p.lat, p.lng),
      coversRegion: coversRegion(p.regions, reqRegion),
      rejectedThisRequest: rejected.has(`PROVIDER:${p.id}`),
    })),
    ...technicians.map((t) => ({
      kind: 'TECHNICIAN' as const,
      id: t.id,
      name: t.user.name,
      phone: t.user.phone,
      address: t.address,
      regions: t.regions,
      isActive: t.isActive,
      distanceKm: distanceTo(t.lat, t.lng),
      coversRegion: coversRegion(t.regions, reqRegion),
      rejectedThisRequest: rejected.has(`TECHNICIAN:${t.id}`),
    })),
  ];

  candidates.sort((a, b) => {
    // 1) 이 접수를 거절한 대상은 맨 뒤
    if (a.rejectedThisRequest !== b.rejectedThisRequest)
      return a.rejectedThisRequest ? 1 : -1;
    // 2) 담당 지역이 아닌 대상은 뒤로
    if (a.coversRegion !== b.coversRegion) return a.coversRegion ? -1 : 1;
    // 3) 그 안에서 가까운 순 (좌표 없는 대상은 뒤)
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
  return candidates;
}
