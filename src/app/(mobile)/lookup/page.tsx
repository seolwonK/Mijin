'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import TrackStepper from '@/components/TrackStepper';
import { StatusPill, UrgencyPill } from '@/components/StatusPill';
import { buttonClasses } from '@/components/Button';
import { MapPinIcon, PhoneIcon } from '@/components/icons';

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
  assignee: { kind: 'PROVIDER' | 'TECHNICIAN'; name: string; phone: string } | null;
};

// TrackStepper와 동일한 5단계 순서(접수→배정→수락→출동→완료) — StatusPill의 상태 키를 그대로 따른다.
const STEP_INDEX: Record<string, number> = {
  RECEIVED: 0,
  ASSIGNED: 1,
  ACCEPTED: 2,
  DISPATCHED: 3,
  COMPLETED: 4,
};

function RequestCard({ r }: { r: LookupRequest }) {
  return (
    <Surface className="space-y-4 rounded-2xl p-4 md:p-5">
      <div className="flex items-center justify-between">
        <span className="font-bold text-fg">접수번호 {r.lookupCode}</span>
        <div className="flex items-center gap-2">
          <UrgencyPill urgency={r.urgency} />
          <StatusPill status={r.status} />
        </div>
      </div>

      {r.status === 'CANCELED' ? (
        <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-600">
          이 접수는 취소되었습니다.
        </p>
      ) : (
        <TrackStepper currentIndex={STEP_INDEX[r.status] ?? 0} />
      )}

      <div className="space-y-1 text-sm text-neutral-600">
        <p className="whitespace-pre-wrap">{r.description}</p>
        {r.address && (
          <p className="flex items-center gap-1">
            <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
            {r.address}
          </p>
        )}
        <p>접수 시각: {new Date(r.createdAt).toLocaleString('ko-KR')}</p>
      </div>

      {r.assignee && (
        <div className="rounded-xl bg-brand-50 p-3">
          <p className="text-sm text-neutral-600">
            배정 {r.assignee.kind === 'TECHNICIAN' ? '기술자' : '업체'}
          </p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-bold text-fg">{r.assignee.name}</span>
            <a
              href={`tel:${r.assignee.phone}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white"
            >
              <PhoneIcon className="h-3.5 w-3.5" />
              전화하기
            </a>
          </div>
        </div>
      )}
    </Surface>
  );
}

export default function LookupPage() {
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<LookupRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(silent = false, override?: string) {
    const p = (override ?? phone).trim();
    if (!p) return;
    if (!silent) {
      setBusy(true);
      setError(null);
    }
    try {
      const res = await fetch('/api/requests/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!silent) setError(data.error ?? '조회에 실패했습니다');
        return;
      }
      setResults(data.requests);
      // 다음 방문 때 재입력하지 않도록 마지막 조회 번호를 기억한다.
      try {
        localStorage.setItem('lookup_phone', p);
      } catch {
        // 저장 실패(프라이빗 모드 등)는 무시
      }
    } catch {
      if (!silent) setError('네트워크 오류가 발생했습니다');
    } finally {
      if (!silent) setBusy(false);
    }
  }

  // 접수완료 화면에서 넘어온 ?phone= 또는 지난 조회 번호가 있으면 자동으로 채우고 바로 조회한다.
  useEffect(() => {
    let initial: string | null = null;
    try {
      initial =
        new URLSearchParams(window.location.search).get('phone') ||
        localStorage.getItem('lookup_phone');
    } catch {
      initial = null;
    }
    if (initial) {
      // 마운트 시 1회 자동 채움·조회 (앱 전반의 usePolling 패턴과 동일)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhone(initial);
      lookup(false, initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <PageHeader title="접수 내역 조회" back="/" width="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:space-y-5 md:py-8">
        <form
          className="flex flex-col gap-2 md:rounded-2xl md:bg-white md:p-5 md:shadow-surface-sm"
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
        >
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="접수하신 전화번호"
              className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none md:flex-1"
            />
            <button
              type="submit"
              disabled={busy || !phone.trim()}
              className="w-full rounded-xl bg-brand-600 p-4 font-bold text-white transition-colors enabled:hover:bg-brand-700 disabled:opacity-50 md:w-40 md:p-3"
            >
              {busy ? '조회 중…' : '조회하기'}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}
        </form>

        {results && results.length === 0 && (
          <div className="space-y-3 rounded-xl bg-neutral-50 p-6 text-center md:bg-white md:py-10 md:shadow-surface-sm">
            <p className="text-sm text-muted">이 번호로 접수된 내역이 없습니다</p>
            <Link href="/request/new" className={buttonClasses('secondary', 'sm')}>
              새로 접수하기
            </Link>
          </div>
        )}
        {results && results.length > 0 && (
          <div className="space-y-3">
            {results.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
            <div className="pt-1 text-center">
              <Link
                href="/request/new"
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                새로 접수하기 →
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
