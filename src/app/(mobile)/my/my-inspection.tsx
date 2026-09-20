'use client';

import Link from 'next/link';
import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import LogoutButton from '@/components/LogoutButton';
import PortalLoadState from '@/components/PortalLoadState';
import PortalSupportLink from '@/components/PortalSupportLink';
import BankAccountCard from '@/components/BankAccountCard';
import { buttonClasses } from '@/components/Button';
import { usePolling } from '@/components/usePolling';
import { requestError } from '@/lib/clientApi';
import type { PublicBankAccount } from '@/lib/inspectionAccount';
import type { PlanView, QuarterView } from '@/lib/inspectionView';
import { PLAN_STATUS_LABEL, VISIT_STATUS_LABEL } from '@/lib/inspectionView';
import {
  INSPECTION_MIN_LEAD_DAYS,
  INSPECTION_VISITS_PER_TERM,
  TIME_SLOTS,
  TIME_SLOT_LABEL,
  TIME_SLOT_RANGE,
  TIME_SLOT_SHORT,
  type TimeSlot,
  addDays,
  formatPhone,
  formatVisitDate,
  formatWon,
  isDateString,
  todayKst,
} from '@/lib/inspection';

type MyInspectionData = {
  name: string;
  priceWon: number;
  account: PublicBankAccount | null;
  plan: PlanView | null;
};

const inputClass =
  'w-full rounded-xl border border-border p-3 text-base transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

const STATUS_TONE: Record<PlanView['status'], string> = {
  PENDING_PAYMENT: 'border-amber-200 bg-amber-50 text-amber-900',
  ACTIVE: 'border-brand-200 bg-brand-50 text-brand-800',
  EXPIRED: 'border-border bg-neutral-50 text-muted',
  CANCELED: 'border-border bg-neutral-50 text-muted',
};

export default function MyInspection() {
  // 30초 폴링 — 관리자의 입금 확인이 이 화면에 반영되는 경로다(다른 실시간 요소는 없다).
  const { data, error, refresh } = usePolling<MyInspectionData>('/api/my/inspection', 30_000);
  const plan = data?.plan ?? null;

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <PageHeader
        title="내 정기 전기점검"
        right={<LogoutButton loginPath="/my/login" />}
      />

      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        <PortalLoadState
          label="점검 정보"
          error={error}
          loading={!data && !error}
          retry={refresh}
          stale={data != null}
        />

        {data && !plan && (
          <section className="rounded-2xl border border-border bg-white p-6 text-center">
            <h2 className="font-bold text-fg">아직 신청한 점검이 없어요</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              연 {formatWon(data.priceWon)}에 분기마다 1회씩, 1년 {INSPECTION_VISITS_PER_TERM}번
              전기를 점검해 드려요.
            </p>
            <Link
              href="/inspection/apply"
              className={buttonClasses('primary', 'md', 'mt-4 w-full')}
            >
              정기 전기점검 신청하기
            </Link>
          </section>
        )}

        {data && plan && (
          <>
            <section className={`rounded-2xl border p-5 ${STATUS_TONE[plan.status]}`}>
              <p className="text-xs font-bold">{PLAN_STATUS_LABEL[plan.status]}</p>
              <h2 className="mt-1 text-lg font-extrabold">
                {plan.status === 'PENDING_PAYMENT' && '입금을 기다리고 있어요'}
                {plan.status === 'ACTIVE' && `${plan.startDate} ~ ${plan.endDate}`}
                {plan.status === 'EXPIRED' && '이용 기간이 끝났어요'}
                {plan.status === 'CANCELED' && '구독이 취소되었어요'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed">
                {plan.status === 'PENDING_PAYMENT' &&
                  `아래 계좌로 ${formatWon(plan.priceWon)}을 입금해 주세요. 관리자가 확인하면 그날부터 1년이 시작됩니다.`}
                {plan.status === 'ACTIVE' &&
                  `분기마다 1회씩 총 ${INSPECTION_VISITS_PER_TERM}회 방문합니다. 회차별로 원하는 날짜를 직접 고르세요.`}
                {plan.status === 'EXPIRED' &&
                  '다시 신청하시면 확인된 날부터 새로 1년이 시작됩니다.'}
                {plan.status === 'CANCELED' &&
                  (plan.cancelReason ?? '자세한 내용은 고객센터로 문의해 주세요.')}
              </p>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 opacity-70">점검 주소</dt>
                  <dd className="font-medium">
                    {plan.address}
                    {plan.addressDetail ? ` ${plan.addressDetail}` : ''}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 opacity-70">연락처</dt>
                  <dd className="font-medium">
                    {plan.contactName} · {formatPhone(plan.contactPhone)}
                  </dd>
                </div>
              </dl>
              {(plan.status === 'EXPIRED' || plan.status === 'CANCELED') && (
                <Link
                  href="/inspection/apply"
                  className={buttonClasses('primary', 'md', 'mt-4 w-full')}
                >
                  다시 신청하기
                </Link>
              )}
            </section>

            {plan.status === 'PENDING_PAYMENT' && (
              <BankAccountCard
                account={data.account}
                amountWon={plan.priceWon}
                depositorName={plan.depositorName}
              />
            )}

            <section aria-labelledby="visits-title">
              <h2 id="visits-title" className="px-1 font-bold text-fg">
                방문 일정
              </h2>
              <p className="mt-1 px-1 text-sm text-muted">
                {plan.status === 'ACTIVE'
                  ? `날짜별 예약 인원 제한은 없어요. 방문 ${INSPECTION_MIN_LEAD_DAYS}일 전까지 바꿀 수 있어요.`
                  : '입금이 확인되면 회차별로 날짜를 고를 수 있어요.'}
              </p>
              <ul className="mt-3 space-y-2">
                {plan.quarters.map((quarter) => (
                  <QuarterCard
                    key={quarter.quarter}
                    quarter={quarter}
                    planStatus={plan.status}
                    onSaved={refresh}
                  />
                ))}
              </ul>
            </section>

            <PortalSupportLink className="px-1">점검 문의</PortalSupportLink>
          </>
        )}
      </div>
    </main>
  );
}

function QuarterCard({
  quarter,
  planStatus,
  onSaved,
}: {
  quarter: QuarterView;
  planStatus: PlanView['status'];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(quarter.visit?.date ?? '');
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(quarter.visit?.timeSlot ?? 'ANY');
  const [note, setNote] = useState(quarter.visit?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = todayKst();
  // 창의 시작일이 이미 지났으면 "모레부터"가 실질 하한이다 — 둘 중 늦은 쪽.
  const earliest = quarter.window
    ? [quarter.window.start, addDays(today, INSPECTION_MIN_LEAD_DAYS)].sort().at(-1)!
    : null;

  async function save() {
    if (busy) return;
    setError(null);
    if (!isDateString(date)) {
      setError('희망 날짜를 선택해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/my/inspection/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          quarter: quarter.quarter,
          date,
          timeSlot,
          note: note.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? '예약하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  }

  const visit = quarter.visit;
  return (
    <li className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-fg">{quarter.quarter}회차</h3>
        {visit && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              visit.status === 'COMPLETED'
                ? 'bg-neutral-100 text-muted'
                : visit.status === 'CANCELED'
                  ? 'bg-neutral-100 text-muted'
                  : quarter.needsReschedule
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-brand-50 text-brand-700'
            }`}
          >
            {quarter.needsReschedule ? '날짜 다시 선택' : VISIT_STATUS_LABEL[visit.status]}
          </span>
        )}
      </div>

      {quarter.window && (
        <p className="mt-1 text-xs text-muted">
          예약 가능 기간 {quarter.window.start} ~ {quarter.window.lastDay}
        </p>
      )}

      <p className="mt-2 text-sm">
        {visit ? (
          <span className={quarter.needsReschedule ? 'text-muted line-through' : 'font-semibold text-fg'}>
            {formatVisitDate(visit.date)} · {TIME_SLOT_LABEL[visit.timeSlot]}
          </span>
        ) : (
          <span className="text-muted">아직 날짜를 정하지 않았어요.</span>
        )}
      </p>

      {quarter.needsReschedule && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          선택하신 날짜가 지났어요. 이 회차의 날짜를 다시 골라 주세요.
        </p>
      )}

      {planStatus === 'ACTIVE' && quarter.bookable && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses('secondary', 'sm', 'mt-3 w-full')}
        >
          {visit ? '날짜 변경' : '날짜 정하기'}
        </button>
      )}

      {planStatus === 'ACTIVE' && !quarter.bookable && visit?.status !== 'COMPLETED' && (
        <p className="mt-3 text-xs text-muted">
          이 회차는 예약 가능 기간이 지나 날짜를 바꿀 수 없어요. 고객센터로 문의해 주세요.
        </p>
      )}

      {open && quarter.window && (
        <div className="mt-3 space-y-3 rounded-xl bg-neutral-50 p-3">
          <div>
            <label
              htmlFor={`visit-date-${quarter.quarter}`}
              className="mb-1 block text-sm font-medium"
            >
              희망 날짜
            </label>
            <input
              id={`visit-date-${quarter.quarter}`}
              type="date"
              value={date}
              min={earliest ?? undefined}
              max={quarter.window.lastDay}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">희망 시간대</span>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={timeSlot === slot}
                  aria-label={TIME_SLOT_LABEL[slot]}
                  onClick={() => setTimeSlot(slot)}
                  className={`min-h-14 rounded-xl border px-2 py-1.5 text-sm font-semibold transition ${
                    timeSlot === slot
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-border bg-white text-fg'
                  }`}
                >
                  <span className="block">{TIME_SLOT_SHORT[slot]}</span>
                  <span className="block text-xs font-normal opacity-75">
                    {TIME_SLOT_RANGE[slot]}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label
              htmlFor={`visit-note-${quarter.quarter}`}
              className="mb-1 block text-sm font-medium"
            >
              요청사항 <span className="font-normal text-muted">(선택)</span>
            </label>
            <textarea
              id={`visit-note-${quarter.quarter}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              className={inputClass}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className={buttonClasses('secondary', 'sm', 'flex-1')}
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={buttonClasses('primary', 'sm', 'flex-1')}
            >
              {busy ? '저장 중…' : '이 날짜로 예약'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
