'use client';

import { usePolling } from '@/components/usePolling';
import PortalLoadState from '@/components/PortalLoadState';
import styles from '@/components/portal-dashboard.module.css';

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
  TECHNICIAN: '전기기사',
};

const APPROVAL_LABEL = {
  PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '가입 반려',
};

export default function PortalReferralSection({ url }: { url: string }) {
  const { data, error, refresh } = usePolling<ReferralOverviewResponse>(
    url,
    30_000,
  );

  if (!data)
    return (
      <section>
        <h2 className="mb-2 font-semibold">내 추천 현황</h2>
        <PortalLoadState
          label="내 추천 현황"
          error={error}
          loading={!error}
          retry={refresh}
        />
      </section>
    );

  if (data.referees.length === 0) {
    return (
      <section>
        <h2 className="mb-2 font-semibold">내 추천 현황</h2>
        <PortalLoadState
          label="내 추천 현황"
          error={error}
          retry={refresh}
          stale
        />
        <div className={styles.chargePanel}>
          <p className="text-sm text-muted">
            아직 추천한 업체·전기기사가 없습니다
          </p>
          <p className="mt-1 text-xs text-muted">
            추천인은 가입 시에만 지정할 수 있어요 — 나중에 추가할 수 없습니다
          </p>
        </div>
      </section>
    );
  }

  const { referees, totals } = data;

  return (
    <section>
      <h2 className="mb-2 font-semibold">내 추천 현황</h2>
      <PortalLoadState
        label="내 추천 현황"
        error={error}
        retry={refresh}
        stale
      />
      <div className={styles.referralPanel}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
          <p className="text-sm text-muted">추천 인원 <strong className="ml-2 font-semibold text-fg">총 {totals.refereeCount}명</strong></p>
          {totals.pendingSurveyCount > 0 && <p className="text-xs text-muted">설문 미응답 {totals.pendingSurveyCount}건</p>}
        </div>
        <ul className="divide-y divide-border">
          {referees.map(r => (
            <li key={r.id} className="py-4 last:pb-0">
              <p className="text-sm font-semibold text-fg">{r.name}</p>
              <p className="mt-1 text-xs text-muted">{KIND_LABEL[r.kind]} · {APPROVAL_LABEL[r.approvalStatus]}</p>
              <p className="mt-1 text-xs text-muted">가입 {new Date(r.joinedAt).toLocaleDateString('ko-KR')}</p>
              <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-muted">누적 소개 수수료</span>
                <strong className="font-semibold tabular-nums text-fg">{won(r.accruedPending + r.accruedPaid)}</strong>
              </p>
              {r.pendingSurveyCount > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  작업 {r.pendingSurveyCount}건의 설문 응답을 기다리고 있습니다. 고객이 설문에 지불 금액을 입력하면 수수료가 적립됩니다.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
