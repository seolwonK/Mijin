import { StarIcon } from '@/components/icons';
import { getLandingReviewStats } from '@/lib/landingReviews';

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rating} className="h-5 w-5" />
      ))}
    </span>
  );
}

// §5 실설문 집계 후기 — 독립 async 데이터 경계. 코멘트 원문은 비노출(AC-3, 집계만 공개).
// 호출부 try/catch: DB 실패 시 섹션 자체를 생략(랜딩 500 금지) — throw이므로
// unstable_cache(getLandingReviewStats) 엔트리도 생성되지 않아 캐시 오염이 없다.
// 임계(MIN_REVIEWS_TO_SHOW=3) 미만이면 landingReviews.ts가 null을 반환해 여기서도 미렌더.
export default async function ReviewSection() {
  let stats = null;
  try {
    stats = await getLandingReviewStats();
  } catch (e) {
    console.error('[landing] 후기 집계 실패', e);
    stats = null;
  }
  if (!stats) return null;

  const { avgRating, reviewCount, distribution } = stats;

  return (
    <section className="border-t border-border py-10 md:py-12" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="text-2xl font-bold text-fg">고객이 남긴 후기</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        실제 서비스를 이용한 고객의 만족도 조사 결과입니다.
      </p>
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.6fr] md:gap-10">
        <div className="flex items-center gap-4">
          <span className="text-4xl font-extrabold text-fg">{avgRating.toFixed(1)}</span>
          <div>
            <StarRow rating={Math.round(avgRating)} />
            <p className="mt-1 text-sm text-muted">{reviewCount.toLocaleString('ko-KR')}건 참여</p>
          </div>
        </div>
        <div className="space-y-2">
          {([5, 4, 3, 2, 1] as const).map((n) => {
            const count = distribution[n];
            const pct = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
            return (
              <div key={n} className="flex items-center gap-2 text-xs text-muted">
                <span className="w-3 shrink-0 text-right">{n}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
