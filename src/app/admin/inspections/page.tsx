'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { usePolling } from '@/components/usePolling';
import { useConfirm } from '@/components/useConfirm';
import PortalLoadState from '@/components/PortalLoadState';
import { PLAN_STATUS_LABEL, VISIT_STATUS_LABEL, type PlanView } from '@/lib/inspectionView';
import {
  INSPECTION_PRICE_WON,
  TIME_SLOT_LABEL,
  type TimeSlot,
  formatPhone,
  formatShortDate,
  formatVisitDate,
  formatWon,
} from '@/lib/inspection';

type PlanRow = PlanView & { loginId: string; userName: string };

type ScheduleRow = {
  visitId: string;
  planId: string;
  date: string;
  quarter: number;
  timeSlot: TimeSlot;
  status: 'REQUESTED' | 'SCHEDULED';
  note: string | null;
  adminMemo: string | null;
  contactName: string;
  contactPhone: string;
  address: string;
  addressDetail: string | null;
};

type InspectionsData = {
  today: string;
  pendingCount: number;
  plans: PlanRow[];
  schedule: ScheduleRow[];
};

const STATUS_TONE: Record<PlanView['status'], string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  ACTIVE: 'bg-brand-50 text-brand-700',
  EXPIRED: 'bg-neutral-100 text-muted',
  CANCELED: 'bg-neutral-100 text-muted',
};

const cellClass = 'px-3 py-2 align-top text-sm';
const headClass = 'px-3 py-2 text-left text-xs font-semibold text-muted';

// 점검 구독 운영 화면. 관리자가 여기서 하는 일은 두 가지뿐이다 —
//   ① 입금을 확인해 구독을 시작시킨다  ② 누가 언제 예약했는지 보고 기사를 보낸다.
// 기사 배정을 시스템이 하지 않기로 했으므로(사용자 결정 2026-09-20) 후보 추천·배정 UI 가 없고,
// 방문 담당자는 일정표의 '담당 메모' 자유 입력으로 남긴다.
export default function AdminInspectionsPage() {
  const { data, error, refresh } = usePolling<InspectionsData>(
    '/api/admin/inspections',
    20_000,
  );
  const [tab, setTab] = useState<'plans' | 'schedule'>('plans');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, confirmUI] = useConfirm('admin');

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? '처리하지 못했습니다');
  }

  async function confirmPayment(plan: PlanRow) {
    if (
      !(await confirm({
        title: '입금 확인',
        message: `${plan.userName}님(입금자명 ${plan.depositorName})의 ${formatWon(plan.priceWon)} 입금을 확인했습니까? 확인하면 오늘부터 1년이 시작되고 고객에게 문자가 발송됩니다.`,
        confirmText: '입금 확인',
      }))
    )
      return;
    setBusyId(plan.id);
    setActionError(null);
    try {
      await post(`/api/admin/inspections/${plan.id}/confirm-payment`);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '처리하지 못했습니다');
    } finally {
      setBusyId(null);
    }
  }

  async function cancelPlan(plan: PlanRow) {
    const reason = window.prompt(`${plan.userName}님의 구독을 취소합니다. 사유를 입력해 주세요.`);
    if (reason == null) return;
    if (!reason.trim()) {
      setActionError('취소 사유를 입력해 주세요');
      return;
    }
    setBusyId(plan.id);
    setActionError(null);
    try {
      await post(`/api/admin/inspections/${plan.id}/cancel`, { reason: reason.trim() });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '처리하지 못했습니다');
    } finally {
      setBusyId(null);
    }
  }

  async function patchVisit(
    visitId: string,
    body: { status?: string; adminMemo?: string | null },
  ) {
    setBusyId(visitId);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/inspections/visits/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? '처리하지 못했습니다');
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '처리하지 못했습니다');
    } finally {
      setBusyId(null);
    }
  }

  const plans = data?.plans ?? [];
  const schedule = data?.schedule ?? [];

  return (
    <main className="min-h-screen">
      <PageHeader title="정기 점검" width="max-w-6xl" />
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-admin-md border border-border bg-white px-4 py-3">
            <p className="text-xs text-muted">입금 대기</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-amber-700">
              {data ? data.pendingCount : '—'}건
            </p>
          </div>
          <div className="rounded-admin-md border border-border bg-white px-4 py-3">
            <p className="text-xs text-muted">연회비</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">
              {formatWon(INSPECTION_PRICE_WON)}
            </p>
          </div>
          <div className="ml-auto flex gap-1 rounded-admin-md border border-border bg-white p-1">
            {(
              [
                ['plans', `구독 ${plans.length}`],
                ['schedule', `방문 일정 ${schedule.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`min-h-11 rounded-admin-md px-4 text-sm font-semibold ${
                  tab === key ? 'bg-admin-cyan-ink text-white' : 'text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <PortalLoadState
          label="점검 구독"
          error={error}
          loading={!data && !error}
          retry={refresh}
          stale={data != null}
        />
        {actionError && (
          <p role="alert" className="rounded-admin-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        {tab === 'plans' && data && (
          <div className="overflow-x-auto rounded-admin-md border border-border bg-white">
            <table className="w-full min-w-[60rem] border-collapse">
              <thead className="border-b border-border bg-neutral-50">
                <tr>
                  <th className={headClass}>상태</th>
                  <th className={headClass}>신청자</th>
                  <th className={headClass}>연락처</th>
                  <th className={headClass}>점검 주소</th>
                  <th className={headClass}>입금자명</th>
                  <th className={headClass}>이용 기간</th>
                  <th className={headClass}>회차 예약</th>
                  <th className={headClass}>처리</th>
                </tr>
              </thead>
              <tbody>
                {plans.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                      신청된 정기 점검이 없습니다.
                    </td>
                  </tr>
                )}
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b border-border last:border-0">
                    <td className={cellClass}>
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[plan.status]}`}
                      >
                        {PLAN_STATUS_LABEL[plan.status]}
                      </span>
                      <p className="mt-1 text-xs text-muted">
                        {plan.createdAt.slice(0, 10)} 신청
                      </p>
                    </td>
                    <td className={cellClass}>
                      <p className="font-semibold">{plan.contactName}</p>
                      <p className="text-xs text-muted">{plan.loginId}</p>
                    </td>
                    <td className={cellClass}>{formatPhone(plan.contactPhone)}</td>
                    <td className={`${cellClass} max-w-[18rem]`}>
                      <p className="break-words">{plan.address}</p>
                      {plan.addressDetail && (
                        <p className="text-xs text-muted">{plan.addressDetail}</p>
                      )}
                      {plan.memo && (
                        <p className="mt-1 text-xs text-muted">요청: {plan.memo}</p>
                      )}
                    </td>
                    <td className={cellClass}>{plan.depositorName}</td>
                    <td className={`${cellClass} whitespace-nowrap`}>
                      {plan.startDate ? (
                        <>
                          <p className="tabular-nums">{plan.startDate}</p>
                          <p className="text-xs text-muted tabular-nums">~ {plan.endDate}</p>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={cellClass}>
                      <div className="flex gap-1">
                        {plan.quarters.map((q) => (
                          <span
                            key={q.quarter}
                            title={
                              q.visit
                                ? `${q.quarter}회차 ${formatVisitDate(q.visit.date)} · ${VISIT_STATUS_LABEL[q.visit.status]}`
                                : `${q.quarter}회차 미정`
                            }
                            className={`inline-flex min-w-[3.25rem] flex-col items-center rounded-md border px-1.5 py-1 text-[11px] leading-tight ${
                              q.visit?.status === 'COMPLETED'
                                ? 'border-brand-200 bg-brand-50 text-brand-700'
                                : q.visit
                                  ? 'border-border bg-white'
                                  : 'border-dashed border-neutral-300 text-neutral-400'
                            }`}
                          >
                            <span className="font-semibold">{q.quarter}회</span>
                            <span className="tabular-nums">
                              {q.visit ? formatShortDate(q.visit.date) : '미정'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={cellClass}>
                      <div className="flex flex-col gap-1">
                        {plan.status === 'PENDING_PAYMENT' && (
                          <button
                            type="button"
                            disabled={busyId === plan.id}
                            onClick={() => confirmPayment(plan)}
                            className={buttonClasses('primary', 'sm', 'whitespace-nowrap')}
                          >
                            {busyId === plan.id ? '처리 중…' : '입금 확인'}
                          </button>
                        )}
                        {(plan.status === 'PENDING_PAYMENT' || plan.status === 'ACTIVE') && (
                          <button
                            type="button"
                            disabled={busyId === plan.id}
                            onClick={() => cancelPlan(plan)}
                            className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
                          >
                            구독 취소
                          </button>
                        )}
                        {plan.status === 'CANCELED' && plan.cancelReason && (
                          <span className="text-xs text-muted">{plan.cancelReason}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'schedule' && data && (
          <div className="space-y-3">
            {schedule.length === 0 && (
              <p className="rounded-admin-md border border-border bg-white px-4 py-8 text-center text-sm text-muted">
                예정된 방문이 없습니다.
              </p>
            )}
            {schedule.map((visit) => (
              <ScheduleCard
                key={visit.visitId}
                visit={visit}
                today={data.today}
                busy={busyId === visit.visitId}
                onPatch={patchVisit}
              />
            ))}
          </div>
        )}
      </div>
      {confirmUI}
    </main>
  );
}

function ScheduleCard({
  visit,
  today,
  busy,
  onPatch,
}: {
  visit: ScheduleRow;
  today: string;
  busy: boolean;
  onPatch: (
    visitId: string,
    body: { status?: string; adminMemo?: string | null },
  ) => Promise<void>;
}) {
  const [memo, setMemo] = useState(visit.adminMemo ?? '');
  const dirty = (visit.adminMemo ?? '') !== memo;
  const isToday = visit.date === today;
  const isPast = visit.date < today;

  return (
    <article
      className={`rounded-admin-md border bg-white p-4 ${
        isToday ? 'border-admin-cyan-ink' : isPast ? 'border-amber-300' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[8.5rem]">
          <p className="text-lg font-bold tabular-nums">{formatVisitDate(visit.date)}</p>
          <p className="text-sm text-muted">{TIME_SLOT_LABEL[visit.timeSlot]}</p>
          <p className="mt-1 text-xs">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold">
              {visit.quarter}회차
            </span>{' '}
            {isToday && <span className="font-semibold text-admin-cyan-ink">오늘</span>}
            {isPast && <span className="font-semibold text-amber-700">지난 일정</span>}
          </p>
        </div>
        <div className="min-w-[14rem] flex-1">
          <p className="font-semibold">
            {visit.contactName} · {formatPhone(visit.contactPhone)}
          </p>
          <p className="text-sm text-muted">
            {visit.address}
            {visit.addressDetail ? ` ${visit.addressDetail}` : ''}
          </p>
          {visit.note && <p className="mt-1 text-sm text-muted">요청: {visit.note}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch(visit.visitId, { status: 'COMPLETED' })}
            className={buttonClasses('primary', 'sm', 'whitespace-nowrap')}
          >
            점검 완료
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch(visit.visitId, { status: 'CANCELED' })}
            className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
          >
            취소
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <label htmlFor={`memo-${visit.visitId}`} className="text-xs font-semibold text-muted">
          담당 메모
        </label>
        <input
          id={`memo-${visit.visitId}`}
          value={memo}
          maxLength={300}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="방문할 기사·차량 등"
          className="min-h-11 min-w-0 flex-1 rounded-admin-md border border-border px-3 text-sm"
        />
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => onPatch(visit.visitId, { adminMemo: memo })}
          className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
        >
          {busy ? '저장 중…' : '메모 저장'}
        </button>
      </div>
    </article>
  );
}
