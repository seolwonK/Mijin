'use client';

import { useEffect, useRef, useState } from 'react';

type PressureState = 'NORMAL' | 'CRITICAL_ALERT' | 'INACTIVE' | 'ZERO';
type Region = { key: string; name: string; hasSigungu: boolean; supply: number; demand: number; pressure: number | null; state: PressureState };
type Pin = { requestId: string; lookupCode: string; lat: number; lng: number; address: string | null };
type Feature = { type: 'Feature'; properties: { regionKey: string; sido: string; name: string; code: string }; geometry: unknown };
type Collection = { type: 'FeatureCollection'; features: Feature[] };
type RenderedFeature = Feature & { path: string };
type ManifestEntry = { file: string; sha256: string; featureCount: number };
type GeoManifest = {
  schemaVersion: 1;
  version: string;
  referenceDate: string;
  license: string;
  sourceUrl: string;
  sido: ManifestEntry;
  sigungu: Record<string, ManifestEntry>;
};

export type GeoLoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; manifest: Pick<GeoManifest, 'referenceDate' | 'license' | 'sourceUrl'> }
  | { kind: 'unavailable' }
  | { kind: 'corrupt'; reason: string };

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function manifestEntry(manifest: GeoManifest, level: 'sido' | 'sigungu', sido: string | null) {
  return level === 'sido' ? manifest.sido : (sido ? manifest.sigungu[sido] : undefined);
}

function validateManifest(value: unknown): GeoManifest {
  const manifest = value as Partial<GeoManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.version !== 'string' ||
    typeof manifest.referenceDate !== 'string' ||
    typeof manifest.license !== 'string' ||
    typeof manifest.sourceUrl !== 'string' ||
    !manifest.sido ||
    !manifest.sigungu
  ) throw new Error('manifest schema invalid');
  return manifest as GeoManifest;
}

function validateCollection(value: unknown, entry: ManifestEntry, level: 'sido' | 'sigungu'): Collection {
  const collection = value as Partial<Collection>;
  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    collection.features.length === 0 ||
    collection.features.length !== entry.featureCount ||
    // `sido` 속성은 시군구 파티션 전용 — 시도 파일에는 없다(게시 계약 v2).
    collection.features.some((feature) => !feature?.properties?.regionKey || !feature.properties.name || !feature.properties.code || (level === 'sigungu' && !feature.properties.sido))
  ) throw new Error('boundary schema invalid');
  return collection as Collection;
}

// 동일 경계 파일 재요청 방지(React StrictMode 이중 이펙트·레벨 왕복) — 파일은 versioned 불변이므로 안전.
const boundaryTextCache = new Map<string, Promise<string>>();
function fetchBoundaryText(file: string): Promise<string> {
  const existing = boundaryTextCache.get(file);
  if (existing) return existing;
  const loading = fetch(`/geo/${file}`).then(async (response) => {
    if (!response.ok) throw new Error(`boundary request failed (${response.status})`);
    return response.text();
  });
  // 실패는 캐시하지 않는다 — 다음 시도에서 재요청.
  loading.catch(() => boundaryTextCache.delete(file));
  boundaryTextCache.set(file, loading);
  return loading;
}

export default function MapChoropleth({
  level,
  sido,
  regions,
  pins,
  onSelectSido,
  onLoadStateChange,
}: {
  level: 'sido' | 'sigungu';
  sido: string | null;
  regions: Region[];
  pins: Pin[];
  onSelectSido: (sido: string) => void;
  onLoadStateChange: (state: GeoLoadState) => void;
}) {
  const [features, setFeatures] = useState<RenderedFeature[]>([]);
  const [pinPoints, setPinPoints] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [hovered, setHovered] = useState<Region | null>(null);
  const [loadState, setLoadState] = useState<GeoLoadState>({ kind: 'loading' });
  const projectionRef = useRef<((point: [number, number]) => [number, number] | null) | null>(null);

  useEffect(() => {
    // 레벨/시도 전환 = 이전 대상 hover 잔상 제거.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHovered(null);
  }, [level, sido]);

  useEffect(() => {
    let cancelled = false;
    const setState = (state: GeoLoadState) => {
      if (!cancelled) {
        setLoadState(state);
        onLoadStateChange(state);
      }
    };
    setState({ kind: 'loading' });
    Promise.all([
      fetch('/geo/manifest.json').then(async (response) => {
        if (response.status === 404) throw new Error('manifest unavailable');
        if (!response.ok) throw new Error(`manifest request failed (${response.status})`);
        return validateManifest(await response.json());
      }),
      import('d3-geo'),
    ])
      .then(async ([manifest, d3]) => {
        const entry = manifestEntry(manifest, level, sido);
        if (!entry || !entry.file || !entry.sha256 || !Number.isInteger(entry.featureCount)) throw new Error('manifest boundary entry invalid');
        const raw = await fetchBoundaryText(entry.file);
        if (await sha256(raw) !== entry.sha256) throw new Error('boundary checksum mismatch');
        const collection = validateCollection(JSON.parse(raw), entry, level);
        if (cancelled) return;
        const projection = d3.geoMercator().fitSize([900, 600], collection as never);
        const path = d3.geoPath(projection);
        projectionRef.current = projection;
        setFeatures(collection.features.map((feature) => ({ ...feature, path: path(feature as never) ?? '' })));
        setState({ kind: 'ready', manifest });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const unavailable = error instanceof Error && error.message === 'manifest unavailable';
        if (!unavailable) console.error('Failed to load administrative boundaries.', error);
        projectionRef.current = null;
        setFeatures([]);
        setPinPoints([]);
        setState(unavailable ? { kind: 'unavailable' } : { kind: 'corrupt', reason: error instanceof Error ? error.message : 'unknown boundary error' });
      });
    return () => { cancelled = true; };
  }, [level, onLoadStateChange, sido]);

  useEffect(() => {
    const projection = projectionRef.current;
    if (!projection) return;
    setPinPoints(pins.flatMap((pin) => {
      const point = projection([pin.lng, pin.lat]);
      return point && point[0] >= 0 && point[0] <= 900 && point[1] >= 0 && point[1] <= 600
        ? [{ id: pin.requestId, x: point[0], y: point[1] }]
        : [];
    }));
  }, [features, pins]);

  const regionsByKey = new Map(regions.map((region) => [region.key, region]));
  const fill = (region?: Region) => {
    if (!region || region.state === 'INACTIVE') return 'var(--color-neutral-200)';
    if (region.state === 'ZERO') return 'var(--color-neutral-100)';
    if (region.state === 'CRITICAL_ALERT') return 'var(--color-amber-600)';
    if ((region.pressure ?? 0) >= 3) return 'var(--color-brand-700)';
    if ((region.pressure ?? 0) >= 1) return 'var(--color-brand-500)';
    return 'var(--color-brand-300)';
  };

  if (loadState.kind === 'loading' || loadState.kind === 'unavailable') return null;
  if (loadState.kind === 'corrupt') {
    return <section className="rounded-admin-md border border-amber-300 bg-amber-50 p-5 text-sm" role="alert">경계 데이터를 불러오지 못했습니다 — {loadState.reason}</section>;
  }
  if (features.length === 0) return null;

  return (
    <section className="rounded-admin-md border border-border bg-white p-5" aria-label="지역 수급 지도">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div><h2 className="text-base font-bold">지역 수급 지도</h2><p className="mt-1 text-sm text-muted">차량 추적 아님 — 고객 목적지 기준</p></div>
        {level === 'sigungu' && <button type="button" onClick={() => onSelectSido('')} className="text-sm font-semibold text-brand-600 underline">시도 보기</button>}
      </div>
      <div className="relative">
        <svg viewBox="0 0 900 600" className="h-auto w-full" role="img" aria-label={level === 'sido' ? '시도별 수급 압력 지도' : `${sido} 시군구별 수급 압력 지도`}>
          {features.map((feature) => {
            const key = feature.properties.regionKey;
            const region = regionsByKey.get(key);
            const selectable = level === 'sido' && region?.hasSigungu;
            return <path key={key} d={feature.path} fill={fill(region)} stroke="var(--color-neutral-50)" strokeWidth="1" tabIndex={selectable ? 0 : -1} aria-label={`${feature.properties.name}: 공급 ${region?.supply ?? 0}명, 수요 ${region?.demand ?? 0}건`} onMouseEnter={() => setHovered(region ?? null)} onMouseLeave={() => setHovered(null)} onClick={() => selectable && onSelectSido(feature.properties.name)} onKeyDown={(event) => { if (selectable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectSido(feature.properties.name); } }} className={selectable ? 'cursor-pointer focus:outline-none' : undefined} />;
          })}
          {pinPoints.map((pin) => <circle key={pin.id} cx={pin.x} cy={pin.y} r="5" fill="var(--color-brand-800)" stroke="white" strokeWidth="2"><title>출동 고객 목적지</title></circle>)}
        </svg>
        {hovered && <div className="pointer-events-none absolute left-3 top-3 rounded-admin-sm border border-border bg-white px-3 py-2 text-sm shadow-card"><p className="font-semibold">{hovered.name}</p><p>공급 {hovered.supply}명 · 수요 {hovered.demand}건 · 압력 {hovered.pressure?.toFixed(2) ?? '—'}</p></div>}
      </div>
      <p className="mt-3 text-xs text-muted">{loadState.manifest.license} · 기준일 {loadState.manifest.referenceDate} · {loadState.manifest.sourceUrl}</p>
    </section>
  );
}