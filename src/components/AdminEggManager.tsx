'use client';

// 알 크레딧 관리 섹션 (어드민 기술자·업체 상세 공용) — 잔액·충전·정정·장부.
// 충전은 chargeKey(UUID) 멱등 — 폼 오픈 시 1회 발급해 더블서브밋을 방어한다.
// 조회는 하우스 패턴 usePolling(30초) — effect 내 즉시 setState 부채를 만들지 않는다.
// 모노크롬 프로 문법: admin 토큰, 장식 없음, ease-portal.
import { useState } from 'react';
import { EggIcon } from '@/components/EggIcon';
import { usePolling } from '@/components/usePolling';

// 원화 표기는 "결제(충전) 폼" 한정 — 잔액·이력 등 보유 표기는 알 개수로만 한다(정책).
const EGG_PRICE = 10_000; // 1알 = ₩10,000 (충전 결제 단가)
const MIN_CHARGE = 3;

type LedgerRow = {
  id: string;
  delta: number;
  reason: 'CHARGE' | 'ACCEPT_SPEND' | 'ADMIN_ADJUST';
  memo: string | null;
  actorAdminUserId: string | null;
  assignmentId: string | null;
  createdAt: string;
};

const REASON_LABEL: Record<LedgerRow['reason'], string> = {
  CHARGE: '충전',
  ACCEPT_SPEND: '수락 차감',
  ADMIN_ADJUST: '정정',
};

export default function AdminEggManager({
  kind,
  targetId,
}: {
  kind: 'PROVIDER' | 'TECHNICIAN';
  targetId: string;
}) {
  const { data, refresh } = usePolling<{ balance: number; ledger: LedgerRow[] }>(
    `/api/admin/eggs?kind=${kind}&id=${targetId}`,
    30_000,
  );
  const balance = data?.balance ?? null;
  const ledger = data?.ledger ?? [];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [chargeCount, setChargeCount] = useState(MIN_CHARGE);
  const [chargeMemo, setChargeMemo] = useState('');
  const [chargeKey, setChargeKey] = useState(() => crypto.randomUUID());

  const [adjustDelta, setAdjustDelta] = useState(0);
  const [adjustMemo, setAdjustMemo] = useState('');

  async function mutate(payload: Record<string, unknown>, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/eggs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id: targetId, ...payload }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? '처리에 실패했습니다');
        return;
      }
      after();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-admin-md border border-border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-admin-cyan-ink">알 크레딧</h2>
        <p className="inline-flex items-center gap-1.5 font-mono text-sm">
          잔액 <EggIcon size={18} />
          <span className="text-lg font-bold">{balance ?? '–'}알</span>
        </p>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <form
          className="rounded-admin-sm border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate({ action: 'charge', count: chargeCount, memo: chargeMemo, chargeKey }, () => {
              setChargeMemo('');
              setChargeKey(crypto.randomUUID()); // 다음 충전을 위한 새 멱등 키
            });
          }}
        >
          <p className="mb-2 text-xs font-bold text-muted">
            충전 (최소 {MIN_CHARGE}알 · 1알 = ₩{EGG_PRICE.toLocaleString()})
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={MIN_CHARGE}
              step={1}
              value={chargeCount}
              onChange={(e) => setChargeCount(Number(e.target.value))}
              className="w-20 rounded-admin-sm border border-border px-2 py-1.5 font-mono text-sm focus:border-admin-cyan-ink focus:outline-none"
              aria-label="충전 알 수"
            />
            <span className="font-mono text-xs text-muted">
              결제 금액 <span className="font-bold text-fg">₩{(chargeCount * EGG_PRICE || 0).toLocaleString()}</span>
            </span>
          </div>
          <input
            type="text"
            value={chargeMemo}
            onChange={(e) => setChargeMemo(e.target.value)}
            placeholder="사유 (필수 — 예: 8/14 무통장 입금 확인)"
            className="mt-2 w-full rounded-admin-sm border border-border px-2 py-1.5 text-sm focus:border-admin-cyan-ink focus:outline-none"
            aria-label="충전 사유"
          />
          <button
            type="submit"
            disabled={busy || chargeCount < MIN_CHARGE || !chargeMemo.trim()}
            className="mt-2 rounded-admin-sm bg-admin-cyan-ink px-3 py-1.5 text-sm font-bold text-white transition-colors ease-portal disabled:opacity-50"
          >
            충전
          </button>
        </form>

        <form
          className="rounded-admin-sm border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate({ action: 'adjust', delta: adjustDelta, memo: adjustMemo }, () => {
              setAdjustDelta(0);
              setAdjustMemo('');
            });
          }}
        >
          <p className="mb-2 text-xs font-bold text-muted">정정 (양수 = 증액 · 음수 = 감액, 잔액 미만 감액 불가)</p>
          <input
            type="number"
            step={1}
            value={adjustDelta}
            onChange={(e) => setAdjustDelta(Number(e.target.value))}
            className="w-24 rounded-admin-sm border border-border px-2 py-1.5 font-mono text-sm focus:border-admin-cyan-ink focus:outline-none"
            aria-label="정정 delta"
          />
          <input
            type="text"
            value={adjustMemo}
            onChange={(e) => setAdjustMemo(e.target.value)}
            placeholder="사유 (필수 — 예: 오충전 환불)"
            className="mt-2 w-full rounded-admin-sm border border-border px-2 py-1.5 text-sm focus:border-admin-cyan-ink focus:outline-none"
            aria-label="정정 사유"
          />
          <button
            type="submit"
            disabled={busy || adjustDelta === 0 || !adjustMemo.trim()}
            className="mt-2 rounded-admin-sm border border-admin-cyan-ink px-3 py-1.5 text-sm font-bold text-admin-cyan-ink transition-colors ease-portal disabled:opacity-50"
          >
            정정
          </button>
        </form>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-bold text-muted">변동 이력 (최근 50건)</p>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted">이력이 없습니다</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-1.5 pr-3 font-medium">일시</th>
                  <th className="py-1.5 pr-3 font-medium">구분</th>
                  <th className="py-1.5 pr-3 text-right font-medium">변동</th>
                  <th className="py-1.5 font-medium">사유</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 font-mono text-muted">
                      {new Date(row.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-1.5 pr-3">{REASON_LABEL[row.reason]}</td>
                    <td className={`py-1.5 pr-3 text-right font-mono font-bold ${row.delta > 0 ? 'text-admin-cyan-ink' : 'text-red-600'}`}>
                      {row.delta > 0 ? `+${row.delta}` : row.delta}
                    </td>
                    <td className="py-1.5 text-muted">{row.memo ?? (row.assignmentId ? `배정 ${row.assignmentId.slice(0, 8)}…` : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
