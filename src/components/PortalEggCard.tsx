'use client';

// 내 알 크레딧 카드 (기술자·업체 포털 공용) — 본인 잔액 + 같은 종류 내 순위만 표시.
// 타인의 잔액·순위는 API가 반환하지 않는다(가시성 정책). 폴링 60초.
// 금액(원화) 비노출 정책: 일반 웹 표면은 알 "개수"만 표기한다 — 환산액은 결제(충전)
// 컨텍스트(AdminEggManager 충전 폼)에만 존재. 여기서 ₩·만원 표기를 되살리지 말 것.
import { EggIcon } from '@/components/EggIcon';
import { usePolling } from '@/components/usePolling';

type EggRank = { balance: number; rank: number; poolSize: number };

export default function PortalEggCard({ role }: { role: 'tech' | 'partner' }) {
  const { data } = usePolling<EggRank>(`/api/${role}/eggs`, 60_000);
  const kindLabel = role === 'partner' ? '업체' : '기사';
  const unit = role === 'partner' ? '곳' : '명';

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-surface-sm">
      <div className="flex items-center gap-4 p-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-50">
          <EggIcon variant="face" size={46} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-muted">내 알</p>
          <p className="mt-0.5 font-mono text-3xl font-bold leading-none text-brand-700">
            {data ? data.balance : '–'}
            <span className="ml-0.5 text-base">알</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted">배정 노출 순위</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-fg">
            {data ? (
              <>
                <span className="text-lg text-brand-700">{data.rank}위</span>
                <span className="ml-1 text-xs font-medium text-muted">
                  / {kindLabel} {data.poolSize}
                  {unit}
                </span>
              </>
            ) : (
              '–'
            )}
          </p>
        </div>
      </div>
      <p className="border-t border-brand-50 bg-brand-50/50 px-5 py-3 text-xs leading-relaxed text-muted">
        알이 많을수록 배정 순위에서 우선 노출되고, 배정을 수락하면 알 1개가 차감됩니다.
        충전은 관리자에게 문의해 주세요 (최소 3알).
      </p>
    </section>
  );
}
