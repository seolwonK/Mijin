'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePolling } from '@/components/usePolling';
import MapChoropleth, { type GeoLoadState } from '@/components/MapChoropleth';
import type { RegionOverview } from '@/lib/mapOverview';
import { kstDateString, kstRangeUtc } from '@/lib/kst';
import styles from '@/components/analytics-board.module.css';

const number = (value: number) => value.toLocaleString('ko-KR');
type Filter = 'ACTIVE' | 'ALL' | 'UNCOVERED';

function RegionBoard({ sido }: { sido: string | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [geoRevision, setGeoRevision] = useState(0);
  const [geoState, setGeoState] = useState<GeoLoadState>({ kind: 'loading' });
  const { data, error, refresh } = usePolling<RegionOverview>(
    `/api/admin/analytics/map/regions${sido ? `?sido=${encodeURIComponent(sido)}` : ''}`,
    45_000,
  );
  const selectSido = useCallback(
    (name: string) =>
      router.push(
        name
          ? `/admin/analytics/map?sido=${encodeURIComponent(name)}`
          : '/admin/analytics/map',
      ),
    [router],
  );
  const onGeoState = useCallback(
    (value: GeoLoadState) => setGeoState(value),
    [],
  );
  const all = [...(data?.regions ?? [])].sort(
    (a, b) => b.demand - a.demand || a.name.localeCompare(b.name, 'ko'),
  );
  const count = all.reduce((sum, row) => sum + row.demand, 0);
  const active = all.filter((row) => row.demand > 0);
  const uncovered = active.filter((row) => row.supply === 0);
  const shown = all.filter(
    (row) =>
      (filter === 'ALL' ||
        (filter === 'ACTIVE'
          ? row.demand > 0
          : row.demand > 0 && row.supply === 0)) &&
      row.name.includes(query.trim()),
  );
  const dateRange = data ? kstRangeUtc('month', new Date(data.asOf)) : null;
  const from = dateRange ? kstDateString(dateRange.gte) : null;
  const through = dateRange
    ? kstDateString(new Date(dateRange.lt.getTime() - 1))
    : null;
  async function reload() {
    setRefreshing(true);
    if (geoState.kind === 'unavailable' || geoState.kind === 'corrupt') {
      setGeoRevision((revision) => revision + 1);
    }
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>전국 지도 현황</h1>
          <p>어느 지역에 접수가 몰리는지, 담당 등록이 있는지 확인합니다.</p>
        </div>
        <div className={styles.tools}>
          <span className={styles.updated}>
            {data
              ? `${new Date(data.asOf).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })} 기준`
              : ''}
          </span>
          <button
            className={styles.button}
            onClick={reload}
            disabled={refreshing}
          >
            {refreshing ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>
      <div className={styles.periodBar}>
        <div>
          <h2>{sido ?? '전국'} · 최근 30일</h2>
          <p>
            {from && through
              ? `${from} — ${through} · 취소 제외`
              : '집계 기간을 확인하는 중'}
          </p>
        </div>
        {sido && (
          <button className={styles.button} onClick={() => selectSido('')}>
            ← 전국 보기
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          <p>
            {data
              ? '최신 정보를 불러오지 못했습니다. 마지막 조회 결과입니다.'
              : '지역 데이터를 불러오지 못했습니다.'}
          </p>
          <button
            className={styles.button}
            onClick={reload}
            disabled={refreshing}
          >
            다시 시도
          </button>
        </div>
      )}
      {!data && !error && (
        <p role="status" className={styles.state}>
          지역별 접수를 불러오는 중…
        </p>
      )}
      {data && (
        <>
          <dl
            className={`${styles.metrics} ${styles.mapMetrics}`}
            aria-label="지역 집계 요약"
          >
            <div className={styles.metric}>
              <dt>지역 확인된 접수</dt>
              <dd className={styles.value}>
                {number(count)}
                <small>건</small>
              </dd>
              <dd className={styles.note}>
                {sido ? `${sido} 내 시군구 확인 건` : '전국 시도 확인 건'} ·
                최근 30일
              </dd>
            </div>
            <div className={styles.metric}>
              <dt>접수가 있는 지역</dt>
              <dd className={styles.value}>
                {active.length}
                <small>곳</small>
              </dd>
              <dd className={styles.note}>
                {all.length}개 {sido ? '시군구' : '시도'} 중 접수 발생 지역
              </dd>
            </div>
            <div className={styles.metric}>
              <dt>담당 등록이 없는 접수 지역</dt>
              <dd className={styles.value}>
                {uncovered.length}
                <small>곳</small>
              </dd>
              <dd className={styles.note}>
                {uncovered.length
                  ? `최근 접수 ${number(uncovered.reduce((sum, row) => sum + row.demand, 0))}건의 지역 담당을 확인해 주세요.`
                  : !active.length
                    ? '최근 30일 접수가 없습니다.'
                    : '접수 발생 지역에 모두 담당 등록이 있습니다.'}
              </dd>
            </div>
          </dl>
          <div className={styles.mapGrid}>
            <section
              className={`${styles.panel} ${styles.regionPanel}`}
              aria-labelledby="region-list-title"
            >
              <header className={styles.panelHead}>
                <h2 id="region-list-title">지역별 접수</h2>
                <p>
                  {sido
                    ? '배정 후보를 확인할 지역을 선택하세요.'
                    : '지역 이름을 누르면 시군구별로 볼 수 있습니다.'}
                </p>
              </header>
              <div
                className={styles.regionControls}
                role="group"
                aria-label="지역 목록 필터"
              >
                {(
                  [
                    { key: 'ACTIVE', label: `접수 있는 지역 ${active.length}` },
                    { key: 'ALL', label: `전체 ${all.length}` },
                    {
                      key: 'UNCOVERED',
                      label: `담당 등록 없음 ${uncovered.length}`,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    aria-pressed={filter === item.key}
                    onClick={() => setFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
                <input
                  type="search"
                  aria-label="지역 이름 검색"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="지역 이름 검색"
                />
              </div>
              <div className={styles.regionHead} aria-hidden="true">
                <span>지역</span>
                <span>접수</span>
                <span>담당 등록</span>
              </div>
              <div className={styles.regionRows}>
                <ul aria-label="지역별 접수 목록">
                  {shown.map((row) => (
                    <li className={styles.regionRow} key={row.key}>
                      <div>
                        {data.level === 'sido' && row.hasSigungu ? (
                          <button
                            type="button"
                            onClick={() => selectSido(row.name)}
                            aria-label={`${row.name} 시군구별 보기`}
                          >
                            {row.name} <span aria-hidden="true">›</span>
                          </button>
                        ) : (
                          <Link
                            href={`/admin/rotation?${new URLSearchParams({ sido: data.level === 'sido' ? row.name : (data.sido ?? ''), ...(data.level === 'sigungu' ? { sigungu: row.name } : {}) })}`}
                            aria-label={`${row.name} 배정 후보 보기`}
                          >
                            {row.name} <span aria-hidden="true">↗</span>
                          </Link>
                        )}
                        {row.demand > 0 && row.supply === 0 && (
                          <span className={styles.rowMeta}>
                            담당 지역 등록 확인 필요
                          </span>
                        )}
                      </div>
                      <span
                        className={styles.regionValue}
                        aria-label={`접수 ${number(row.demand)}건`}
                      >
                        {number(row.demand)}
                        <small>건</small>
                      </span>
                      <span
                        className={styles.registration}
                        data-empty={row.supply === 0}
                        aria-label={`담당 등록 ${number(row.supply)}`}
                      >
                        {number(row.supply)}
                      </span>
                    </li>
                  ))}
                </ul>
                {!shown.length && (
                  <div className={styles.state}>
                    <p>
                      {query
                        ? '검색한 지역이 없습니다.'
                        : filter === 'UNCOVERED'
                          ? active.length
                            ? '접수 지역에 모두 담당 등록이 있습니다.'
                            : '최근 30일 접수가 없습니다.'
                          : '조건에 맞는 접수 지역이 없습니다.'}
                    </p>
                    <button
                      className={styles.link}
                      onClick={() => {
                        setFilter('ALL');
                        setQuery('');
                      }}
                    >
                      전체 지역 보기
                    </button>
                  </div>
                )}
              </div>
              <footer className={styles.regionFoot}>
                <span>{shown.length}개 지역 · 접수 많은 순</span>
                <span>담당 등록: 업체와 기사 합산</span>
              </footer>
            </section>
            <div className={styles.mapVisual}>
              <MapChoropleth
                key={geoRevision}
                level={data.level}
                sido={data.sido}
                regions={data.regions}
                onSelectSido={selectSido}
                onLoadStateChange={onGeoState}
              />
              {geoState.kind === 'unavailable' && (
                <section className={styles.panel} aria-label="지도 안내">
                  <p className={styles.state}>
                    지도를 준비하지 못했습니다. 지역별 접수 목록에서 같은 수치를
                    확인할 수 있습니다.
                  </p>
                </section>
              )}
            </div>
          </div>
          {(data.sigunguUnknown > 0 || data.unknownLocation.count > 0) && (
            <p className={styles.muted} style={{ marginTop: 16 }}>
              {data.sigunguUnknown > 0
                ? `${sido} 접수 중 시군구를 확인하지 못한 ${number(data.sigunguUnknown)}건은 목록에서 제외했습니다. `
                : ''}
              {data.unknownLocation.count > 0
                ? `전국 기준 지역 미확인 ${number(data.unknownLocation.count)}건은 별도입니다.`
                : ''}
            </p>
          )}
          <details className={styles.basis}>
            <summary>접수 건수와 담당 등록은 어떻게 계산하나요?</summary>
            <ul>
              <li>
                접수는 오늘을 포함한 최근 30일의 접수일 기준이며, 취소된 건은
                제외합니다. 현재 진행 중인 건수와는 다릅니다.
              </li>
              <li>
                담당 등록은 해당 지역을 담당으로 지정한 활성·승인 업체와
                전기기사를 합산합니다. 한 대상이 여러 지역에 등록될 수 있으므로
                지역별 등록 수를 더해 전국 인원으로 사용하지 않습니다.
              </li>
              <li>
                담당 지역을 지정하지 않은 대상은 이 집계에서 제외됩니다. 실제
                배정 후보는 알, 계약, 배정 규칙에 따라 달라지며 순환 현황에서
                확인할 수 있습니다.
              </li>
              <li>
                지도 색은 현재 조회 범위의 접수 건수를 비교합니다. 등록 수 대비
                비율이나 위험 등급을 뜻하지 않습니다.
              </li>
            </ul>
          </details>
        </>
      )}
    </main>
  );
}
export default function AnalyticsMap() {
  const params = useSearchParams();
  const sido = params.get('sido');
  return <RegionBoard key={sido ?? 'nationwide'} sido={sido} />;
}
