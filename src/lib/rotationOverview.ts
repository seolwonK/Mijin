import { coversRegion, REGIONS } from '@/lib/regions';

type RotationSubject = { key: string; kind: 'PROVIDER' | 'TECHNICIAN'; regions: string[]; eggBalance: number };

/** A province count is a union of its districts, never the sum of district counts. */
export function rotationOverview(candidates: readonly RotationSubject[]) {
  const unique = [...new Map(candidates.map(candidate => [candidate.key, candidate])).values()];
  const regions = Object.entries(REGIONS).map(([sido, sigungus]) => {
    const districts = (sigungus.length ? sigungus : ['']).map(sigungu => ({
      sigungu,
      count: unique.filter(candidate => coversRegion(candidate.regions, { sido, sigungu })).length,
    }));
    const count = unique.filter(candidate => districts.some(district => coversRegion(candidate.regions, { sido, sigungu: district.sigungu }))).length;
    const recommendedSigungu = districts.reduce((best, district) => district.count > best.count ? district : best).sigungu;
    return { sido, count, districts, recommendedSigungu };
  });
  const recommended = regions.reduce((best, region) => region.count > best.count ? region : best);
  return {
    totals: {
      candidates: unique.length,
      providers: unique.filter(candidate => candidate.kind === 'PROVIDER').length,
      technicians: unique.filter(candidate => candidate.kind === 'TECHNICIAN').length,
      withEggs: unique.filter(candidate => candidate.eggBalance > 0).length,
    },
    regions,
    recommended: { sido: recommended.sido, sigungu: recommended.recommendedSigungu },
  };
}

export type RotationOverview = ReturnType<typeof rotationOverview>;
