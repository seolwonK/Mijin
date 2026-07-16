import Link from 'next/link';
import { StarIcon } from '@/components/icons';

export type AdminReview = {
  id: string;
  requestId: string;
  rating: number;
  comment: string | null;
  paidAmount: number | null;
  submittedAt: string;
};

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rating} className="h-4 w-4" />
      ))}
    </span>
  );
}

// 업체·기술자 상세 화면 공용 만족도 조사 섹션 — 평균 별점 요약 헤더 + 최근 리뷰 목록.
// avgRating=null은 "리뷰 0건"을 뜻한다(랭킹용 3.0 중립값과 달리, 상세 화면은 실측값만 보여준다).
export default function AdminReviewList({
  avgRating,
  reviewCount,
  reviews,
}: {
  avgRating: number | null;
  reviewCount: number;
  reviews: AdminReview[];
}) {
  return (
    <section className="mx-auto max-w-2xl space-y-3 border-b border-neutral-100 p-4">
      <h2 className="text-sm font-semibold text-muted">만족도 조사</h2>
      <div className="flex items-center gap-3 rounded-admin-md border border-border p-4">
        {avgRating != null ? (
          <>
            <StarRow rating={Math.round(avgRating)} />
            <span className="text-lg font-bold">{avgRating.toFixed(1)}</span>
            <span className="text-sm text-muted">리뷰 {reviewCount}건</span>
          </>
        ) : (
          <span className="text-sm text-muted">아직 등록된 리뷰가 없습니다</span>
        )}
      </div>
      {reviews.length > 0 && (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-admin-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <StarRow rating={r.rating} />
                <span className="text-xs text-neutral-400">
                  {new Date(r.submittedAt).toLocaleString('ko-KR')}
                </span>
              </div>
              {r.comment && <p className="mt-1.5 whitespace-pre-wrap">{r.comment}</p>}
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                <span>
                  {r.paidAmount != null ? `${r.paidAmount.toLocaleString('ko-KR')}원` : '금액 미기재'}
                </span>
                <Link
                  href={`/admin/requests/${r.requestId}`}
                  className="font-medium text-admin-cyan-ink hover:underline"
                >
                  접수 상세 →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
