import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { kstRangeUtc } from '@/lib/kst';
import { regionKey, REGIONS } from '@/lib/regions';
import { resolveRequestRegion } from '@/lib/requestRegionResolver';
import type { GeoProvider } from '@/lib/requestRegionResolver';
import { aggregateSupplyDemand } from '@/lib/supplyDemand';
import { loadGeoProvider } from '@/lib/geoProvider';

const SOURCE_LABEL = '경계 시각화: VWorld 스냅샷 확보 후 제공 예정';

type SupplyRow = {
  id: string;
  regions: string[];
  isActive: boolean;
  approvalStatus: string | null;
};

type RequestRegionRow = {
  address: string | null;
  lat: number | null;
  lng: number | null;
};

type DispatchRow = {
  id: string;
  lookupCode: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
};

export type MapOverviewPrisma = {
  provider: Pick<PrismaClient['provider'], 'findMany'>;
  technician: Pick<PrismaClient['technician'], 'findMany'>;
  serviceRequest: Pick<PrismaClient['serviceRequest'], 'findMany' | 'count'>;
};
export type MapOverviewOptions = {
  geoProvider?: GeoProvider;
  loadGeoProvider?: () => GeoProvider | undefined;
};

export type RegionOverview = {
  level: 'sido' | 'sigungu';
  sido: string | null;
  regions: Array<{
    key: string;
    name: string;
    hasSigungu: boolean;
    supply: number;
    demand: number;
    pressure: number | null;
    state: 'NORMAL' | 'CRITICAL_ALERT' | 'INACTIVE' | 'ZERO';
  }>;
  gapAlerts: Array<{ key: string; name: string; demand: number }>;
  unknownLocation: { count: number; reasons: Record<string, number> };
  sigunguUnknown: number;
  sourceLabel: string;
  asOf: string;
};

export async function getRegionOverview(
  prisma: MapOverviewPrisma = defaultPrisma,
  sido?: string,
  options: MapOverviewOptions = {},
): Promise<RegionOverview> {
  const level = sido ? 'sigungu' : 'sido';
  const universe = sido
    ? (REGIONS[sido] ?? []).map((sigungu) => regionKey(sido, sigungu))
    : Object.keys(REGIONS);
  const range = kstRangeUtc('month');
  const [providers, technicians, requests] = await Promise.all([
    prisma.provider.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      select: { id: true, regions: true, isActive: true, approvalStatus: true },
    }),
    prisma.technician.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      select: { id: true, regions: true, isActive: true, approvalStatus: true },
    }),
    prisma.serviceRequest.findMany({
      where: { createdAt: range, status: { not: 'CANCELED' } },
      select: { address: true, lat: true, lng: true },
    }),
  ]) as [SupplyRow[], SupplyRow[], RequestRegionRow[]];

  const demands: Array<{ sido: string; sigungu?: string }> = [];
  const reasons: Record<string, number> = {};
  let sigunguUnknown = 0;
  const geo = options.geoProvider ?? options.loadGeoProvider?.() ?? loadGeoProvider();

  for (const request of requests) {
    const resolved = resolveRequestRegion(request, geo);
    if (resolved.kind === 'unknown') {
      reasons[resolved.reason] = (reasons[resolved.reason] ?? 0) + 1;
    } else if (resolved.kind === 'sidoOnly') {
      if (level === 'sido') demands.push({ sido: resolved.sido });
      else if (resolved.sido === sido) sigunguUnknown += 1;
    } else {
      demands.push(resolved);
    }
  }

  const rows = aggregateSupplyDemand(
    [
      ...providers.map((provider) => ({ ...provider, subjectKey: `PROVIDER:${provider.id}` })),
      ...technicians.map((technician) => ({ ...technician, subjectKey: `TECHNICIAN:${technician.id}` })),
    ],
    demands,
    universe,
    level,
  ).map((row) => ({
    key: row.key,
    name: level === 'sido' ? row.target.sido : row.target.sigungu,
    hasSigungu: (REGIONS[row.key]?.length ?? 0) > 0,
    supply: row.supply,
    demand: row.demand,
    pressure: row.pressure,
    state: row.state,
  }));

  return {
    level,
    sido: sido ?? null,
    regions: rows,
    gapAlerts: rows
      .filter((row) => row.state === 'CRITICAL_ALERT')
      .map(({ key, name, demand }) => ({ key, name, demand }))
      .sort((a, b) => b.demand - a.demand || a.key.localeCompare(b.key, 'ko')),
    unknownLocation: {
      count: Object.values(reasons).reduce((total, count) => total + count, 0),
      reasons,
    },
    sigunguUnknown,
    sourceLabel: SOURCE_LABEL,
    asOf: new Date().toISOString(),
  };
}

export async function getDispatchPins(
  prisma: MapOverviewPrisma = defaultPrisma,
): Promise<{
  pins: Array<{ requestId: string; lookupCode: string; lat: number; lng: number; address: string | null }>;
  unknownCount: number;
  asOf: string;
}> {
  const dispatched = { status: 'DISPATCHED' as const };
  const [requests, unknownCount] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { ...dispatched, lat: { not: null }, lng: { not: null } },
      select: { id: true, lookupCode: true, lat: true, lng: true, address: true },
    }),
    prisma.serviceRequest.count({
      where: { ...dispatched, OR: [{ lat: null }, { lng: null }] },
    }),
  ]) as [DispatchRow[], number];

  return {
    pins: requests.map((request) => ({
      requestId: request.id,
      lookupCode: request.lookupCode,
      lat: request.lat as number,
      lng: request.lng as number,
      address: request.address,
    })),
    unknownCount,
    asOf: new Date().toISOString(),
  };
}
