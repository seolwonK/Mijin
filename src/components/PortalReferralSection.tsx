'use client';

import { usePolling } from '@/components/usePolling';
import Surface from '@/components/Surface';

type ReferralOverviewReferee = {
  id: string;
  name: string;
  kind: 'PROVIDER' | 'TECHNICIAN';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  joinedAt: string;
  accruedPending: number;
  accruedPaid: number;
  pendingSurveyCount: number;
};

type ReferralOverviewResponse = {
  referees: ReferralOverviewReferee[];
  totals: { refereeCount: number; pendingSurveyCount: number };
};

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

const KIND_LABEL: Record<ReferralOverviewReferee['kind'], string> = {
  PROVIDER: '업체',
  TECHNICIAN: '기술자',
};

const APPROVAL_BADGE: Record<
  ReferralOverviewReferee['approvalStatus'],
  { label: string; className: string }
> = {
  PENDING: { label: '승인 대기', className: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: '승인됨', className: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: '거절됨', className: 'bg-neutral-100 text-neutral-500' },
};

// "결"(C) 카드 관례의 내 추천 현황 섹션 — partner·tech 대시보드 공용(url만 다르게 넘긴다,
// CommissionSummary.tsx·PortalReviewSection.tsx와 동일한 usePolling 관례). 가입 시
// referredByUserId로 지정된 업체·기술자만 대상 — 소급 지정은 관리자 전용이라 여기 나타나지
// 않는다. CommissionSummary와 달리 0건이어도 섹션을 숨기지 않고 안내 문구를 보여준다
// (추천은 가입 시 1회만 결정되는 관계라, 있으면 알려줘야 하는 CommissionSummary의 "평생
// 무적립" 숨김과는 성격이 다르다). 설문 대기 건수는 금액을 절대 추정하지 않는다 — API 계약
// (getReferralOverview)이 건수만 내려주므로 이 컴포넌트는 그걸 그대로 표시할 뿐이다.
export default function PortalReferralSection({ url }: { url: string }) {
  const { data } = usePolling<ReferralOverviewResponse>(url, 30_000);

  if (!data || data.referees.length === 0) {
    return (
      <section>
        <h2 className="mb-2 font-semibold">내 추천 현황</h2>
        <Surface as="section" className="rounded-2xl p-4 text-center">
          <p className="text-sm text-muted">아직 추천한 업체·기술자가 없습니다</p>
          <p className="mt-1 text-xs text-muted">
            추천인은 가입 시에만 지정할 수 있어요 — 나중에 추가할 수 없습니다
          </p>
        </Surface>
      </section>
    );
  }

  const { referees, totals } = data;

  return (
    <section>
      <h2 className="mb-2 font-semibold">내 추천 현황</h2>
      <Surface as="section" className="rounded-2xl p-4">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-muted">추천 인원</p>
            <p className="text-lg font-bold text-fg">총 {totals.refereeCount}명</p>
          </div>
          {totals.pendingSurveyCount > 0 && (
            <div>
              <p className="text-xs text-muted">설문 대기</p>
              <p className="text-lg font-bold text-amber-700">{totals.pendingSurveyCount}건</p>
            </div>
          )}
        </div>

        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {referees.map((r) => {
            const badge = APPROVAL_BADGE[r.approvalStatus];
            return (
              <li key={r.id} className="rounded-xl bg-neutral-50 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-fg">{r.name}</span>
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                    {KIND_LABEL[r.kind]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  가입 {new Date(r.joinedAt).toLocaleDateString('ko-KR')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted">
                    적립 대기{' '}
                    <span className="font-semibold text-amber-700">{won(r.accruedPending)}</span>
                  </span>
                  <span className="text-muted">
                    지급 완료 <span className="font-semibold text-fg">{won(r.accruedPaid)}</span>
                  </span>
                </div>
                {r.pendingSurveyCount > 0 && (
                  <div className="mt-2 border-t border-neutral-200 pt-2">
                    <span
                      className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"
                      title="완료된 작업의 만족도 조사가 제출되면 수수료가 적립됩니다"
                    >
                      설문 대기 {r.pendingSurveyCount}건
                    </span>
                    <p className="mt-1 text-[11px] text-muted">
                      완료된 작업의 만족도 조사가 제출되면 수수료가 적립됩니다
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Surface>
    </section>
  );
}
