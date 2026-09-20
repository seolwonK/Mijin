'use client';

import { useState } from 'react';
import type { PublicBankAccount } from '@/lib/inspectionAccount';
import { formatWon } from '@/lib/inspection';

// 입금 계좌 안내 카드. 랜딩(서버 컴포넌트)과 마이페이지(클라이언트) 양쪽에서 같은 모양으로
// 쓰려고 클라이언트 아일랜드로 만들었다 — 계좌번호 복사 버튼이 있어 어차피 클라이언트가 필요하다.
//
// 계좌가 없으면 "준비 중"으로 떨어진다. 반쯤 입력된 계좌를 노출하지 않는 것이 요점이라
// 판정은 lib/inspectionAccount.ts 의 toPublicAccount 한 곳에서만 한다.
export default function BankAccountCard({
  account,
  amountWon,
  depositorName,
  className = '',
}: {
  account: PublicBankAccount | null;
  amountWon?: number;
  depositorName?: string;
  className?: string;
}) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function copy() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.accountNumber.replace(/[ -]/g, ''));
      setNotice({ ok: true, text: '계좌번호를 복사했습니다.' });
    } catch {
      setNotice({
        ok: false,
        text: '복사하지 못했습니다. 계좌번호를 길게 눌러 직접 복사해 주세요.',
      });
    }
  }

  if (!account) {
    return (
      <section className={`rounded-2xl border border-border bg-white p-5 ${className}`}>
        <h3 className="font-bold text-fg">입금 계좌를 준비 중입니다</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          아직 등록된 입금 계좌가 없습니다. 신청은 그대로 진행하시면 되고, 계좌가 준비되는 대로
          문자로 안내해 드립니다.
        </p>
      </section>
    );
  }

  return (
    <section className={`rounded-2xl border border-brand-200 bg-brand-50 p-5 ${className}`}>
      <h3 className="font-bold text-fg">입금 계좌</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-muted">은행</dt>
          <dd className="text-right font-semibold text-fg">{account.bankName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-muted">계좌번호</dt>
          <dd className="text-right font-bold tabular-nums text-fg select-all">
            {account.accountNumber}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-muted">예금주</dt>
          <dd className="text-right font-semibold text-fg">{account.accountHolder}</dd>
        </div>
        {amountWon != null && (
          <div className="flex items-baseline justify-between gap-3 border-t border-brand-200 pt-2">
            <dt className="shrink-0 text-muted">입금 금액</dt>
            <dd className="text-right text-lg font-bold tabular-nums text-brand-700">
              {formatWon(amountWon)}
            </dd>
          </div>
        )}
        {depositorName && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-muted">입금자명</dt>
            <dd className="text-right font-semibold text-fg">{depositorName}</dd>
          </div>
        )}
      </dl>
      <button
        type="button"
        onClick={copy}
        className="mt-4 min-h-11 w-full rounded-xl border border-brand-300 bg-white px-4 text-sm font-semibold text-brand-700"
      >
        계좌번호 복사
      </button>
      {notice && (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`mt-2 text-sm ${notice.ok ? 'text-muted' : 'text-red-700'}`}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}
