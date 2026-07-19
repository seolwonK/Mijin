'use client';

import Surface from '@/components/Surface';
import { StarIcon } from '@/components/icons';

export type PortalStats = {
  assigned30d: number;
  accepted30d: number;
  avgRating: number | null;
  reviewCount: number;
};

// "결"(C) 카드 관례의 성과 통계 카드(AC-3/AC-4) — partner·tech 대시보드 공용.
// 본인 데이터만 반환하는 신규 API(/api/partner|tech/stats)를 그대로 표시 — 타사 비교·지역
// 순번은 노출하지 않는다.
export default function PortalStatsCard({ data }: { data: PortalStats | null }) {

  return (
    <section>
      <h2 className="mb-2 font-semibold">내 성과</h2>
      <Surface as="section" className="rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">30일 배정</p>
            <p className="text-2xl font-extrabold tabular-nums leading-none text-fg">
              {data ? `${data.assigned30d}건` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">30일 수락</p>
            <p className="text-2xl font-extrabold tabular-nums leading-none text-fg">
              {data ? `${data.accepted30d}건` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">평균 별점</p>
            <p className="flex items-center gap-1 text-2xl font-extrabold tabular-nums leading-none text-fg">
              {data?.avgRating != null ? (
                <>
                  <StarIcon filled className="h-4 w-4 text-amber-500" />
                  {data.avgRating.toFixed(1)}
                </>
              ) : (
                '—'
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">후기 수</p>
            <p className="text-2xl font-extrabold tabular-nums leading-none text-fg">
              {data ? `${data.reviewCount}건` : '—'}
            </p>
          </div>
        </div>
      </Surface>
    </section>
  );
}
