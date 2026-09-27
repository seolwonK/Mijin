'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { usePolling } from '@/components/usePolling';
import { useConfirm } from '@/components/useConfirm';
import PortalLoadState from '@/components/PortalLoadState';
import { requestError } from '@/lib/clientApi';
import { PLAN_STATUS_LABEL, VISIT_STATUS_LABEL, type PlanView } from '@/lib/inspectionView';
import {
  INSPECTION_PRICE_WON,
  TIME_SLOTS,
  TIME_SLOT_LABEL,
  type TimeSlot,
  type VisitStatus,
  formatPhone,
  formatDateRange,
  formatShortDate,
  formatVisitDate,
  formatWon,
  daysBetween,
  fromDateString,
  isDateString,
} from '@/lib/inspection';

type PlanRow = PlanView & { loginId: string; userName: string };

type ScheduleRow = {
  visitId: string;
  planId: string;
  date: string;
  quarter: number;
  timeSlot: TimeSlot;
  status: VisitStatus;
  note: string | null;
  adminMemo: string | null;
  contactName: string;
  contactPhone: string;
  address: string;
  addressDetail: string | null;
  planStartDate: string | null;
  planEndDate: string | null;
};

type InspectionsData = {
  today: string;
  pendingCount: number;
  plans: PlanRow[];
  schedule: ScheduleRow[];
  settled: ScheduleRow[];
};

type VisitPatch = {
  status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELED';
  adminMemo?: string | null;
  date?: string;
  timeSlot?: TimeSlot;
};

type StatusFilter = PlanView['status'] | 'ALL';

const STATUS_TONE: Record<PlanView['status'], string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  ACTIVE: 'bg-brand-50 text-brand-700',
  EXPIRED: 'bg-neutral-100 text-muted',
  CANCELED: 'bg-neutral-100 text-muted',
};

const STATUS_FILTERS: readonly StatusFilter[] = [
  'ALL',
  'PENDING_PAYMENT',
  'ACTIVE',
  'EXPIRED',
  'CANCELED',
];

const cellClass = 'px-3 py-2 align-top text-sm';
const headClass = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted';
const fieldClass = 'min-h-11 rounded-admin-md border border-border bg-white px-3 text-sm';

// 방문 일정 탭의 날짜 묶음. 기준일은 서버가 준 today(todayKst — KST 달력 날짜)다.
// "오늘" 을 맨 위에 두어 오늘 보낼 방문이 첫눈에 보이게 한다. 주는 월요일에 시작한다.
type ScheduleGroup = 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'past';

const SCHEDULE_GROUPS: readonly { key: ScheduleGroup; label: string }[] = [
  { key: 'today', label: '오늘' },
  // 지난 방문은 완료 처리가 남은 할 일이라 오늘 바로 아래에 둔다(0건이면 숨김).
  { key: 'past', label: '지난 방문 · 완료 처리 필요' },
  { key: 'tomorrow', label: '내일' },
  { key: 'thisWeek', label: '이번 주' },
  { key: 'later', label: '다음 주 이후' },
];

function scheduleGroupOf(date: string, today: string): ScheduleGroup {
  const diff = daysBetween(today, date);
  if (diff < 0) return 'past';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  // getUTCDay: 0=일요일. 오늘부터 이번 주 일요일까지 남은 날 수.
  const daysToSunday = (7 - fromDateString(today).getUTCDay()) % 7;
  return diff <= daysToSunday ? 'thisWeek' : 'later';
}

/** 상태를 바꾸는 요청 하나. 실패하면 서버가 준 문구를 그대로 던진다. */
async function send(url: string, method: 'POST' | 'PATCH', body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? '처리하지 못했습니다');
}

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
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<PlanRow | null>(null);
  const [booking, setBooking] = useState<{ plan: PlanRow; quarter: number } | null>(null);
  // 확인 모달은 기본 모양을 쓴다 — 'admin' 모양의 주 버튼은 노란색이라 이 화면의 남색 주 버튼
  // (buttonClasses('primary'))과 어긋났다. 기본 모양은 같은 primary, 파괴적 동작은 danger(빨강)다.
  const [confirm, confirmUI] = useConfirm();

  /** 한 행의 처리를 감싼다 — 바쁨 표시·오류 문구·성공 후 새로고침을 한 곳에서. */
  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setActionError(requestError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmPayment(plan: PlanRow) {
    const ok = await confirm({
      title: '입금 확인',
      message: `${plan.userName}님(입금자명 ${plan.depositorName})의 ${formatWon(plan.priceWon)} 입금을 확인했습니까? 확인하면 오늘부터 1년이 시작되고 고객에게 문자가 발송됩니다.`,
      confirmText: '입금 확인',
    });
    if (!ok) return;
    await run(plan.id, () =>
      send(`/api/admin/inspections/${plan.id}/confirm-payment`, 'POST'),
    );
  }

  const patchVisit = (visitId: string, body: VisitPatch) =>
    run(visitId, () => send(`/api/admin/inspections/visits/${visitId}`, 'PATCH', body));

  // 완료하면 카드가 일정표에서 사라진다 — 입력만 하고 저장하지 않은 담당 메모를 같이 보내지
  // 않으면 "누가 다녀왔는지"가 기록될 기회 없이 없어진다.
  async function completeVisit(visit: ScheduleRow, unsavedMemo?: string) {
    const ok = await confirm({
      title: '점검 완료',
      message: `${visit.contactName}님 ${visit.quarter}회차(${formatVisitDate(visit.date)}) 점검을 완료 처리합니다.`,
      confirmText: '완료 처리',
    });
    if (ok) {
      await patchVisit(visit.visitId, {
        status: 'COMPLETED',
        ...(unsavedMemo !== undefined ? { adminMemo: unsavedMemo } : {}),
      });
    }
  }

  async function cancelVisit(visit: ScheduleRow) {
    const ok = await confirm({
      title: '방문 취소',
      message: `${visit.contactName}님 ${visit.quarter}회차(${formatVisitDate(visit.date)}) 방문을 취소합니다. 고객에게 취소 문자가 발송되고, 고객이 새 날짜를 다시 고를 수 있습니다.`,
      confirmText: '방문 취소',
      danger: true,
    });
    if (ok) await patchVisit(visit.visitId, { status: 'CANCELED' });
  }

  const plans = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return (data?.plans ?? []).filter((plan) => {
      if (filter !== 'ALL' && plan.status !== filter) return false;
      if (!needle) return true;
      return (
        [plan.contactName, plan.userName, plan.loginId, plan.depositorName, plan.address]
          .some((v) => v.toLowerCase().includes(needle)) ||
        (digits.length >= 3 && plan.contactPhone.includes(digits))
      );
    });
  }, [data, filter, query]);
  const schedule = data?.schedule ?? [];
  const settled = data?.settled ?? [];
  const scheduleGroups = useMemo(() => {
    const today = data?.today ?? '';
    return SCHEDULE_GROUPS.map((group) => ({
      ...group,
      // 서버가 날짜순으로 준 순서를 그대로 유지한다.
      visits: (data?.schedule ?? []).filter(
        (visit) => scheduleGroupOf(visit.date, today) === group.key,
      ),
    }));
  }, [data]);

  return (
    <main className="min-h-screen">
      <PageHeader title="전기점검" width="max-w-6xl" />
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
                ['plans', `구독 ${data?.plans.length ?? 0}`],
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
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1" role="group" aria-label="구독 상태 필터">
                {STATUS_FILTERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                      filter === key
                        ? 'border-admin-cyan-ink bg-admin-cyan-ink text-white'
                        : 'border-border bg-white text-muted'
                    }`}
                  >
                    {key === 'ALL' ? '전체' : PLAN_STATUS_LABEL[key]}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="구독 검색"
                placeholder="이름·아이디·전화·입금자명·주소"
                className={`${fieldClass} ml-auto w-full sm:w-72`}
              />
            </div>
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
                        {data.plans.length === 0
                          ? '신청된 전기점검이 없습니다.'
                          : '조건에 맞는 구독이 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b border-border last:border-0">
                      <td className={`${cellClass} whitespace-nowrap`}>
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[plan.status]}`}
                        >
                          {PLAN_STATUS_LABEL[plan.status]}
                        </span>
                        <p className="mt-1 text-xs text-muted">{plan.createdDate} 신청</p>
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        <p className="font-semibold">{plan.contactName}</p>
                        <p className="text-xs text-muted">{plan.loginId}</p>
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        <a href={`tel:${plan.contactPhone}`} className="underline">
                          {formatPhone(plan.contactPhone)}
                        </a>
                      </td>
                      {/* 주소는 어절 단위로만 줄바꿈한다(break-keep) — "정자동 / 1" 처럼 번지가 떨어지지 않게 최소 폭을 둔다. */}
                      <td className={`${cellClass} min-w-[13rem] max-w-[18rem] break-keep`}>
                        <p>{plan.address}</p>
                        {plan.addressDetail && (
                          <p className="text-xs text-muted">{plan.addressDetail}</p>
                        )}
                        {plan.memo && (
                          <p className="mt-1 text-xs text-muted">요청: {plan.memo}</p>
                        )}
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>{plan.depositorName}</td>
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
                          {plan.quarters.map((q) => {
                            const open = q.visit != null && q.visit.status !== 'CANCELED';
                            const label = q.needsReschedule
                              ? '재선택'
                              : open
                                ? formatShortDate(q.visit!.date)
                                : '미정';
                            const title = q.visit
                              ? `${q.quarter}회차 ${formatVisitDate(q.visit.date)} · ${
                                  q.needsReschedule
                                    ? '고객 재선택 대기'
                                    : VISIT_STATUS_LABEL[q.visit.status]
                                }`
                              : `${q.quarter}회차 미정`;
                            const chipClass = `inline-flex min-w-[3.25rem] flex-col items-center rounded-md border px-1.5 py-1 text-[11px] leading-tight ${
                              q.visit?.status === 'COMPLETED'
                                ? 'border-brand-200 bg-brand-50 text-brand-700'
                                : q.needsReschedule
                                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                                  : open
                                    ? 'border-border bg-white'
                                    : 'border-dashed border-neutral-300 text-neutral-400'
                            }`;
                            const body = (
                              <>
                                <span className="font-semibold">{q.quarter}회</span>
                                <span className="tabular-nums">{label}</span>
                              </>
                            );
                            // 방문이 없는(또는 취소된) 회차는 행 자체가 없어 일정표에 뜨지 않는다 —
                            // 고객이 분기를 놓쳤을 때 전화로 받은 보충 방문을 잡아 줄 입구가 여기다.
                            return plan.status === 'ACTIVE' && !open ? (
                              <button
                                key={q.quarter}
                                type="button"
                                title={`${title} — 눌러서 방문 잡기`}
                                aria-label={`${plan.contactName}님 ${q.quarter}회차 방문 잡기`}
                                onClick={() => setBooking({ plan, quarter: q.quarter })}
                                className={`${chipClass} min-h-11 cursor-pointer hover:border-admin-cyan-ink hover:text-admin-cyan-ink`}
                              >
                                {body}
                              </button>
                            ) : (
                              <span key={q.quarter} title={title} className={chipClass}>
                                {body}
                              </span>
                            );
                          })}
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
                              onClick={() => setCanceling(plan)}
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
          </>
        )}

        {tab === 'schedule' && data && (
          <div className="space-y-5">
            {schedule.length === 0 && (
              <p className="rounded-admin-md border border-border bg-white px-4 py-8 text-center text-sm text-muted">
                예정된 방문이 없습니다.
              </p>
            )}
            {schedule.length > 0 &&
              scheduleGroups.map((group) =>
                // "오늘" 은 비어 있어도 머리글을 남긴다 — 오늘 보낼 방문이 없다는 사실 자체가 정보다.
                group.visits.length === 0 && group.key !== 'today' ? null : (
                  <section key={group.key} aria-labelledby={`schedule-group-${group.key}`}>
                    <h2
                      id={`schedule-group-${group.key}`}
                      className={`mb-2 flex items-baseline gap-2 text-sm font-bold ${
                        group.key === 'today'
                          ? 'text-admin-cyan-ink'
                          : group.key === 'past'
                            ? 'text-amber-800'
                            : 'text-fg'
                      }`}
                    >
                      {group.label}
                      <span className="text-xs font-semibold tabular-nums text-muted">
                        {group.visits.length}건
                      </span>
                    </h2>
                    {group.visits.length === 0 ? (
                      <p className="rounded-admin-md border border-dashed border-border bg-white px-4 py-3 text-sm text-muted">
                        오늘 예정된 방문이 없어요
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {group.visits.map((visit) => (
                          <ScheduleCard
                            // 메모·날짜가 서버에서 바뀌면 카드의 입력 상태를 새 값으로 다시 시작한다.
                            key={`${visit.visitId}:${visit.date}:${visit.timeSlot}:${visit.adminMemo ?? ''}`}
                            visit={visit}
                            today={data.today}
                            busy={busyId === visit.visitId}
                            onPatch={patchVisit}
                            onComplete={completeVisit}
                            onCancel={cancelVisit}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ),
              )}

            {/* 되돌리기 — 완료·취소는 일정표에서 사라지므로, 잘못 누른 처리를 되찾을 자리가 필요하다. */}
            {settled.length > 0 && (
              <details className="rounded-admin-md border border-border bg-white">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                  최근 처리한 방문 {settled.length}건
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {settled.map((visit) => (
                    <li
                      key={visit.visitId}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                    >
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          visit.status === 'COMPLETED'
                            ? 'bg-brand-50 text-brand-700'
                            : 'bg-neutral-100 text-muted'
                        }`}
                      >
                        {VISIT_STATUS_LABEL[visit.status]}
                      </span>
                      <span className="tabular-nums">{formatVisitDate(visit.date)}</span>
                      <span className="min-w-0 flex-1 text-muted">
                        {visit.contactName} · {visit.quarter}회차
                        {visit.adminMemo ? ` · ${visit.adminMemo}` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={busyId === visit.visitId}
                        onClick={() => patchVisit(visit.visitId, { status: 'SCHEDULED' })}
                        className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
                      >
                        방문 예정으로 되돌리기
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
      {confirmUI}
      {booking && (
        <BookVisitDialog
          plan={booking.plan}
          quarter={booking.quarter}
          today={data?.today ?? ''}
          onClose={() => setBooking(null)}
          onSubmit={async (body) => {
            const { plan, quarter } = booking;
            setBooking(null);
            await run(plan.id, () =>
              send(`/api/admin/inspections/${plan.id}/visits`, 'POST', { quarter, ...body }),
            );
          }}
        />
      )}
      {canceling && (
        <CancelPlanDialog
          plan={canceling}
          onClose={() => setCanceling(null)}
          onSubmit={async (reason) => {
            const plan = canceling;
            setCanceling(null);
            await run(plan.id, () =>
              send(`/api/admin/inspections/${plan.id}/cancel`, 'POST', { reason }),
            );
          }}
        />
      )}
    </main>
  );
}

function ScheduleCard({
  visit,
  today,
  busy,
  onPatch,
  onComplete,
  onCancel,
}: {
  visit: ScheduleRow;
  today: string;
  busy: boolean;
  onPatch: (visitId: string, body: VisitPatch) => Promise<void>;
  onComplete: (visit: ScheduleRow, unsavedMemo?: string) => Promise<void>;
  onCancel: (visit: ScheduleRow) => Promise<void>;
}) {
  const [memo, setMemo] = useState(visit.adminMemo ?? '');
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(visit.date);
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(visit.timeSlot);
  const dirty = (visit.adminMemo ?? '') !== memo;
  const isToday = visit.date === today;
  const isPast = visit.date < today;
  // REQUESTED 는 고객이 아직 확정하지 않은 희망일이다(입금 지연으로 날짜를 다시 골라야 하는
  // 1회차). 확정 방문과 똑같이 그리면 그 날짜로 기사를 보내게 된다.
  const unconfirmed = visit.status === 'REQUESTED';
  const moved = date !== visit.date || timeSlot !== visit.timeSlot;
  // 아직 오지 않은 방문은 완료할 수 없다(서버도 막는다) — 미리 다녀왔다면 날짜부터 옮긴다.
  const canComplete = !unconfirmed && visit.date <= today;
  // 기간이 끝난 구독의 방문은 옮길 수 있는 날짜가 없다(오늘 이후이면서 이용 기간 안인 날이 없음).
  // 완료·취소만 남긴다.
  const canMove = visit.planEndDate != null && visit.planEndDate >= today;

  return (
    <article
      className={`rounded-admin-md border bg-white p-4 ${
        unconfirmed
          ? 'border-dashed border-amber-400'
          : isToday
            ? 'border-admin-cyan-ink'
            : isPast
              ? 'border-amber-300'
              : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[8.5rem]">
          <p
            className={`text-lg font-bold tabular-nums ${unconfirmed ? 'text-muted line-through' : ''}`}
          >
            {formatVisitDate(visit.date)}
          </p>
          <p className="text-sm text-muted">{TIME_SLOT_LABEL[visit.timeSlot]}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold">
              {visit.quarter}회차
            </span>
            {/* 상태 칩 — 날짜 머리글이 '언제'를, 이 칩이 '지금 어떤 상태인지'를 맡는다. */}
            {unconfirmed ? (
              <span className="rounded-full border border-dashed border-amber-400 bg-amber-50 px-2 py-0.5 font-semibold text-amber-900">
                날짜 미확정 · 고객 재선택 대기
              </span>
            ) : visit.status === 'SCHEDULED' ? (
              isPast ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                  지난 일정 · 완료 처리 필요
                </span>
              ) : (
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    isToday ? 'bg-admin-cyan-ink text-white' : 'bg-brand-50 text-brand-700'
                  }`}
                >
                  {isToday ? '오늘 방문 · 확정' : '방문 확정'}
                </span>
              )
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  visit.status === 'COMPLETED'
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-neutral-100 text-muted'
                }`}
              >
                {VISIT_STATUS_LABEL[visit.status]}
              </span>
            )}
          </p>
        </div>
        <div className="min-w-[14rem] flex-1">
          <p className="font-semibold">
            {visit.contactName} ·{' '}
            <a href={`tel:${visit.contactPhone}`} className="underline">
              {formatPhone(visit.contactPhone)}
            </a>
          </p>
          <p className="text-sm text-muted">
            {visit.address}
            {visit.addressDetail ? ` ${visit.addressDetail}` : ''}
          </p>
          {visit.note && <p className="mt-1 text-sm text-muted">요청: {visit.note}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canComplete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onComplete(visit, dirty ? memo : undefined)}
              className={buttonClasses('primary', 'sm', 'whitespace-nowrap')}
            >
              점검 완료
            </button>
          )}
          {canMove && (
            <button
              type="button"
              disabled={busy}
              aria-expanded={moving}
              onClick={() => setMoving((v) => !v)}
              className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
            >
              일정 변경
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(visit)}
            className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
          >
            방문 취소
          </button>
        </div>
      </div>

      {moving && canMove && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-admin-md bg-neutral-50 p-3">
          <div>
            <label
              htmlFor={`move-date-${visit.visitId}`}
              className="mb-1 block text-xs font-semibold text-muted"
            >
              새 방문일
            </label>
            <input
              id={`move-date-${visit.visitId}`}
              type="date"
              value={date}
              min={today}
              max={visit.planEndDate ?? undefined}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label
              htmlFor={`move-slot-${visit.visitId}`}
              className="mb-1 block text-xs font-semibold text-muted"
            >
              시간대
            </label>
            <select
              id={`move-slot-${visit.visitId}`}
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value as TimeSlot)}
              className={fieldClass}
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {TIME_SLOT_LABEL[slot]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || !isDateString(date) || (!moved && !unconfirmed)}
            // 저장되면 카드가 새 값으로 다시 시작한다(key) — 입력만 해 둔 메모를 같이 보내지 않으면 사라진다.
            onClick={() =>
              onPatch(visit.visitId, { date, timeSlot, ...(dirty ? { adminMemo: memo } : {}) })
            }
            className={buttonClasses('primary', 'sm', 'whitespace-nowrap')}
          >
            {busy ? '저장 중…' : '이 날짜로 확정'}
          </button>
          <p className="w-full text-xs text-muted">
            전화로 요청받은 변경을 대신 처리합니다. 분기 창·리드타임 제한 없이 이용 기간 안에서
            옮길 수 있고, 고객에게 변경 문자가 발송됩니다.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <label htmlFor={`memo-${visit.visitId}`} className="text-xs font-semibold text-muted">
          담당 메모
        </label>
        <input
          id={`memo-${visit.visitId}`}
          value={memo}
          maxLength={300}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="방문할 기사·차량 등 (고객에게 보이지 않음)"
          className={`${fieldClass} min-w-0 flex-1`}
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

// 관리자의 대리 예약 — 방문이 없는(또는 취소된) 회차에 날짜를 잡는다.
function BookVisitDialog({
  plan,
  quarter,
  today,
  onClose,
  onSubmit,
}: {
  plan: PlanRow;
  quarter: number;
  today: string;
  onClose: () => void;
  onSubmit: (body: { date: string; timeSlot: TimeSlot }) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('ANY');
  const quarterWindow = plan.quarters.find((q) => q.quarter === quarter)?.window ?? null;

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="book-visit-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md overflow-visible rounded-2xl border-0 bg-transparent p-0 text-fg backdrop:bg-slate-900/40"
    >
      <form
        className="rounded-2xl bg-white p-6 shadow-pop"
        onSubmit={(event) => {
          event.preventDefault();
          if (isDateString(date)) void onSubmit({ date, timeSlot });
        }}
      >
        <h2 id="book-visit-title" className="text-base font-bold">
          {plan.contactName}님 {quarter}회차 방문 잡기
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          전화로 합의한 날짜를 대신 잡습니다. 분기 기간이 지난 회차의 보충 방문도 이용 기간(
          {plan.startDate && plan.endDate
            ? formatDateRange(plan.startDate, plan.endDate)
            : '미정'}
          ) 안이면 잡을 수 있고, 고객에게 예약 문자가 발송됩니다.
        </p>
        {quarterWindow && (
          <p className="mt-2 text-xs text-muted">
            이 회차의 원래 기간: {formatDateRange(quarterWindow.start, quarterWindow.lastDay)}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <div>
            <label htmlFor="book-visit-date" className="mb-1 block text-sm font-semibold">
              방문일
            </label>
            <input
              id="book-visit-date"
              type="date"
              value={date}
              min={today}
              max={plan.endDate ?? undefined}
              onChange={(e) => setDate(e.target.value)}
              required
              autoFocus
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="book-visit-slot" className="mb-1 block text-sm font-semibold">
              시간대
            </label>
            <select
              id="book-visit-slot"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value as TimeSlot)}
              className={fieldClass}
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {TIME_SLOT_LABEL[slot]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={buttonClasses('secondary', 'md', 'flex-1')}
          >
            닫기
          </button>
          <button
            type="submit"
            disabled={!isDateString(date)}
            className={buttonClasses('primary', 'md', 'flex-1')}
          >
            이 날짜로 예약
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}

// 구독 취소 사유 입력. window.prompt 는 앱 톤과 어긋나고, 빈 값·취소를 구별하기 어렵고,
// 입력한 사유가 고객 화면에 그대로 보인다는 사실을 알릴 자리도 없다.
function CancelPlanDialog({
  plan,
  onClose,
  onSubmit,
}: {
  plan: PlanRow;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="cancel-plan-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md overflow-visible rounded-2xl border-0 bg-transparent p-0 text-fg backdrop:bg-slate-900/40"
    >
      <form
        className="rounded-2xl bg-white p-6 shadow-pop"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) void onSubmit(reason.trim());
        }}
      >
        <h2 id="cancel-plan-title" className="text-base font-bold">
          구독 취소
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {plan.userName}님의 구독과 예정된 방문을 모두 취소합니다. 고객에게 취소 문자가
          발송됩니다.
        </p>
        <label htmlFor="cancel-plan-reason" className="mt-4 block text-sm font-semibold">
          취소 사유
        </label>
        <textarea
          id="cancel-plan-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          rows={3}
          required
          autoFocus
          aria-describedby="cancel-plan-reason-hint"
          className="mt-1 w-full rounded-admin-md border border-border p-3 text-sm"
          placeholder="예) 고객 요청으로 환불 처리"
        />
        <p id="cancel-plan-reason-hint" className="mt-1 text-xs text-amber-700">
          이 사유는 고객의 마이페이지에 그대로 표시됩니다.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={buttonClasses('secondary', 'md', 'flex-1')}
          >
            닫기
          </button>
          <button
            type="submit"
            disabled={!reason.trim()}
            className={buttonClasses('danger', 'md', 'flex-1')}
          >
            구독 취소
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
