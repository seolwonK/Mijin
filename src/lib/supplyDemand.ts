import { parseRegionKey, regionKey } from './regions';

export type RegionTarget = { sido: string; sigungu?: string };
export type RegionLevel = 'sido' | 'sigungu';

export interface SupplySubject {
  subjectKey: string;
  regions: string[];
  isActive: boolean;
  approvalStatus: string | null;
}

export type DemandSubject = RegionTarget;

export interface SupplyDemandRow {
  key: string;
  target: { sido: string; sigungu: string };
  supply: number;
  demand: number;
  state: 'NORMAL' | 'CRITICAL_ALERT' | 'INACTIVE' | 'ZERO';
  pressure: number | null;
}

/**
 * Coverage for analytics denominators deliberately differs from coversRegion:
 * an empty list is not nationwide here, because it must not inflate supply.
 */
export function coversForDenominator(
  regions: string[],
  target: RegionTarget,
  level: RegionLevel,
): boolean {
  if (regions.length === 0) return false; // Do not reuse dispatch's empty = nationwide rule.

  if (level === 'sido') {
    return regions.some((key) => parseRegionKey(key).sido === target.sido);
  }

  return regions.some((key) => {
    const covered = parseRegionKey(key);
    return (
      covered.sido === target.sido &&
      (covered.sigungu === '' || covered.sigungu === (target.sigungu ?? ''))
    );
  });
}

export function classifyPressure(
  supply: number,
  demand: number,
): Pick<SupplyDemandRow, 'state' | 'pressure'> {
  if (supply > 0 && demand > 0) {
    return { state: 'NORMAL', pressure: demand / supply };
  }
  if (supply === 0 && demand > 0) return { state: 'CRITICAL_ALERT', pressure: null };
  if (supply === 0) return { state: 'INACTIVE', pressure: null };
  return { state: 'ZERO', pressure: 0 };
}

/**
 * Aggregates demand and supply over an authoritative region-key universe. Demand
 * and supply only overlay existing targets, so every supplied region is returned.
 */
export function aggregateSupplyDemand(
  subjects: SupplySubject[],
  demands: DemandSubject[],
  universe: readonly string[],
  level: RegionLevel,
): SupplyDemandRow[] {
  const targets = new Map<string, { sido: string; sigungu: string; demand: number }>();

  for (const universeKey of universe) {
    const { sido, sigungu: rawSigungu } = parseRegionKey(universeKey);
    const sigungu = level === 'sigungu' ? rawSigungu : '';
    if (level === 'sigungu' && !sigungu) continue;

    const key = regionKey(sido, sigungu);
    if (!targets.has(key)) targets.set(key, { sido, sigungu, demand: 0 });
  }

  for (const demand of demands) {
    const sigungu = level === 'sigungu' ? (demand.sigungu ?? '') : '';
    if (level === 'sigungu' && !sigungu) continue;

    const target = targets.get(regionKey(demand.sido, sigungu));
    if (target) target.demand += 1;
  }

  return [...targets.entries()].map(([key, target]) => {
    const matchedSubjects = new Set<string>();
    for (const subject of subjects) {
      if (
        subject.isActive &&
        subject.approvalStatus === 'APPROVED' &&
        coversForDenominator(subject.regions, target, level)
      ) {
        matchedSubjects.add(subject.subjectKey);
      }
    }
    const supply = matchedSubjects.size;
    return {
      key,
      target: { sido: target.sido, sigungu: target.sigungu },
      supply,
      demand: target.demand,
      ...classifyPressure(supply, target.demand),
    };
  });
}
