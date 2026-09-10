'use client';

// 내 알 크레딧 카드 (기술자·업체 포털 공용) — 본인 잔액 + 같은 종류 내 순위만 표시.
// 타인의 잔액·순위는 API가 반환하지 않는다(가시성 정책). 폴링 60초.
// 금액(원화) 비노출 정책: 일반 웹 표면은 알 "개수"만 표기한다 — 환산액은 결제(충전)
// 컨텍스트(AdminEggManager 충전 폼)에만 존재. 여기서 ₩·만원 표기를 되살리지 말 것.
import Link from 'next/link';
import PortalLoadState from '@/components/PortalLoadState';
import PortalSupportLink from '@/components/PortalSupportLink';
import { EggIcon } from '@/components/EggIcon';
import { usePolling } from '@/components/usePolling';
import styles from '@/components/portal-dashboard.module.css';

type EggRank = {
  balance: number;
  rank: number | null;
  poolSize: number;
  eligible: boolean;
};

export default function PortalEggCard({ role }: { role: 'tech' | 'partner' }) {
  const { data, error, refresh } = usePolling<EggRank>(
    `/api/${role}/eggs`,
    60_000,
  );
  const kindLabel = role === 'partner' ? '업체' : '기사';
  const unit = role === 'partner' ? '곳' : '명';

  return (
    <section className={styles.egg} aria-label="알 잔액과 배정 순위">
      <PortalLoadState
        label="내 알"
        error={error}
        loading={!data && !error}
        retry={refresh}
        stale={!!data}
      />
      <div className={styles.eggMain}>
        <div className="min-w-0">
          <p className={styles.label}><EggIcon size={20} /> 내 알</p>
          <p className={styles.value}>
            {data ? data.balance.toLocaleString('ko-KR') : '–'}
            <small>알</small>
          </p>
        </div>
        <div className={styles.rank}>
          <p>배정 노출 순위</p>
          <p>
            {data?.eligible ? (
              <>
                <strong>{data.rank}위</strong>
                <span>
                  {' '}/ {kindLabel} {data.poolSize}
                  {unit}
                </span>
              </>
            ) : data ? (
              '배정 대상 아님'
            ) : (
              '–'
            )}
          </p>
        </div>
      </div>
      <div className={styles.eggControls}>
      <Link href={`/${role}/eggs/charge`} className={styles.chargeLink}>알 충전하기</Link>
      <details className={styles.eggHelp}>
        <summary>알 이용 안내</summary>
        <p>
          알이 많을수록 배정 순위에서 우선 노출되고, 배정을 수락하면 알 1개가
          차감됩니다. 배정 중지·승인 대기·근로확인서 미서명 상태에서는 순위가
          표시되지 않습니다. 충전은 최소 1판(30알)부터, 30알 단위로 가능합니다.
        </p>
        <PortalSupportLink />
      </details>
      </div>
    </section>
  );
}
