export type AdminCode = string;
export type CrosswalkMap = Record<AdminCode, string>;

/** Data loading belongs to slice ③; this module only defines the conversion contract. */
export function validateCrosswalkCoverage(
  map: CrosswalkMap,
  regionKeys: readonly string[],
): { missing: string[] } {
  return { missing: regionKeys.filter((regionKey) => !Object.values(map).includes(regionKey)) };
}

/** Returns null when an administrative code has no mapped region key. */
export function mapAdminCodeToRegionKey(map: CrosswalkMap, code: AdminCode): string | null {
  return map[code] ?? null;
}
