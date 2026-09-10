'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import PortalLoadState from '@/components/PortalLoadState';
import PortalSupportLink from '@/components/PortalSupportLink';
import { usePolling } from '@/components/usePolling';
import { EGG_PACK_SIZE, EGG_PRICE_WON, MIN_CHARGE_EGGS, MAX_CHARGE_EGGS, EGG_CHARGE_RULE, isValidEggCharge } from '@/lib/eggPricing';
import styles from '@/components/portal-dashboard.module.css';

type ChargeInfo = {
  account: { bankName: string; accountNumber: string; accountHolder: string } | null;
  balance: number;
  depositorName: string;
  packSize: number;
  unitPrice: number;
};

export default function PortalEggCharge({ scope }: { scope: 'partner' | 'tech' }) {
  const { data, error, refresh } = usePolling<ChargeInfo>(`/api/${scope}/eggs/charge`, 30_000);
  const [quantity, setQuantity] = useState(String(MIN_CHARGE_EGGS));
  const [copyNotice, setCopyNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const count = Number(quantity);
  const valid = isValidEggCharge(count);
  // 입금 계좌는 조회 실패 시 이전 데이터를 노출하지 않는다.
  const current = !error ? data : null;
  const account = current?.account;
  const unitPrice = current?.unitPrice ?? EGG_PRICE_WON;
  const packSize = current?.packSize ?? EGG_PACK_SIZE;

  async function copyAccount() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.accountNumber.replace(/[ -]/g, ''));
      setCopyNotice({ ok: true, text: '계좌번호를 복사했습니다.' });
    } catch {
      setCopyNotice({ ok: false, text: '복사하지 못했습니다. 아래 계좌번호를 직접 선택해 복사해 주세요.' });
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader title="알 충전하기" back={`/${scope}`} />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">필요한 만큼, 한 판씩</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">1판은 {packSize}알, 알 1개는 {unitPrice.toLocaleString('ko-KR')}원입니다.</p>
          <p className="mt-1 text-sm text-muted">현재 잔액 <strong className="font-semibold text-fg">{data ? data.balance.toLocaleString('ko-KR') : '—'}알</strong></p>
        </div>
        <section className={styles.chargePanel} aria-labelledby="charge-quantity-title">
          <h2 id="charge-quantity-title" className="font-semibold">충전 수량</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[1, 2, 3].map(packs => (
              <button
                key={packs} type="button" aria-pressed={count === packs * packSize}
                onClick={() => setQuantity(String(packs * packSize))}
                className={`min-h-11 rounded-md border px-2 py-3 text-sm ${count === packs * packSize ? 'border-slate-700 bg-slate-700 font-semibold text-white' : 'border-border bg-white text-fg'}`}
              >{packs}판 · {packs * packSize}알</button>
            ))}
          </div>
          <label htmlFor="egg-charge-count" className="mt-5 mb-2 block text-sm font-medium">충전할 알 개수</label>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="1판 줄이기" disabled={!valid || count <= MIN_CHARGE_EGGS} onClick={() => setQuantity(String(count - packSize))} className={styles.quantityButton}>−</button>
            <input
              id="egg-charge-count" type="number" inputMode="numeric" min={MIN_CHARGE_EGGS} max={MAX_CHARGE_EGGS} step={packSize}
              value={quantity} onChange={e => setQuantity(e.target.value)} aria-invalid={!valid} aria-describedby="egg-charge-rule"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border px-3 text-center text-lg font-semibold tabular-nums"
            />
            <button type="button" aria-label="1판 늘리기" disabled={!valid || count >= MAX_CHARGE_EGGS} onClick={() => setQuantity(String(count + packSize))} className={styles.quantityButton}>+</button>
          </div>
          <p id="egg-charge-rule" className={`mt-2 text-sm ${valid ? 'text-muted' : 'text-red-700'}`}>{EGG_CHARGE_RULE}</p>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
            <div><p className="text-sm text-muted">입금 금액</p><p className="mt-1 text-sm text-muted">{valid ? `${count / packSize}판 · ${count.toLocaleString('ko-KR')}알` : '수량을 확인해 주세요'}</p></div>
            <p className="break-all text-3xl font-bold tabular-nums tracking-tight text-slate-800" aria-live="polite">{valid ? `${(count * unitPrice).toLocaleString('ko-KR')}원` : '—'}</p>
          </div>
        </section>
        <PortalLoadState label="충전 설정" error={error} loading={!data && !error} retry={refresh} />
        {current && (account ? (
          <section className={styles.chargePanel} aria-labelledby="charge-account-title">
            <h2 id="charge-account-title" className="font-semibold">입금 계좌</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className={styles.accountRow}><dt>은행</dt><dd>{account.bankName}</dd></div>
              <div className={styles.accountRow}><dt>계좌번호</dt><dd className="select-all font-semibold tabular-nums">{account.accountNumber}</dd></div>
              <div className={styles.accountRow}><dt>예금주</dt><dd>{account.accountHolder}</dd></div>
            </dl>
            <button type="button" onClick={copyAccount} className="mt-4 min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">계좌번호 복사</button>
            {copyNotice && <p role={copyNotice.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${copyNotice.ok ? 'text-muted' : 'text-red-700'}`}>{copyNotice.text}</p>}
            <div className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-muted">
              <p>입금자명은 <strong className="font-semibold text-fg">{current.depositorName}</strong>으로 입력해 주세요.</p>
              <p className="mt-2">관리자가 입금을 확인한 뒤 알을 충전합니다. 입금자명이 다르거나 충전 확인이 필요하면 관리자에게 알려 주세요.</p>
              <PortalSupportLink className="mt-2">충전 문의</PortalSupportLink>
            </div>
          </section>
        ) : (
          <section className={styles.chargePanel}>
            <h2 className="font-semibold">충전 계좌를 준비 중입니다</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">아직 등록된 입금 계좌가 없습니다. 관리자에게 충전을 문의해 주세요.</p>
            <PortalSupportLink className="mt-2">충전 문의</PortalSupportLink>
          </section>
        ))}
      </div>
    </main>
  );
}
