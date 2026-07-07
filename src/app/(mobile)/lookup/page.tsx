'use client';

import { useEffect, useState } from 'react';
import BackButton from '@/components/BackButton';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';

type LookupRequest = {
  id: string;
  lookupCode: string;
  customerName: string;
  status: string;
  urgency: string;
  description: string;
  address: string | null;
  createdAt: string;
  completedAt: string | null;
  provider: { name: string; phone: string } | null;
};

const STEPS = ['접수', '배정', '수락', '출동', '완료'];
const STEP_INDEX: Record<string, number> = {
  RECEIVED: 0,
  ASSIGNED: 1,
  ACCEPTED: 2,
  DISPATCHED: 3,
  COMPLETED: 4,
};

function Timeline({ status }: { status: string }) {
  const stepIndex = STEP_INDEX[status] ?? 0;
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => (
        <div key={step} className="flex flex-1 flex-col items-center">
          <div className="flex w-full items-center">
            <div
              className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : i <= stepIndex ? 'bg-blue-500' : 'bg-gray-200'}`}
            />
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i < stepIndex
                  ? 'bg-blue-500 text-white'
                  : i === stepIndex
                    ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < stepIndex ? '✓' : i + 1}
            </div>
            <div
              className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'bg-transparent' : i < stepIndex ? 'bg-blue-500' : 'bg-gray-200'}`}
            />
          </div>
          <span
            className={`mt-1 text-xs ${i === stepIndex ? 'font-bold text-blue-600' : 'text-gray-500'}`}
          >
            {step}
          </span>
        </div>
      ))}
    </div>
  );
}

function RequestCard({ r }: { r: LookupRequest }) {
  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className="font-bold">접수번호 {r.lookupCode}</span>
        <div className="flex gap-1">
          <UrgencyBadge urgency={r.urgency} />
          <StatusBadge status={r.status} />
        </div>
      </div>

      {r.status === 'CANCELED' ? (
        <p className="rounded-xl bg-gray-100 p-3 text-sm text-gray-600">
          이 접수는 취소되었습니다.
        </p>
      ) : (
        <Timeline status={r.status} />
      )}

      <div className="space-y-1 text-sm text-gray-600">
        <p className="whitespace-pre-wrap">{r.description}</p>
        {r.address && <p>📍 {r.address}</p>}
        <p>접수 시각: {new Date(r.createdAt).toLocaleString('ko-KR')}</p>
      </div>

      {r.provider && (
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-sm text-gray-600">배정 업체</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-bold">{r.provider.name}</span>
            <a
              href={`tel:${r.provider.phone}`}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white"
            >
              📞 전화하기
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LookupPage() {
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<LookupRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(silent = false) {
    if (!silent) {
      setBusy(true);
      setError(null);
    }
    try {
      const res = await fetch('/api/requests/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!silent) setError(data.error ?? '조회에 실패했습니다');
        return;
      }
      setResults(data.requests);
    } catch {
      if (!silent) setError('네트워크 오류가 발생했습니다');
    } finally {
      if (!silent) setBusy(false);
    }
  }

  // 진행중인 건이 있으면 15초 폴링
  const hasActive = (results ?? []).some(
    (r) => r.status !== 'COMPLETED' && r.status !== 'CANCELED',
  );
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => lookup(true), 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive, phone]);

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <BackButton fallback="/" />
        <h1 className="text-lg font-bold">접수 내역 조회</h1>
      </header>

      <div className="space-y-4 p-4">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
        >
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="접수하신 전화번호"
            className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !phone.trim()}
            className="w-full rounded-xl bg-blue-600 p-4 font-bold text-white disabled:opacity-50"
          >
            {busy ? '조회 중…' : '조회하기'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        {results && results.length === 0 && (
          <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-400">
            이 번호로 접수된 내역이 없습니다
          </p>
        )}
        {results && results.length > 0 && (
          <div className="space-y-3">
            {results.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
