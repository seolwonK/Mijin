'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import LogoutButton from '@/components/LogoutButton';
import PortalLoadState from '@/components/PortalLoadState';
import PortalSupportLink from '@/components/PortalSupportLink';
import BankAccountCard from '@/components/BankAccountCard';
import { HomeIcon } from '@/components/icons';
import InspectionCalendar, { SelectedDateLine } from '@/components/InspectionCalendar';
import InspectionTimeSlotPicker from '@/components/InspectionTimeSlotPicker';
import { buttonClasses } from '@/components/Button';
import { redirectToLogin, usePolling } from '@/components/usePolling';
import { requestError } from '@/lib/clientApi';
import { COMPANY } from '@/lib/company';
import type { PublicBankAccount } from '@/lib/inspectionAccount';
import type { PlanView, QuarterDisplay, QuarterView } from '@/lib/inspectionView';
import {
  PLAN_STATUS_LABEL,
  QUARTER_DISPLAY_BADGE,
  planHeadline,
  quarterDisplay,
} from '@/lib/inspectionView';
import {
  type BookingBlock,
  INSPECTION_MIN_LEAD_DAYS,
  INSPECTION_VISITS_PER_TERM,
  TIME_SLOT_LABEL,
  type TimeSlot,
  addDays,
  formatDate,
  formatDateRange,
  formatPhone,
  formatShortDate,
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

const VISITS_HINT: Record<PlanView['status'], string> = {
  PENDING_PAYMENT: '입금이 확인되면 회차별로 날짜를 고를 수 있어요.',
  ACTIVE: `날짜별 예약 인원 제한은 없어요. 방문 ${INSPECTION_MIN_LEAD_DAYS}일 전까지 직접 바꿀 수 있어요.`,
  EXPIRED: '지난 구독의 방문 기록이에요.',
  CANCELED: '취소된 구독의 방문 기록이에요.',
};

/** 직접 바꿀 수 없는 회차에 붙는 안내 — 서버의 거절 문구(BOOKING_BLOCK_MESSAGE)와 뜻이 같다. */
const BLOCK_HINT: Record<Exclude<BookingBlock, 'COMPLETED'>, string> = {
  VISIT_IMMINENT:
    '방문이 임박했거나 지난 일정은 직접 바꿀 수 없어요. 변경이 필요하면 전화로 알려 주세요.',
  WINDOW_PASSED: '이 회차는 예약 가능 기간이 지났어요. 보충 방문은 전화로 문의해 주세요.',
};

const BADGE_TONE: Record<QuarterDisplay, string> = {
  COMPLETED: 'bg-neutral-100 text-muted',
  SCHEDULED: 'bg-brand-50 text-brand-700',
  RESCHEDULE: 'bg-amber-100 text-amber-900',
  CANCELED: 'bg-neutral-100 text-muted',
  AWAITING_PAYMENT: 'bg-amber-50 text-amber-900',
  WINDOW_PASSED: 'bg-neutral-100 text-muted',
  UNSET: '',
};

// 신청서가 기존 신청으로 보낼 때 붙이는 쿼리(resumed=1·renewed=1)에 대한 안내.
const ARRIVAL_NOTICE = {
  resumed: '이미 접수된 신청으로 이동했어요. 새로 입력한 내용은 저장되지 않았어요.',
  renewed: '기존 계정으로 로그인해 갱신 신청을 접수했어요.',
} as const;

// useSearchParams 를 쓰는 부분만 Suspense 로 감싸 나머지 화면은 그대로 미리 렌더되게 한다.
function ArrivalNotice() {
  const router = useRouter();
  const params = useSearchParams();
  const message =
    params.get('resumed') === '1'
      ? ARRIVAL_NOTICE.resumed
      : params.get('renewed') === '1'
        ? ARRIVAL_NOTICE.renewed
        : null;
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-2xl border border-brand-200 bg-brand-50 py-2 pr-2 pl-4 text-sm font-semibold text-brand-800"
    >
      <p className="min-w-0 flex-1 py-2.5 leading-relaxed break-keep">{message}</p>
      {/* 닫으면 쿼리를 지워 새로고침해도 다시 뜨지 않게 한다. */}
      <button
        type="button"
        aria-label="안내 닫기"
        onClick={() => router.replace('/my', { scroll: false })}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg text-brand-700 transition-colors hover:bg-brand-100"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export default function MyInspection() {
  // 30초 폴링 — 관리자의 입금 확인이 이 화면에 반영되는 경로다(다른 실시간 요소는 없다).
  const { data, error, refresh } = usePolling<MyInspectionData>('/api/my/inspection', 30_000);
  const plan = data?.plan ?? null;
  // 예약 직후의 확인 문구. 어느 회차인지까지 말해 줘야 스크린리더 사용자가 결과를 안다.
  // 저장한 회차 카드 안에 띄운다 — 목록 맨 위에 띄우면 아래쪽 회차를 저장한 사람 눈에 안 보인다.
  const [savedNotice, setSavedNotice] = useState<{
    quarter: number;
    message: string;
  } | null>(null);
  const headline = plan ? planHeadline(plan) : null;

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <PageHeader
        title="내 정기 전기점검"
        right={
          <>
            {/* 고객 포털은 뒤로 갈 곳이 없는 첫 화면이라(로그인 직후 도착) 뒤로가기 대신 홈 링크를 둔다. */}
            <Link
              href="/"
              aria-label="전기아저씨 홈으로"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-white text-muted transition-colors hover:text-fg"
            >
              <HomeIcon className="h-5 w-5" />
            </Link>
            <LogoutButton loginPath="/my/login" />
          </>
        }
      />

      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        <Suspense fallback={null}>
          <ArrivalNotice />
        </Suspense>

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
                {plan.status === 'ACTIVE' &&
                  plan.endDate &&
                  `${formatDate(plan.endDate)}까지 이용해요`}
                {plan.status === 'EXPIRED' && '이용 기간이 끝났어요'}
                {plan.status === 'CANCELED' && '구독이 취소되었어요'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed">
                {plan.status === 'PENDING_PAYMENT' &&
                  `아래 계좌로 ${formatWon(plan.priceWon)}을 입금해 주세요. 관리자가 확인하면 그날부터 1년이 시작됩니다.`}
                {plan.status === 'ACTIVE' &&
                  `분기마다 1회씩 총 ${INSPECTION_VISITS_PER_TERM}회 방문합니다. 회차별로 원하는 날짜를 직접 고르세요.`}
                {plan.status === 'EXPIRED' &&
                  '다시 신청하시면 입금이 확인된 날부터 새로 1년이 시작됩니다.'}
                {plan.status === 'CANCELED' &&
                  (plan.cancelReason ?? '자세한 내용은 고객센터로 문의해 주세요.')}
              </p>

              {/* 지금 할 일(날짜 정하기·다시 고르기)이 있으면 그것을, 없으면 다음 방문을 한 줄로.
                  회차 카드 네 장을 훑지 않아도 첫 화면에서 알게 하고, 누르면 그 회차로 내려간다. */}
              {headline && (
                <a
                  href={`#quarter-${headline.quarter}`}
                  className={`mt-4 flex items-center justify-between gap-3 rounded-xl border p-3 ${
                    headline.kind === 'NEXT_VISIT'
                      ? 'border-brand-200 bg-white text-fg'
                      : 'border-amber-300 bg-amber-50 text-amber-900'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">
                      {headline.kind === 'NEXT_VISIT' ? '다음 방문' : '지금 할 일'}
                    </span>
                    <span className="mt-0.5 block font-bold break-keep">
                      {headline.kind === 'NEXT_VISIT' &&
                        `${formatVisitDate(headline.date)} ${TIME_SLOT_LABEL[headline.timeSlot]}`}
                      {headline.kind === 'RESCHEDULE' &&
                        `${headline.quarter}회차 날짜를 다시 골라 주세요`}
                      {headline.kind === 'BOOK' && `${headline.quarter}회차 날짜를 정해 주세요`}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xl">
                    ↓
                  </span>
                </a>
              )}

              {plan.status === 'ACTIVE' && (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold">점검 진행</span>
                    <span className="tabular-nums">
                      {INSPECTION_VISITS_PER_TERM}회 중 {plan.completedCount}회 완료
                    </span>
                  </div>
                  <QuarterTrack quarters={plan.quarters} completedCount={plan.completedCount} />
                </div>
              )}

              <dl className="mt-4 space-y-1 text-sm">
                {plan.status === 'ACTIVE' && plan.startDate && plan.endDate && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 opacity-70">이용 기간</dt>
                    <dd className="font-medium">{formatDateRange(plan.startDate, plan.endDate)}</dd>
                  </div>
                )}
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
              <div className="space-y-2">
                <BankAccountCard
                  account={data.account}
                  amountWon={plan.priceWon}
                  depositorName={plan.depositorName}
                />
                <p className="px-1 text-sm leading-relaxed text-muted">
                  {depositDeadlineNote(plan)}
                </p>
              </div>
            )}

            <section aria-labelledby="visits-title">
              <h2 id="visits-title" className="px-1 font-bold text-fg">
                방문 일정
              </h2>
              <p className="mt-1 px-1 text-sm text-muted">{VISITS_HINT[plan.status]}</p>
              <ul className="mt-3 space-y-2">
                {plan.quarters.map((quarter) => (
                  <QuarterCard
                    key={quarter.quarter}
                    quarter={quarter}
                    highlighted={quarter.quarter === plan.actionQuarter}
                    savedMessage={
                      savedNotice?.quarter === quarter.quarter ? savedNotice.message : null
                    }
                    onOpen={() => setSavedNotice(null)}
                    onSaved={(message) => {
                      setSavedNotice({ quarter: quarter.quarter, message });
                      refresh();
                    }}
                  />
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-white p-5">
              <h2 className="font-bold text-fg">도움이 필요하신가요?</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                임박한 방문의 변경, 주소·연락처 수정, 환불은 전화로 도와드려요.
              </p>
              <a
                href={`tel:${COMPANY.tel}`}
                className={buttonClasses('secondary', 'md', 'mt-3 w-full')}
              >
                고객센터 {COMPANY.tel}
              </a>
              <div className="mt-1 text-center">
                <PortalSupportLink>자주 묻는 질문 · 문의 안내</PortalSupportLink>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * 입금 대기 화면의 입금 기한 안내. 시스템에 입금 기한은 없다 — 대신 activatePlan 이 입금
 * 확인일(= 구독 시작일)에 1회차 희망일을 확정할지 정하는데, 희망일이 "확인일 + 리드타임"
 * 이후일 때만 확정하고 아니면 REQUESTED 로 남겨 고객이 다시 고르게 한다. 그 경계를 날짜로 알려 준다.
 */
function depositDeadlineNote(plan: PlanView): string {
  const base = '입금 기한은 따로 없어요. 입금이 확인된 날부터 1년 이용이 시작돼요.';
  const first = plan.quarters.find((q) => q.quarter === 1)?.visit;
  if (!first || first.status !== 'REQUESTED') return base;
  // 희망일 >= 확인일 + 리드타임  ⇔  확인일 <= 희망일 - 리드타임
  const lastConfirmDay = addDays(first.date, -INSPECTION_MIN_LEAD_DAYS);
  if (todayKst() > lastConfirmDay) {
    return `${base} 희망하신 1회차 날짜(${formatVisitDate(first.date)})가 가까워져, 입금이 확인되면 1회차 날짜를 다시 고르게 돼요.`;
  }
  return `${base} ${formatDate(lastConfirmDay)}까지 확인되면 1회차는 희망하신 ${formatVisitDate(first.date)}에 방문하고, 그보다 늦어지면 1회차 날짜를 다시 고르게 돼요.`;
}

/** 진행 막대의 세 가지 모양 — 완료(진한 채움)·예약(옅은 채움+테두리)·미정(빈 칸). */
const TRACK_SHAPE = {
  done: 'bg-brand-600',
  booked: 'border border-brand-400 bg-brand-100',
  open: 'border border-dashed border-brand-300 bg-white/70',
} as const;

/** 회차 하나를 타임라인에서 어떻게 그릴지. 막대 모양과 아래 한 줄 표기를 함께 정한다. */
function trackCell(q: QuarterView): {
  bar: string;
  label: string;
  dim: boolean;
} {
  const state: QuarterDisplay = quarterDisplay(q);
  switch (state) {
    case 'COMPLETED':
      return { bar: TRACK_SHAPE.done, label: '완료', dim: false };
    case 'SCHEDULED':
      return {
        bar: TRACK_SHAPE.booked,
        label: formatShortDate(q.visit!.date),
        dim: false,
      };
    case 'RESCHEDULE':
      return {
        bar: 'border border-amber-400 bg-amber-50',
        label: '재선택',
        dim: false,
      };
    // 창이 지나 더 이상 고객이 손댈 수 없으므로 흐리게.
    case 'WINDOW_PASSED':
      return { bar: TRACK_SHAPE.open, label: '기간 지남', dim: true };
    default:
      return { bar: TRACK_SHAPE.open, label: '미정', dim: false };
  }
}

/**
 * 1년 4회를 한 줄로 보여 주는 타임라인. 네 칸이 똑같이 생긴 막대였을 때는 "몇 회 완료"라는
 * 숫자를 옆에서 읽어야 했고, 예약만 한 회차도 완료처럼 채워져 보였다. 완료·예약·미정을
 * 모양으로 나누고 범례를 붙인다. 누르면 그 회차 카드로 바로 내려간다.
 */
function QuarterTrack({
  quarters,
  completedCount,
}: {
  quarters: QuarterView[];
  completedCount: number;
}) {
  return (
    <>
      <ul
        aria-label={`연 ${INSPECTION_VISITS_PER_TERM}회 중 ${completedCount}회 완료. 회차별 일정`}
        className="mt-2 grid grid-cols-4 gap-1.5"
      >
        {quarters.map((q) => {
          const { bar, label, dim } = trackCell(q);
          return (
            <li key={q.quarter}>
              <a
                href={`#quarter-${q.quarter}`}
                aria-label={`${q.quarter}회차 ${
                  quarterDisplay(q) === 'SCHEDULED' && q.visit
                    ? `${formatDate(q.visit.date)} 방문 예정`
                    : label
                }`}
                className="block rounded-lg py-0.5 text-center transition hover:bg-white/50 active:bg-white/80"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2 rounded-full ${bar} ${dim ? 'opacity-50' : ''}`}
                />
                <span
                  aria-hidden="true"
                  className={`mt-1.5 block text-[11px] leading-4 font-semibold ${
                    dim ? 'opacity-45' : ''
                  }`}
                >
                  {q.quarter}회차
                </span>
                <span
                  aria-hidden="true"
                  className={`block text-[11px] leading-4 tabular-nums ${
                    dim ? 'opacity-40' : 'opacity-70'
                  }`}
                >
                  {label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {/* 범례 — 각 칸의 aria-label 이 상태를 다 말하므로 낭독에서는 뺀다. */}
      <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-80">
        {(
          [
            ['done', '완료'],
            ['booked', '예약'],
            ['open', '미정'],
          ] as const
        ).map(([shape, text]) => (
          <li key={shape} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-4 rounded-full ${TRACK_SHAPE[shape]}`} />
            {text}
          </li>
        ))}
      </ul>
    </>
  );
}

function QuarterCard({
  quarter,
  highlighted,
  savedMessage,
  onOpen,
  onSaved,
}: {
  quarter: QuarterView;
  highlighted: boolean;
  /** 이 회차를 방금 저장했을 때의 확인 문구. 폼이 있던 자리에 남는다. */
  savedMessage: string | null;
  onOpen: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // 폼이 닫힐 때 포커스를 "날짜 변경" 버튼으로 돌려줄지 — 첫 렌더에서는 건드리지 않는다.
  const returnFocus = useRef(false);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('ANY');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visit = quarter.visit;
  const today = todayKst();
  // 창의 시작일이 이미 지났으면 "모레부터"가 실질 하한이다 — 둘 중 늦은 쪽.
  const earliest = quarter.window
    ? [quarter.window.start, addDays(today, INSPECTION_MIN_LEAD_DAYS)].sort().at(-1)!
    : null;

  function openForm() {
    // 열 때마다 서버의 현재 값에서 다시 시작한다 — 폴링이나 관리자의 대리 변경으로 방문이
    // 바뀌었을 수 있고, 마운트 시점의 값을 들고 있으면 낡은 날짜를 도로 저장하게 된다.
    // 다시 골라야 하는 날짜(지난 날짜)는 채워 두지 않는다 — 날짜 입력이 범위 밖 값으로 시작한다.
    setDate(visit && !quarter.needsReschedule && visit.status !== 'CANCELED' ? visit.date : '');
    setTimeSlot(visit?.timeSlot ?? 'ANY');
    setNote(visit?.note ?? '');
    setError(null);
    onOpen();
    setOpen(true);
  }

  function closeForm() {
    returnFocus.current = true;
    setOpen(false);
  }

  // 폼은 카드 아래쪽에 열린다 — 버튼을 누른 자리에서는 안 보일 수 있으므로 폼으로 스크롤하고
  // 달력의 선택 가능한 칸(로빙 셀)으로 초점을 옮긴다. 닫히면 초점을 여는 버튼으로 돌려준다
  // (눌렀던 저장·닫기 버튼이 사라지면 초점이 문서 맨 앞으로 튄다).
  useEffect(() => {
    if (open) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      formRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: reduce ? 'auto' : 'smooth',
      });
      const target =
        document.getElementById(`visit-date-${quarter.quarter}`) ??
        document.getElementById(`visit-form-title-${quarter.quarter}`);
      target?.focus({ preventScroll: true });
    } else if (returnFocus.current) {
      returnFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [open, quarter.quarter]);

  async function save() {
    if (busy) return;
    setError(null);
    if (!isDateString(date)) {
      setError('희망 날짜를 선택해 주세요.');
      document.getElementById(`visit-date-${quarter.quarter}`)?.focus();
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
      if (res.status === 401) {
        // 세션 만료 — 폴링과 같은 방식으로 로그인 화면으로 보낸다(입력란 아래 "권한이 없습니다" 대신).
        redirectToLogin(router, window.location.pathname, window.location.search);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? '예약하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      closeForm();
      // 요일 괄호 뒤에는 조사가 어색하게 붙는다("(목)로") — 조사 자리에는 "…일로"로 끝나는 표기를 쓴다.
      onSaved(`${quarter.quarter}회차 방문을 ${formatDate(date)}로 예약했어요.`);
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  }

  const canceled = visit?.status === 'CANCELED';
  // 배지는 진행 막대와 같은 판정을 쓴다 — 창이 지난 회차에 "날짜 다시 선택"이 뜨지 않게.
  const display = quarterDisplay(quarter);
  const badge = QUARTER_DISPLAY_BADGE[display];
  const dateStruck = quarter.needsReschedule || canceled;
  const errorId = `visit-error-${quarter.quarter}`;

  return (
    <li
      id={`quarter-${quarter.quarter}`}
      className={`scroll-mt-20 rounded-2xl border bg-white p-4 ${
        highlighted ? 'border-amber-300' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-fg">
          {quarter.quarter}회차
          {quarter.isCurrent && (
            <span className="ml-2 text-xs font-semibold text-brand-700">이번 분기</span>
          )}
        </h3>
        {badge && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_TONE[display]}`}>
            {badge}
          </span>
        )}
      </div>

      {quarter.window && (
        <p className="mt-1 text-xs text-muted">
          예약 가능 기간 {formatDateRange(quarter.window.start, quarter.window.lastDay)}
        </p>
      )}

      <p className="mt-2 text-sm">
        {visit ? (
          <span className={dateStruck ? 'text-muted line-through' : 'font-semibold text-fg'}>
            {formatVisitDate(visit.date)} · {TIME_SLOT_LABEL[visit.timeSlot]}
          </span>
        ) : (
          <span className="text-muted">아직 날짜를 정하지 않았어요.</span>
        )}
      </p>

      {quarter.needsReschedule && quarter.bookable && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          입금 확인이 늦어져 선택하신 날짜에는 방문할 수 없게 됐어요. 이 회차의 날짜를 다시 골라
          주세요.
        </p>
      )}
      {canceled && quarter.bookable && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          이 방문은 취소되었어요. 새 날짜를 골라 주세요.
        </p>
      )}

      {quarter.bookable && !open && (
        <button
          ref={toggleRef}
          type="button"
          onClick={openForm}
          className={buttonClasses(highlighted ? 'primary' : 'secondary', 'md', 'mt-3 w-full')}
        >
          {visit && !dateStruck ? '날짜 변경' : '날짜 정하기'}
        </button>
      )}

      {quarter.blocked && quarter.blocked !== 'COMPLETED' && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {BLOCK_HINT[quarter.blocked]}{' '}
          <a href={`tel:${COMPANY.tel}`} className="font-semibold text-brand-700 underline">
            {COMPANY.tel}
          </a>
        </p>
      )}

      {/* 저장 확인 문구 — 폼이 있던 자리에 남긴다. 낭독되도록 영역은 항상 두고 내용만 바꾼다. */}
      <p
        role="status"
        className={
          savedMessage
            ? 'mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700'
            : ''
        }
      >
        {savedMessage}
      </p>

      {/* earliest 는 window 가 있을 때만 계산되므로 둘을 함께 좁힌다 — 패널이 열릴 수 있는
          회차(bookable)는 언제나 둘 다 갖는다. */}
      {open && quarter.window && earliest && (
        <div ref={formRef} className="mt-3 scroll-mb-28 space-y-3 rounded-xl bg-neutral-50 p-3">
          <div>
            {/* 달력의 이름은 격자 자체가 aria-label 로 가진다 — <label htmlFor> 가 가리킬
                단일 입력란이 없기 때문. */}
            <p
              id={`visit-form-title-${quarter.quarter}`}
              tabIndex={-1}
              className="mb-2 text-sm font-medium outline-none"
            >
              희망 날짜
            </p>
            {/* 375px 폭에서 날짜 칸이 44px 이상 되도록 달력만 폼(p-3)과 카드(p-4) 여백 쪽으로 넓힌다.
                폭 계산: 본문 335 - 카드 테두리·여백 34 - 폼 여백 24 = 277 → -mx-6 로 325,
                달력 자체 테두리·여백 10 을 빼면 315 / 7 = 45px. 카드 테두리와는 4px 간격이 남는다. */}
            <div className="-mx-6 sm:mx-0">
              <InspectionCalendar
                id={`visit-date-${quarter.quarter}`}
                label={`${quarter.quarter}회차 방문 희망일`}
                value={date}
                onChange={setDate}
                min={earliest}
                max={quarter.window.lastDay}
                invalid={error != null}
                describedBy={error ? errorId : undefined}
              />
            </div>
            <SelectedDateLine
              date={date}
              earliest={earliest}
              onPickEarliest={() => setDate(earliest)}
            />
          </div>
          <InspectionTimeSlotPicker
            name={`visit-slot-${quarter.quarter}`}
            value={timeSlot}
            onChange={setTimeSlot}
          />
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
            <p id={errorId} role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeForm}
              className={buttonClasses('secondary', 'md', 'flex-1')}
            >
              닫기
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={buttonClasses('primary', 'md', 'flex-1')}
            >
              {busy ? '저장 중…' : '이 날짜로 예약'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
