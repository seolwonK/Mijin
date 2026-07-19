import { isValidRegionKey, regionFromAddress } from './regions';

export type ResolvedRegion =
  | { kind: 'region'; sido: string; sigungu: string }
  | { kind: 'sidoOnly'; sido: string }
  | { kind: 'unknown'; reason: string };

export interface GeoProvider {
  sigunguAt?(lat: number, lng: number): { sido: string; sigungu: string } | null;
  sidoAt?(lat: number, lng: number): string | null;
}

const SIDO_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['서울시', '서울특별시'],
  ['서울', '서울특별시'],
  ['부산시', '부산광역시'],
  ['부산', '부산광역시'],
  ['대구시', '대구광역시'],
  ['대구', '대구광역시'],
  ['인천시', '인천광역시'],
  ['인천', '인천광역시'],
  ['대전시', '대전광역시'],
  ['대전', '대전광역시'],
  ['울산시', '울산광역시'],
  ['울산', '울산광역시'],
  ['세종시', '세종특별자치시'],
  ['세종', '세종특별자치시'],
  ['경기도', '경기도'],
  ['경기', '경기도'],
  ['강원도', '강원특별자치도'],
  ['강원', '강원특별자치도'],
  ['충청북도', '충청북도'],
  ['충북', '충청북도'],
  ['충청남도', '충청남도'],
  ['충남', '충청남도'],
  ['전북특별자치도', '전북특별자치도'],
  ['전라북도', '전북특별자치도'],
  ['전북', '전북특별자치도'],
  ['전라남도', '전라남도'],
  ['전남', '전라남도'],
  ['경상북도', '경상북도'],
  ['경북', '경상북도'],
  ['경상남도', '경상남도'],
  ['경남', '경상남도'],
  ['제주도', '제주특별자치도'],
  ['제주', '제주특별자치도'],
];

function normalizeAddress(address: string): string {
  const normalized = address.trim().replace(/\s+/g, ' ');
  for (const [alias, sido] of SIDO_ALIASES) {
    if (new RegExp(`^${alias}(?=\\s|$)`).test(normalized)) {
      return normalized.replace(new RegExp(`^${alias}(?=\\s|$)`), sido);
    }
  }

  // "광주" alone is ambiguous with 경기도 광주시. Treat it as the metropolitan city
  // only when its formal name is present or the following token is a district (구).
  if (/^광주(?=\s|$)/.test(normalized)) {
    const [, following = ''] = normalized.split(' ', 2);
    if (following.endsWith('구')) return normalized.replace(/^광주(?=\s|$)/, '광주광역시');
  }

  return normalized;
}

function fromAddress(address: string | null): ResolvedRegion | null {
  if (!address?.trim()) return null;
  const region = regionFromAddress(normalizeAddress(address));
  if (!region) return null;
  return region.sigungu
    ? { kind: 'region', ...region }
    : { kind: 'sidoOnly', sido: region.sido };
}


/** Resolves free-text request addresses; the optional geometry provider is added in slice three. */
export function resolveRequestRegion(
  input: { address: string | null; lat: number | null; lng: number | null },
  geo?: GeoProvider,
): ResolvedRegion {
  const addressRegion = fromAddress(input.address);
  if (addressRegion) return addressRegion;

  if (
    input.lat === null ||
    input.lng === null ||
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng)
  ) {
    return { kind: 'unknown', reason: '주소와 좌표를 판별할 수 없습니다' };
  }
  if (!geo) return { kind: 'unknown', reason: '경계 데이터 미탑재' };

  const sigungu = geo.sigunguAt?.(input.lat, input.lng);
  if (sigungu?.sigungu && isValidRegionKey(`${sigungu.sido} ${sigungu.sigungu}`)) {
    return { kind: 'region', sido: sigungu.sido, sigungu: sigungu.sigungu };
  }
  if (sigungu && isValidRegionKey(sigungu.sido)) {
    return { kind: 'sidoOnly', sido: sigungu.sido };
  }

  const sido = geo.sidoAt?.(input.lat, input.lng);
  if (sido && isValidRegionKey(sido)) return { kind: 'sidoOnly', sido };

  return { kind: 'unknown', reason: '주소와 좌표에서 지역을 판별할 수 없습니다' };
}
