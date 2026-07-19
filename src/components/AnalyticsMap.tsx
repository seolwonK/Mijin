'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import InfoTip from '@/components/InfoTip';
import { useIsLg } from '@/components/useIsLg';
import { usePolling } from '@/components/usePolling';
import MapChoropleth, { type GeoLoadState } from '@/components/MapChoropleth';

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

type RegionsResponse = {
  level: 'sido' | 'sigungu';
  sido: string | null;
  regions: Region[];
  gapAlerts: { key: string; name: string; demand: number }[];
  unknownLocation: { count: number; reasons: Record<string, number> };
  sigunguUnknown: number;
  sourceLabel: string;
  asOf: string;
};

type DispatchResponse = {
  pins: { requestId: string; lookupCode: string; lat: number; lng: number; address: string | null }[];
  unknownCount: number;
  asOf: string;
};

function refreshTime(updatedAt?: number | null) {
  return updatedAt
    ? `마지막 갱신 ${new Date(updatedAt).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`
    : '마지막 갱신 —';
}

function stateLabel(state: PressureState) {
  return {
    NORMAL: '정상',
    CRITICAL_ALERT: '공급없음경보',
    INACTIVE: '활동없음',
    ZERO: '수요없음',
  }[state];
}

function stateClass(state: PressureState) {
  return state === 'CRITICAL_ALERT'
    ? 'bg-amber-100 text-amber-800'
    : state === 'INACTIVE'
      ? 'bg-neutral-200 text-neutral-700'
      : state === 'ZERO'
        ? 'bg-sky-100 text-sky-800'
        : 'bg-emerald-100 text-emerald-800';
}

function pressureLabel(region: Region) {
  return region.pressure == null ? '—' : region.pressure.toFixed(2);
}

export default function AnalyticsMap() {
  const isLg = useIsLg();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sido = searchParams.get('sido');
  const [geoLoadState, setGeoLoadState] = useState<GeoLoadState>({ kind: 'loading' });
  const handleSelectSido = useCallback((selectedSido: string) => {
    router.push(selectedSido ? `/admin/analytics/map?sido=${encodeURIComponent(selectedSido)}` : '/admin/analytics/map');
  }, [router]);
  const handleGeoLoadStateChange = useCallback((state: GeoLoadState) => setGeoLoadState(state), []);
  const regionsUrl = isLg
    ? `/api/admin/analytics/map/regions${sido ? `?sido=${encodeURIComponent(sido)}` : ''}`
    : null;
  const { data: regionsData, error: regionsError, lastUpdatedAt: regionsUpdatedAt } = usePolling<RegionsResponse>(regionsUrl, 45_000);
  const { data: dispatchData, error: dispatchError, lastUpdatedAt: dispatchUpdatedAt } = usePolling<DispatchResponse>(
    isLg ? '/api/admin/analytics/map/dispatch' : null,
    8_000,
  );
  const regions = [...(regionsData?.regions ?? [])].sort((a, b) => {
    if (a.pressure == null && b.pressure == null) return 0;
    if (a.pressure == null) return 1;
    if (b.pressure == null) return -1;
    return b.pressure - a.pressure;
  });
  const gapAlerts = [...(regionsData?.gapAlerts ?? [])].sort((a, b) => b.demand - a.demand);

  return (
    <main className="min-h-screen bg-neutral-50 text-[14px] text-fg">
      <div className="p-4 lg:hidden">
        <p className="rounded-admin-md border border-border bg-white p-5 text-center text-sm text-muted">
          지도 현황은 데스크톱에서 이용할 수 있습니다.
        </p>
      </div>
      <div className="hidden lg:block">
        <div className="mx-auto max-w-7xl p-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold">전국 지도 현황</h1>
            <p className="mt-1 text-sm text-muted">지역별 수급 압력과 출동 고객 목적지를 확인합니다.</p>
          </div>

          {regionsError && <p className="mb-4 text-sm text-red-600">{regionsError}</p>}
          {dispatchError && <p className="mb-4 text-sm text-red-600">{dispatchError}</p>}
          {!regionsData ? (
            <p className="rounded-admin-md border border-border bg-white p-6 text-sm text-muted">지도 현황을 불러오는 중…</p>
          ) : (
            <div className="grid gap-5">
              <MapChoropleth
                level={regionsData.level}
                sido={regionsData.sido}
                regions={regionsData.regions}
                pins={dispatchData?.pins ?? []}
                onSelectSido={handleSelectSido}
                onLoadStateChange={handleGeoLoadStateChange}
              />
              {geoLoadState.kind === 'unavailable' && <section className="rounded-admin-md border border-brand-200 bg-brand-50 p-5" aria-label="지도 안내">
                <p className="font-semibold">지도 시각화(코로플레스)는 VWorld 행정경계 스냅샷 확보 후 제공 예정 — 현재는 지역 순위표로 제공됩니다</p>
                <p className="mt-2 text-sm text-muted">{regionsData.sourceLabel}</p>
              </section>}

              <section className="rounded-admin-md border border-amber-300 bg-amber-50 p-5" aria-labelledby="gap-alerts-heading">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="gap-alerts-heading" className="text-base font-bold">갭 경보</h2>
                  <span className="font-mono text-[11px] text-muted">{refreshTime(regionsUpdatedAt)}</span>
                </div>
                {gapAlerts.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">공급 0명·수요 있음 지역이 없습니다.</p>
                ) : (
                  <ol className="mt-3 grid gap-2 md:grid-cols-2">
                    {gapAlerts.map((alert) => (
                      <li key={alert.key} className="rounded-admin-sm border border-amber-200 bg-white px-3 py-2">
                        <span className="font-semibold">{alert.name}</span><span className="ml-2 text-sm text-muted">공급 0명 · 수요 {alert.demand}건</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="rounded-admin-md border border-border bg-white p-5" aria-labelledby="pressure-heading">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 id="pressure-heading" className="text-base font-bold">수급 압력 순위표</h2>
                    <InfoTip text="최근 30일 유효 요청 ÷ 명시 커버 활성·승인 공급자 수, KST 귀속" />
                  </div>
                  <span className="font-mono text-[11px] text-muted">{refreshTime(regionsUpdatedAt)}</span>
                </div>
                {regionsData.level === 'sigungu' && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">{regionsData.sido} 시군구</p>
                    <button type="button" onClick={() => router.push('/admin/analytics/map')} className="text-sm font-semibold text-brand-600 underline">시도 목록으로 돌아가기</button>
                  </div>
                )}
                {regionsData.level === 'sigungu' && regionsData.sigunguUnknown > 0 && (
                  <p className="mt-3 rounded-admin-sm bg-neutral-100 px-3 py-2 text-sm text-muted">{regionsData.sido} 시군구 미상 {regionsData.sigunguUnknown}건</p>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-border text-muted">
                      <tr><th className="px-3 py-2 font-semibold">지역</th><th className="px-3 py-2 text-right font-semibold">공급</th><th className="px-3 py-2 text-right font-semibold">수요</th><th className="px-3 py-2 text-right font-semibold">압력 (수요/공급)</th><th className="px-3 py-2 font-semibold">상태</th></tr>
                    </thead>
                    <tbody>
                      {regions.map((region) => (
                        <tr key={region.key} className="border-b border-border last:border-0">
                          <td className="px-3 py-3">
                            {regionsData.level === 'sido' && region.hasSigungu ? <button type="button" onClick={() => router.push(`/admin/analytics/map?sido=${encodeURIComponent(region.name)}`)} className="font-semibold text-brand-600 underline">{region.name}</button> : region.name}
                          </td>
                          <td className="px-3 py-3 text-right font-mono">{region.supply}명</td>
                          <td className="px-3 py-3 text-right font-mono">{region.demand}건</td>
                          <td className="px-3 py-3 text-right font-mono">{pressureLabel(region)} ({region.demand}/{region.supply})</td>
                          <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${stateClass(region.state)}`}>{stateLabel(region.state)}</span></td>
                        </tr>
                      ))}
                      {regions.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">표시할 지역이 없습니다.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 rounded-admin-sm bg-neutral-50 p-3 text-sm text-muted">
                  <p className="font-semibold text-fg">위치 미상 {regionsData.unknownLocation.count}건</p>
                  {Object.entries(regionsData.unknownLocation.reasons).map(([reason, count]) => <p key={reason} className="mt-1">{reason} {count}건</p>)}
                </div>
              </section>

            </div>
          )}
          <section className="mt-5 rounded-admin-md border border-border bg-white p-5" aria-labelledby="dispatch-heading">
            <div className="flex items-baseline justify-between gap-3">
              <div><h2 id="dispatch-heading" className="text-base font-bold">출동 현황</h2><p className="mt-1 text-sm text-muted">차량 추적 아님 — 고객 목적지 기준</p></div>
              <span className="font-mono text-[11px] text-muted">{refreshTime(dispatchUpdatedAt)} · 8초 갱신</span>
            </div>
            {!dispatchData ? <p className="mt-4 text-sm text-muted">출동 현황을 불러오는 중…</p> : (
              <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-border text-muted"><tr><th className="px-3 py-2 font-semibold">접수번호</th><th className="px-3 py-2 font-semibold">주소</th><th className="px-3 py-2 font-semibold">좌표</th></tr></thead><tbody>{dispatchData.pins.map((pin) => <tr key={pin.requestId} className="border-b border-border last:border-0"><td className="px-3 py-3 font-mono">{pin.lookupCode}</td><td className="px-3 py-3">{pin.address ?? '주소 미상'}</td><td className="px-3 py-3 font-mono">{pin.lat}, {pin.lng}</td></tr>)}{dispatchData.pins.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-muted">출동 중인 고객 목적지가 없습니다.</td></tr>}</tbody></table></div><p className="mt-3 text-sm text-muted">좌표 미상 {dispatchData.unknownCount}건</p></>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
