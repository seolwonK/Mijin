import { describe, expect, it, vi } from 'vitest';

import { getDispatchPins, getRegionOverview, type MapOverviewPrisma } from '../mapOverview';

function stubPrisma({
  providers = [],
  technicians = [],
  requests = [],
  unknownCount = 0,
}: {
  providers?: unknown[];
  technicians?: unknown[];
  requests?: unknown[];
  unknownCount?: number;
} = {}) {
  return {
    provider: { findMany: vi.fn().mockResolvedValue(providers) },
    technician: { findMany: vi.fn().mockResolvedValue(technicians) },
    serviceRequest: {
      findMany: vi.fn().mockResolvedValue(requests),
      count: vi.fn().mockResolvedValue(unknownCount),
    },
  } as unknown as MapOverviewPrisma;
}

describe('getRegionOverview', () => {
  it('returns all four supply-demand states and excludes canceled requests in the bounded query', async () => {
    const prisma = stubPrisma({
      providers: [
        { id: 'normal', regions: ['서울특별시 강남구'], isActive: true, approvalStatus: 'APPROVED' },
        { id: 'zero', regions: ['서울특별시 강서구'], isActive: true, approvalStatus: 'APPROVED' },
      ],
      requests: [
        { address: '서울특별시 강남구', lat: null, lng: null, status: 'RECEIVED', createdAt: new Date() },
        { address: '서울특별시 강동구', lat: null, lng: null, status: 'RECEIVED', createdAt: new Date() },
      ],
    });

    const result = await getRegionOverview(prisma);
    const states = Object.fromEntries(result.regions.map((row) => [row.key, row]));

    expect(states['서울특별시']).toMatchObject({ hasSigungu: true, supply: 2, demand: 2, state: 'NORMAL', pressure: 1 });
    expect(states['부산광역시']).toMatchObject({ hasSigungu: true, supply: 0, demand: 0, state: 'INACTIVE', pressure: null });
    expect(states['세종특별자치시']).toMatchObject({ hasSigungu: false });
    expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith({
      where: { createdAt: { gte: expect.any(Date), lt: expect.any(Date) }, status: { not: 'CANCELED' } },
      select: { address: true, lat: true, lng: true },
    });

    const sigungu = await getRegionOverview(prisma, '서울특별시');
    const sigunguStates = Object.fromEntries(sigungu.regions.map((row) => [row.key, row]));
    expect(sigunguStates['서울특별시 강남구']).toMatchObject({ state: 'NORMAL', pressure: 1 });
    expect(sigunguStates['서울특별시 강동구']).toMatchObject({ state: 'CRITICAL_ALERT', pressure: null });
    expect(sigunguStates['서울특별시 강북구']).toMatchObject({ state: 'INACTIVE', pressure: null });
    expect(sigunguStates['서울특별시 강서구']).toMatchObject({ state: 'ZERO', pressure: 0 });
  });

  it('keeps unresolved requests out of demand and separates sido-only drilldown demand', async () => {
    const prisma = stubPrisma({
      requests: [
        { address: '판별 불가', lat: null, lng: null, status: 'RECEIVED', createdAt: new Date() },
        { address: '서울특별시', lat: null, lng: null, status: 'RECEIVED', createdAt: new Date() },
      ],
    });

    const nationwide = await getRegionOverview(prisma);
    expect(nationwide.regions.find((row) => row.key === '서울특별시')).toMatchObject({ demand: 1 });
    expect(nationwide.unknownLocation).toEqual({
      count: 1,
      reasons: { '주소와 좌표를 판별할 수 없습니다': 1 },
    });

    const seoul = await getRegionOverview(prisma, '서울특별시');
    expect(seoul.regions.every((row) => row.demand === 0)).toBe(true);
    expect(seoul.sigunguUnknown).toBe(1);
  });

  it('sorts gap alerts by demand descending', async () => {
    const prisma = stubPrisma({
      requests: [
        { address: '서울특별시 강동구', lat: null, lng: null, status: 'RECEIVED', createdAt: new Date() },
        { address: '서울특별시 강북구', lat: null, lng: null, status: 'RECEIVED', createdAt: new Date() },
        { address: '서울특별시 강북구', lat: null, lng: null, status: 'RECEIVED', createdAt: new Date() },
      ],
    });

    const result = await getRegionOverview(prisma, '서울특별시');
    expect(result.gapAlerts.slice(0, 2)).toEqual([
      { key: '서울특별시 강북구', name: '강북구', demand: 2 },
      { key: '서울특별시 강동구', name: '강동구', demand: 1 },
    ]);
  });
  it('uses an injected geo provider for coordinate-only demand and preserves sido-only drilldown handling', async () => {
    const prisma = stubPrisma({
      requests: [
        { address: null, lat: 37.5, lng: 127.0 },
        { address: null, lat: 35.1, lng: 129.0 },
        { address: null, lat: 37.6, lng: 127.1 },
      ],
    });
    const geoProvider = {
      sigunguAt: (lat: number) => lat === 37.5 ? { sido: '서울특별시', sigungu: '강남구' } : null,
      sidoAt: (lat: number) => lat === 35.1 ? '부산광역시' : lat === 37.6 ? '서울특별시' : null,
    };

    const nationwide = await getRegionOverview(prisma, undefined, { geoProvider });
    expect(nationwide.regions.find((row) => row.key === '서울특별시')).toMatchObject({ demand: 2 });
    expect(nationwide.regions.find((row) => row.key === '부산광역시')).toMatchObject({ demand: 1 });

    const seoul = await getRegionOverview(prisma, '서울특별시', { geoProvider });
    expect(seoul.regions.find((row) => row.key === '서울특별시 강남구')).toMatchObject({ demand: 1 });
    expect(seoul.sigunguUnknown).toBe(1);
  });
});

describe('getDispatchPins', () => {
  it('returns only dispatched destination coordinates and counts missing coordinates', async () => {
    const prisma = stubPrisma({
      requests: [{ id: 'request-1', lookupCode: '123456', lat: 37.5, lng: 127.0, address: '서울특별시 강남구' }],
      unknownCount: 2,
    });

    await expect(getDispatchPins(prisma)).resolves.toMatchObject({
      pins: [{ requestId: 'request-1', lookupCode: '123456', lat: 37.5, lng: 127, address: '서울특별시 강남구' }],
      unknownCount: 2,
    });
    expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith({
      where: { status: 'DISPATCHED', lat: { not: null }, lng: { not: null } },
      select: { id: true, lookupCode: true, lat: true, lng: true, address: true },
    });
    expect(prisma.serviceRequest.count).toHaveBeenCalledWith({
      where: { status: 'DISPATCHED', OR: [{ lat: null }, { lng: null }] },
    });
  });
});
