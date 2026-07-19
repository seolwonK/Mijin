// 서버 전용 모듈 — node:fs 의존이므로 클라이언트 번들에서 import하면 빌드가 실패한다(의도된 경계).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GeoProvider } from '@/lib/requestRegionResolver';
import { REGIONS } from '@/lib/regions';

type Position = [number, number];
type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] };
type Properties = { regionKey?: string; sido?: string; name?: string; code?: string };
type Feature = { properties?: Properties; geometry?: Geometry | null };
type FeatureCollection = { type?: string; features?: Feature[] };
type ManifestEntry = { file?: string; sha256?: string; featureCount?: number };
type Manifest = {
  schemaVersion?: number;
  version?: string;
  referenceDate?: string;
  license?: string;
  sourceUrl?: string;
  sido?: ManifestEntry;
  sigungu?: Record<string, ManifestEntry>;
};
type Boundary = { name: string; geometry: Geometry };
type SigunguBoundary = Boundary & { sigungu: string };

let cachedProvider: GeoProvider | undefined;
let failedAt = 0;
const FAILURE_TTL_MS = 5 * 60 * 1_000;

function pointInRing(lng: number, lat: number, ring: Position[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if ((y > lat) !== (previousY > lat) && lng < ((previousX - x) * (lat - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: Position[][]) {
  return pointInRing(lng, lat, polygon[0] ?? []) && !polygon.slice(1).some((ring) => pointInRing(lng, lat, ring));
}

function contains(geometry: Geometry, lng: number, lat: number) {
  return geometry.type === 'Polygon'
    ? pointInPolygon(lng, lat, geometry.coordinates as Position[][])
    : (geometry.coordinates as Position[][][]).some((polygon) => pointInPolygon(lng, lat, polygon));
}

function readJson(filename: string) {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'geo', filename), 'utf8')) as unknown;
}

function validateEntry(entry: ManifestEntry | undefined): asserts entry is Required<ManifestEntry> {
  if (!entry || typeof entry.file !== 'string' || typeof entry.sha256 !== 'string' || typeof entry.featureCount !== 'number' || !Number.isInteger(entry.featureCount) || entry.featureCount < 1) {
    throw new Error('manifest boundary entry invalid');
  }
}

function validGeometry(geometry: Geometry | null | undefined): geometry is Geometry {
  const polygons = geometry?.type === 'Polygon'
    ? [geometry.coordinates as Position[][]]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates as Position[][][]
      : [];
  return polygons.length > 0 && polygons.every((polygon) => polygon.length > 0 && polygon.every((ring) => ring.length >= 4));
}

function loadCollection(entry: Required<ManifestEntry>) {
  const raw = readFileSync(path.join(process.cwd(), 'public', 'geo', entry.file), 'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== entry.sha256) throw new Error(`boundary checksum mismatch: ${entry.file}`);
  const collection = JSON.parse(raw) as FeatureCollection;
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length !== entry.featureCount || collection.features.length === 0) {
    throw new Error(`boundary collection invalid: ${entry.file}`);
  }
  // 공통 필수: regionKey/name/code/geometry. `sido`는 시군구 파티션 전용 속성 — loadSigungu에서 별도 검증한다.
  if (collection.features.some((feature) => !feature.properties?.regionKey || !feature.properties.name || !feature.properties.code || !validGeometry(feature.geometry))) {
    throw new Error(`boundary feature invalid: ${entry.file}`);
  }
  return collection.features;
}

function loadManifest() {
  const manifest = readJson('manifest.json') as Manifest;
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.version !== 'string' ||
    typeof manifest.referenceDate !== 'string' ||
    typeof manifest.license !== 'string' ||
    typeof manifest.sourceUrl !== 'string' ||
    !manifest.sigungu
  ) throw new Error('manifest schema invalid');
  validateEntry(manifest.sido);
  for (const [sido, sigungu] of Object.entries(REGIONS)) if (sigungu.length > 0) validateEntry(manifest.sigungu[sido]);
  return manifest as Manifest & { sido: Required<ManifestEntry>; sigungu: Record<string, Required<ManifestEntry>> };
}

function boundaries(features: Feature[], property: 'sido' | 'name'): Boundary[] {
  return features.map((feature) => ({ name: feature.properties![property]!, geometry: feature.geometry! }));
}

function loadSigungu(manifest: ReturnType<typeof loadManifest>, sido: string): SigunguBoundary[] {
  const features = loadCollection(manifest.sigungu[sido]);
  if (features.length !== (REGIONS[sido] ?? []).length || features.some((feature) => feature.properties!.sido !== sido)) {
    throw new Error(`sigungu boundaries invalid: ${sido}`);
  }
  return features.map((feature) => ({ name: sido, sigungu: feature.properties!.name!, geometry: feature.geometry! }));
}

/**
 * Boundary-ring points are inherently unstable under ray casting; adjacent-region attribution is allowed.
 * Published boundaries are read through the manifest so a release is always a consistent snapshot.
 */
export function loadGeoProvider(): GeoProvider | undefined {
  if (cachedProvider) return cachedProvider;
  if (failedAt && Date.now() - failedAt < FAILURE_TTL_MS) return undefined;
  try {
    const manifest = loadManifest();
    const sidoFeatures = loadCollection(manifest.sido);
    if (sidoFeatures.length !== 17) throw new Error('sido boundary count invalid');
    const sido = boundaries(sidoFeatures, 'name');
    const sigunguCache = new Map<string, SigunguBoundary[]>();
    // 파티션 실패는 영구 캐시하지 않는다 — TTL 후 재시도(일시 장애가 프로세스 수명 동안 드릴다운을 죽이지 않게).
    const sigunguFailedAt = new Map<string, number>();
    const sidoAt = (lat: number, lng: number) => sido.find((boundary) => contains(boundary.geometry, lng, lat))?.name ?? null;
    cachedProvider = {
      sidoAt,
      sigunguAt(lat, lng) {
        const matchedSido = sidoAt(lat, lng);
        if (!matchedSido || !manifest.sigungu[matchedSido]) return null;
        let sigungu = sigunguCache.get(matchedSido);
        if (sigungu === undefined) {
          const lastFailure = sigunguFailedAt.get(matchedSido);
          if (lastFailure !== undefined && Date.now() - lastFailure < FAILURE_TTL_MS) return null;
          try {
            sigungu = loadSigungu(manifest, matchedSido);
            sigunguCache.set(matchedSido, sigungu);
            sigunguFailedAt.delete(matchedSido);
          } catch (error) {
            console.error('Failed to load sigungu boundary file.', error);
            sigunguFailedAt.set(matchedSido, Date.now());
            return null;
          }
        }
        const boundary = sigungu?.find((entry) => contains(entry.geometry, lng, lat));
        return boundary ? { sido: boundary.name, sigungu: boundary.sigungu } : null;
      },
    };
    failedAt = 0;
    return cachedProvider;
  } catch (error) {
    console.error('Failed to load administrative boundary manifest.', error);
    failedAt = Date.now();
    return undefined;
  }
}
