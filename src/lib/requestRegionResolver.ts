import { isValidRegionKey, regionFromAddress } from './regions';

export type ResolvedRegion =
  | { kind: 'region'; sido: string; sigungu: string }
  | { kind: 'sidoOnly'; sido: string }
  | { kind: 'unknown'; reason: string };

export interface GeoProvider {
  sigunguAt?(lat: number, lng: number): { sido: string; sigungu: string } | null;
  sidoAt?(lat: number, lng: number): string | null;
}

function fromAddress(address: string | null): ResolvedRegion | null {
  if (!address?.trim()) return null;
  // 시/도 축약형 정규화는 regions.ts 의 regionFromAddress 안으로 옮겼다.
  // 여기 사본이 있던 동안 배차 경로(autoAssign·matching)는 정규화를 거치지
  // 않아 축약 주소를 판별하지 못했다 — 그래서 호출부가 아니라 판별 함수가
  // 정규화를 책임진다.
  const region = regionFromAddress(address);
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
