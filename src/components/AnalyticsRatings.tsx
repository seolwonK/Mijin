'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';
import InfoTip from '@/components/InfoTip';
import LineChart from '@/components/charts/LineChart';
import { usePolling } from '@/components/usePolling';
import { useIsLg } from '@/components/useIsLg';
import type { RatingRanking } from '@/lib/ratingsAnalytics';

type Detail = {
  monthly: Array<{ bucket: string; avgRating: number | null; reviewCount: number }>;
  reviews: {
    items: Array<{ rating: number; comment: string | null; submittedAt: string }>;
    total: number;
    hasNext: boolean;
    nextCursor: string | null;
  };
};

function refreshTime(time: number | null) {
  return time == null ? '마지막 갱신 —' : `마지막 갱신 ${new Date(time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function ratingText(row: RatingRanking) {
  return row.avgRating == null ? '—' : `★${row.avgRating.toFixed(1)}`;
}

export default function AnalyticsRatings() {
  const isLg = useIsLg();
  const { data, error, lastUpdatedAt } = usePolling<{ ranking: RatingRanking[] }>(isLg ? '/api/admin/analytics/ratings' : null, 45_000);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RatingRanking | null>(null);
  const selectedKey = selected?.subjectKey;
  const selectedKeyRef = useRef(selectedKey);
  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);
  const { data: detail, error: detailError } = usePolling<Detail>(
    isLg && selectedKey ? `/api/admin/analytics/ratings/${encodeURIComponent(selectedKey)}` : null,
    45_000,
  );
  const [loadedReviews, setLoadedReviews] = useState<Detail['reviews'] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    // 대상 전환 = pending continuation 무효화 — 로딩 고착 방지.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMore(false);
    setMoreError(null);
  }, [selectedKey]);

  useEffect(() => {
    // 45초 폴링은 첫 페이지를 새로 받고, 이어서 불러온 목록은 의도적으로 초기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedReviews(detail?.reviews ?? null);
    setMoreError(null);
  }, [detail]);

  const loadMore = async () => {
    if (!selectedKey || !loadedReviews?.hasNext || !loadedReviews.nextCursor || loadingMore) return;
    const cursor = loadedReviews.nextCursor;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const response = await fetch(`/api/admin/analytics/ratings/${encodeURIComponent(selectedKey)}?cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`요청 실패 (${response.status})`);
      const next = (await response.json()) as Detail;
      if (selectedKeyRef.current !== selectedKey) return;
      setLoadedReviews((current) => current && current.nextCursor === cursor
        ? { ...next.reviews, items: [...current.items, ...next.reviews.items] }
        : current);
    } catch (error) {
      if (selectedKeyRef.current === selectedKey) setMoreError(error instanceof Error ? error.message : String(error));
    } finally {
      if (selectedKeyRef.current === selectedKey) setLoadingMore(false);
    }
  };

  const rows = useMemo(() => (data?.ranking ?? []).filter((row) => row.name.includes(query.trim())), [data, query]);
  const columns: Column<RatingRanking, 'rank' | 'name' | 'type' | 'rating' | 'reviewCount' | 'completed'>[] = [
    { key: 'rank', label: '순위', width: '70px', render: (row) => <span className="font-mono">{(data?.ranking.indexOf(row) ?? 0) + 1}</span> },
    { key: 'name', label: '이름', sortable: true, sortValue: (row) => row.name, render: (row) => <strong>{row.name}</strong> },
    { key: 'type', label: '유형', sortable: true, sortValue: (row) => row.type, render: (row) => row.type === 'PROVIDER' ? '업체' : '기술자' },
    { key: 'rating', label: '평균 별점', align: 'right', sortable: true, sortValue: (row) => row.avgRating ?? -1, render: ratingText },
    { key: 'reviewCount', label: '응답 수', align: 'right', sortable: true, sortValue: (row) => row.reviewCount, render: (row) => <span className="font-mono">{row.reviewCount}건</span> },
    { key: 'completed', label: '완료 건수', align: 'right', sortable: true, sortValue: (row) => row.completed, render: (row) => <span className="font-mono">{row.completed}건</span> },
  ];
  const reviews = loadedReviews ?? detail?.reviews ?? null;

  return <main className="min-h-screen bg-neutral-50 text-[14px] text-fg">
    <div className="p-4 lg:hidden"><p className="rounded-admin-md border border-border bg-white p-5 text-center text-sm text-muted">평점 현황은 데스크톱에서 이용할 수 있습니다.</p></div>
    <div className="hidden lg:block"><div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-end justify-between gap-4"><div><h1 className="text-xl font-bold">평점 현황</h1><p className="mt-1 text-sm text-muted">업체와 기술자의 만족도와 완료 실적을 확인합니다.</p></div><span className="font-mono text-[11px] text-muted">{refreshTime(lastUpdatedAt)}</span></div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-admin-md border border-border bg-white p-5"><div className="mb-4 flex items-center justify-between gap-4"><div className="flex items-center gap-2"><h2 className="text-base font-bold">평점 순위</h2><InfoTip text="완료 건수는 수락 배정이 있고 완료된 접수 수입니다. 설문과 무관합니다." /></div><input aria-label="이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" className="w-44 rounded-admin-sm border border-border px-3 py-2 text-sm outline-none focus:border-brand-600" /></div>
          {!data ? <p className="p-4 text-sm text-muted">평점 데이터를 불러오는 중…</p> : <AdminDataTable columns={columns} rows={rows} rowKey={(row) => row.subjectKey} defaultSort={{ key: 'rating', dir: -1 }} onRowClick={setSelected} selectedKey={selected?.subjectKey} />}
        </section>
        <aside className="rounded-admin-md border border-border bg-white p-5"><h2 className="text-base font-bold">평점 상세</h2>{!selected ? <p className="mt-4 text-sm text-muted">순위표에서 대상을 선택하세요.</p> : <><p className="mt-1 text-sm text-muted">{selected.name} · {selected.type === 'PROVIDER' ? '업체' : '기술자'}</p>{detailError && <p className="mt-4 text-sm text-red-600">{detailError}</p>}{!detail && !detailError ? <p className="mt-4 text-sm text-muted">상세 데이터를 불러오는 중…</p> : detail && reviews && <div className="mt-5 space-y-6"><div><h3 className="mb-2 text-sm font-bold">월별 별점 추이</h3><LineChart label="월별 별점 추이" data={detail.monthly.filter((item) => item.avgRating != null).map((item) => ({ label: item.bucket, value: item.avgRating! }))} formatValue={(value) => `${value.toFixed(1)}점`} domain={[0, 5]} /></div><div><h3 className="mb-2 text-sm font-bold">후기 전체</h3><div className="max-h-72 space-y-2 overflow-y-auto pr-1">{reviews.items.length === 0 ? <p className="text-sm text-muted">등록된 후기가 없습니다.</p> : reviews.items.map((review, index) => <article key={`${review.submittedAt}-${index}`} className="rounded-admin-sm bg-neutral-50 p-3"><p className="font-mono text-sm font-semibold">★{review.rating}</p><p className="mt-1 text-sm">{review.comment ?? '코멘트 없음'}</p></article>)}</div>{moreError && <p className="mt-2 text-sm text-red-600">{moreError}</p>}{reviews.hasNext && <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-2 text-sm font-semibold text-brand-600 disabled:text-muted">{loadingMore ? '불러오는 중…' : `더보기 (외 ${reviews.total - reviews.items.length}건)`}</button>}</div></div>}</>}</aside>
      </div>
    </div></div>
  </main>;
}
