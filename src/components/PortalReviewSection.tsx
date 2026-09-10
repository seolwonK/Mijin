'use client';

import { useState } from 'react';
import { usePolling } from '@/components/usePolling';
import PortalLoadState from '@/components/PortalLoadState';
import Surface from '@/components/Surface';
import { StarIcon } from '@/components/icons';

type ReviewsResponse = {
  reviewCount: number;
  avgRating: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  comments: { rating: number; comment: string | null }[];
};

const MIN_REVIEWS_FOR_COMMENTS = 5;

function StarRow({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`5점 만점에 ${rating}점`}
      className="inline-flex items-center gap-0.5 text-amber-600"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rating} className="h-4 w-4" />
      ))}
    </span>
  );
}

// 받은 후기(AC-5) — 업체·전기기사 포털 공용(url만 다르게 넘긴다, CommissionSummary.tsx와 동일
// 관례). 건 미연결·시점 무작위화·n≥5 코멘트 임계는 API 계약 수준(portalStats.getPortalReviews +
// stats/reviews 라우트)에서 보장되므로 이 컴포넌트는 받은 응답을 그대로 표시할 뿐이다 — 코멘트에
// requestId·시각·고객 필드가 없어 목록 key는 인덱스를 쓴다(자연 키가 없는 게 설계 의도).
export default function PortalReviewSection({ url }: { url: string }) {
  const { data, error, refresh } = usePolling<ReviewsResponse>(url, 30_000);
  const [expanded, setExpanded] = useState(false);

  if (!data)
    return (
      <section>
        <h2 className="mb-2 font-semibold">받은 후기</h2>
        <PortalLoadState
          label="받은 후기"
          error={error}
          loading={!error}
          retry={refresh}
        />
      </section>
    );

  if (data.reviewCount === 0) {
    return (
      <section>
        <h2 className="mb-2 font-semibold">받은 후기</h2>
        <PortalLoadState
          label="받은 후기"
          error={error}
          retry={refresh}
          stale
        />
        <Surface
          as="section"
          className="rounded-2xl p-4 text-center text-sm text-muted"
        >
          아직 받은 후기가 없습니다
        </Surface>
      </section>
    );
  }

  const { avgRating, reviewCount, distribution, comments } = data;

  return (
    <section>
      <h2 className="mb-2 font-semibold">받은 후기</h2>
      <PortalLoadState label="받은 후기" error={error} retry={refresh} stale />
      <Surface as="section" className="rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold tabular-nums text-fg">
            {avgRating != null ? avgRating.toFixed(1) : '-'}
          </span>
          <div>
            <StarRow rating={avgRating != null ? avgRating : 0} />
            <p className="mt-0.5 text-xs tabular-nums text-muted">
              {reviewCount.toLocaleString('ko-KR')}건
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {([5, 4, 3, 2, 1] as const).map((n) => {
            const count = distribution[n];
            const pct =
              reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
            return (
              <div
                key={n}
                className="flex items-center gap-2 text-xs text-muted"
              >
                <span className="w-3 shrink-0 text-right tabular-nums">
                  {n}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right tabular-nums">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>

        {comments.length > 0 ? (
          <>
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {(expanded ? comments : comments.slice(0, 3)).map((c, i) => (
              <li key={i} className="py-3 text-sm">
                <StarRow rating={c.rating} />
                {c.comment && (
                  <p className="mt-1 whitespace-pre-wrap text-fg">
                    {c.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {comments.length > 3 && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(value => !value)}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-muted"
            >
              {expanded ? '후기 접기' : `후기 더 보기 (${comments.length}건)`}
            </button>
          )}
          </>
        ) : (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            후기가 {MIN_REVIEWS_FOR_COMMENTS}건 이상 모이면 코멘트를 확인할 수
            있어요 (현재 {reviewCount}건)
          </p>
        )}
      </Surface>
    </section>
  );
}
