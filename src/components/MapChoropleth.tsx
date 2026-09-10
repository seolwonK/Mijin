'use client';

import { useEffect, useState } from 'react';
import styles from '@/components/analytics-board.module.css';

type PressureState = 'NORMAL' | 'CRITICAL_ALERT' | 'INACTIVE' | 'ZERO';
type Region = {
  key: string;
  name: string;
  hasSigungu: boolean;
  supply: number;
  demand: number;
  pressure: number | null;
  state: PressureState;
};
type Feature = {
  type: 'Feature';
  properties: { regionKey: string; sido: string; name: string; code: string };
  geometry: unknown;
};
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
  | {
      kind: 'ready';
      manifest: Pick<GeoManifest, 'referenceDate' | 'license' | 'sourceUrl'>;
    }
  | { kind: 'unavailable' }
  | { kind: 'corrupt'; reason: string };

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function manifestEntry(
  manifest: GeoManifest,
  level: 'sido' | 'sigungu',
  sido: string | null,
) {
  return level === 'sido'
    ? manifest.sido
    : sido
      ? manifest.sigungu[sido]
      : undefined;
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
  )
    throw new Error('manifest schema invalid');
  return manifest as GeoManifest;
}

function validateCollection(
  value: unknown,
  entry: ManifestEntry,
  level: 'sido' | 'sigungu',
): Collection {
  const collection = value as Partial<Collection>;
  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    collection.features.length === 0 ||
    collection.features.length !== entry.featureCount ||
    // `sido` 속성은 시군구 파티션 전용 — 시도 파일에는 없다(게시 계약 v2).
    collection.features.some(
      (feature) =>
        !feature?.properties?.regionKey ||
        !feature.properties.name ||
        !feature.properties.code ||
        (level === 'sigungu' && !feature.properties.sido),
    )
  )
    throw new Error('boundary schema invalid');
  return collection as Collection;
}

// 동일 경계 파일 재요청 방지(React StrictMode 이중 이펙트·레벨 왕복) — 파일은 versioned 불변이므로 안전.
const boundaryTextCache = new Map<string, Promise<string>>();
function fetchBoundaryText(file: string): Promise<string> {
  const existing = boundaryTextCache.get(file);
  if (existing) return existing;
  const loading = fetch(`/geo/${file}`).then(async (response) => {
    if (!response.ok)
      throw new Error(`boundary request failed (${response.status})`);
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
  onSelectSido,
  onLoadStateChange,
}: {
  level: 'sido' | 'sigungu';
  sido: string | null;
  regions: Region[];
  onSelectSido: (sido: string) => void;
  onLoadStateChange: (state: GeoLoadState) => void;
}) {
  const [features, setFeatures] = useState<RenderedFeature[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<GeoLoadState>({ kind: 'loading' });

  useEffect(() => {
    // 레벨/시도 전환 = 이전 대상 hover 잔상 제거.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHoveredKey(null);
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
        if (!response.ok)
          throw new Error(`manifest request failed (${response.status})`);
        return validateManifest(await response.json());
      }),
      import('d3-geo'),
    ])
      .then(async ([manifest, d3]) => {
        const entry = manifestEntry(manifest, level, sido);
        if (
          !entry ||
          !entry.file ||
          !entry.sha256 ||
          !Number.isInteger(entry.featureCount)
        )
          throw new Error('manifest boundary entry invalid');
        const raw = await fetchBoundaryText(entry.file);
        if ((await sha256(raw)) !== entry.sha256) {
          boundaryTextCache.delete(entry.file);
          throw new Error('boundary checksum mismatch');
        }
        const collection = validateCollection(JSON.parse(raw), entry, level);
        if (cancelled) return;
        const projection = d3.geoMercator().fitExtent(
          [
            [24, 16],
            [576, 644],
          ],
          collection as never,
        );
        const path = d3.geoPath(projection);
        setFeatures(
          collection.features.map((feature) => ({
            ...feature,
            path: path(feature as never) ?? '',
          })),
        );
        setState({ kind: 'ready', manifest });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const unavailable =
          error instanceof Error && error.message === 'manifest unavailable';
        if (!unavailable)
          console.error('Failed to load administrative boundaries.', error);
        setFeatures([]);
        setState(
          unavailable
            ? { kind: 'unavailable' }
            : {
                kind: 'corrupt',
                reason:
                  error instanceof Error
                    ? error.message
                    : 'unknown boundary error',
              },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [level, onLoadStateChange, sido]);

  const regionsByKey = new Map(regions.map((region) => [region.key, region]));
  const hovered = hoveredKey ? regionsByKey.get(hoveredKey) : null;
  const maximum = Math.max(0, ...regions.map((region) => region.demand));
  const lower = Math.floor(maximum * 0.25),
    middle = Math.floor(maximum * 0.5);
  const bands = [
    { from: 1, to: lower, color: '#f6e7aa' },
    { from: lower + 1, to: middle, color: '#ecd074' },
    { from: middle + 1, to: maximum, color: '#bd8d36' },
  ].filter((band) => band.to >= band.from);
  const fill = (region?: Region) =>
    !region?.demand
      ? '#e8ede5'
      : region.demand / maximum <= 0.25
        ? '#f6e7aa'
        : region.demand / maximum <= 0.5
          ? '#ecd074'
          : '#bd8d36';

  if (loadState.kind === 'loading')
    return (
      <section className={styles.mapPanel}>
        <p className={styles.state}>지도를 불러오는 중…</p>
      </section>
    );
  if (loadState.kind === 'unavailable') return null;
  if (loadState.kind === 'corrupt') {
    return (
      <section className={styles.mapPanel} role="alert">
        <p className={styles.state}>
          지도를 불러오지 못했습니다. 지역별 접수 목록은 계속 이용할 수
          있습니다.
        </p>
      </section>
    );
  }
  if (features.length === 0) return null;

  return (
    <section className={styles.mapPanel} aria-label="지역별 접수 지도">
      <header className={styles.mapHeading}>
        <h2>{sido ?? '전국'} 접수 분포</h2>
        <p>색이 진할수록 최근 30일 접수가 많습니다.</p>
      </header>
      <div className={styles.mapCanvas}>
        <svg
          viewBox="0 0 600 660"
          role="group"
          aria-label={
            level === 'sido' ? '시도별 접수 지도' : `${sido} 시군구별 접수 지도`
          }
        >
          {features.map((feature) => {
            const region = regionsByKey.get(feature.properties.regionKey);
            const selectable = level === 'sido' && region?.hasSigungu;
            return (
              <path
                key={feature.properties.regionKey}
                d={feature.path}
                fill={fill(region)}
                stroke="#b8c3af"
                strokeWidth=".7"
                tabIndex={0}
                role={selectable ? 'button' : 'img'}
                aria-label={`${feature.properties.name}: 접수 ${region?.demand ?? 0}건, 담당 등록 ${region?.supply ?? 0}`}
                onFocus={() => setHoveredKey(region?.key ?? null)}
                onMouseEnter={() => setHoveredKey(region?.key ?? null)}
                onClick={() => {
                  setHoveredKey(region?.key ?? null);
                  if (selectable) onSelectSido(feature.properties.name);
                }}
                onKeyDown={(event) => {
                  if (
                    selectable &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
                    event.preventDefault();
                    onSelectSido(feature.properties.name);
                  }
                }}
              />
            );
          })}
        </svg>
      </div>
      <div className={styles.mapReadout} role="status">
        {hovered ? (
          <>
            <strong>{hovered.name}</strong> · 접수{' '}
            {hovered.demand.toLocaleString('ko-KR')}건 · 담당 등록{' '}
            {hovered.supply.toLocaleString('ko-KR')}
          </>
        ) : level === 'sido' ? (
          '지도에 마우스를 올리거나 지역을 눌러 확인하세요.'
        ) : (
          '지도 또는 목록에서 지역별 수치를 확인하세요.'
        )}
      </div>
      <div className={styles.mapLegend} aria-label="지도 색상 범례">
        <span>
          <i style={{ background: '#e8ede5' }} />
          접수 없음
        </span>
        {bands.map((band) => (
          <span key={band.from}>
            <i style={{ background: band.color }} />
            {band.from === band.to
              ? band.from.toLocaleString('ko-KR')
              : `${band.from.toLocaleString('ko-KR')}–${band.to.toLocaleString('ko-KR')}`}
            건
          </span>
        ))}
      </div>
      <p className={styles.mapSource}>
        {loadState.manifest.license} · 경계 기준{' '}
        {loadState.manifest.referenceDate}
        {/^https?:\/\//.test(loadState.manifest.sourceUrl) && (
          <>
            {' '}
            ·{' '}
            <a
              href={loadState.manifest.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              지도 출처
            </a>
          </>
        )}
      </p>
    </section>
  );
}
