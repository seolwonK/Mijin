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
import type { PlanView, VisitDisplay, VisitView, YearView } from '@/lib/inspectionView';
import { PLAN_STATUS_LABEL, planHeadline, visitBadge, visitDisplay } from '@/lib/inspectionView';
import {
  type BookingBlock,
  INSPECTION_CHECKS_PER_YEAR,
  INSPECTION_MIN_LEAD_DAYS,
  type InspectionMethod,
  type InspectionPricing,
  type InspectionTerm,
  METHOD_LABEL,
  TIME_SLOT_LABEL,
  type TimeSlot,
  addDays,
  formatDate,
  formatDateRange,
  formatPhone,
  formatVisitDate,
  formatWon,
  isDateString,
  planYears,
  planLabel,
  planPricing,
  todayKst,
} from '@/lib/inspection';

type MyInspectionData = {
  name: string;
  pricing: Record<InspectionTerm, InspectionPricing>;
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
  PENDING_PAYMENT: '입금이 확인되면 원하는 날짜에 점검을 잡을 수 있어요.',
  ACTIVE: '잡아 둔 점검은 전날까지 직접 바꿀 수 있고, 당일에는 고객센터로 문의해 주세요.',
  EXPIRED: '지난 구독의 점검 기록이에요.',
  CANCELED: '취소된 구독의 점검 기록이에요.',
};

/** 직접 바꿀 수 없는 회차에 붙는 안내 — 서버의 거절 문구(BOOKING_BLOCK_MESSAGE)와 뜻이 같다. */
const BLOCK_HINT: Record<Exclude<BookingBlock, 'COMPLETED'>, string> = {
  VISIT_IMMINENT: '점검 당일이거나 지난 일정은 직접 바꿀 수 없어요. 변경이 필요하면 고객센터로 문의해 주세요.',
  WINDOW_PASSED: '이 회차는 예약 가능 기간이 지났어요. 고객센터로 문의해 주세요.',
};

const BADGE_TONE: Record<VisitDisplay, string> = {
  COMPLETED: 'bg-neutral-100 text-muted',
  SCHEDULED: 'bg-brand-50 text-brand-700',
  RESCHEDULE: 'bg-amber-100 text-amber-900',
  CANCELED: 'bg-neutral-100 text-muted',
  AWAITING_PAYMENT: 'bg-amber-50 text-amber-900',
  WINDOW_PASSED: 'bg-neutral-100 text-muted',
};

/** 다음 점검이 어떤 식으로 오는지 — 고객은 방식을 고르지 않으므로 무엇을 기다리면 되는지 알려 준다. */
const METHOD_WHO: Record<InspectionMethod, string> = {
  PHONE: '전기아저씨가 전화드려요',
  ONSITE: '전기기사가 방문해요',
};

// 신청서가 기존 신청으로 보낼 때 붙이는 쿼리(resumed=1·renewed=1)에 대한 안내.
const ARRIVAL_NOTICE = {
  resumed: '이미 접수된 신청으로 이동했어요. 새로 입력한 내용은 저장되지 않았어요.',
  renewed: '기존 계정으로 로그인해 갱신 신청을 접수했어요.',
} as const;

/** 새 점검 폼의 저장 확인 문구가 붙는 자리. 기존 회차는 방문 id 를 쓴다. */
const NEW_VISIT_KEY = 'new';

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
  // 30초 폴링 — 관리자의 입금 확인·방문 전환이 이 화면에 반영되는 경로다(다른 실시간 요소는 없다).
  const { data, error, refresh } = usePolling<MyInspectionData>('/api/my/inspection', 30_000);
  const plan = data?.plan ?? null;
  // 예약 직후의 확인 문구. 어느 회차인지까지 말해 줘야 스크린리더 사용자가 결과를 안다.
  // 저장한 자리(새 점검 칸 또는 그 회차 카드) 안에 띄운다 — 목록 맨 위에 띄우면 아래쪽 회차를
  // 저장한 사람 눈에 안 보인다.
  const [savedNotice, setSavedNotice] = useState<{ key: string; message: string } | null>(null);
  const headline = plan ? planHeadline(plan) : null;
  // 입금액은 신청 때 동결된 총액이다. 월 요금은 그 총액이 요금표와 맞을 때만 보여 준다 —
  // 개편 전 구독(연 50,000원)에 월 요금을 붙이면 제시한 적 없는 가격이 된다.
  const pricing = plan ? planPricing(plan.termMonths, plan.priceWon) : null;
  const label = plan ? planLabel(plan.termMonths, plan.priceWon) : '';

  function onSaved(key: string, message: string) {
    setSavedNotice({ key, message });
    refresh();
  }

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
              월 {formatWon(data.pricing.TWO_YEAR.monthlyWon)}부터, 1년에{' '}
              {INSPECTION_CHECKS_PER_YEAR}번 원하는 날짜에 전화로 전기를 점검해 드려요.
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
              <p className="text-xs font-bold">
                {PLAN_STATUS_LABEL[plan.status]} · {label}
              </p>
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
                  `아래 계좌로 ${formatWon(plan.priceWon)}을 입금해 주세요. 관리자가 확인하면 그날부터 ${planYears(plan.termMonths)}년 이용이 시작됩니다.`}
                {plan.status === 'ACTIVE' &&
                  `1년에 ${INSPECTION_CHECKS_PER_YEAR}번, 원하는 날짜를 직접 골라 점검을 받으세요.`}
                {plan.status === 'EXPIRED' &&
                  '다시 신청하시면 입금이 확인된 날부터 새로 이용 기간이 시작됩니다.'}
                {plan.status === 'CANCELED' &&
                  (plan.cancelReason ?? '자세한 내용은 고객센터로 문의해 주세요.')}
              </p>

              {plan.status === 'PENDING_PAYMENT' && (
                <dl className="mt-4 space-y-1 rounded-xl bg-white/70 p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="opacity-70">요금제</dt>
                    <dd className="font-semibold">
                      {pricing
                        ? `${label} · 월 ${formatWon(pricing.monthlyWon)} × ${plan.termMonths}개월`
                        : label}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="opacity-70">입금하실 금액</dt>
                    <dd className="text-base font-extrabold tabular-nums">
                      {formatWon(plan.priceWon)}
                    </dd>
                  </div>
                </dl>
              )}

              {/* 지금 할 일(날짜 다시 고르기·새 점검 잡기)이 있으면 그것을, 없으면 다음 점검을 한 줄로.
                  목록을 훑지 않아도 첫 화면에서 알게 하고, 누르면 그 자리로 내려간다. */}
              {headline && (
                <a
                  href={headline.kind === 'BOOK' ? '#new-visit' : `#visit-${headline.visitId}`}
                  className={`mt-4 flex items-center justify-between gap-3 rounded-xl border p-3 ${
                    headline.kind === 'NEXT_VISIT'
                      ? 'border-brand-200 bg-white text-fg'
                      : 'border-amber-300 bg-amber-50 text-amber-900'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">
                      {headline.kind === 'NEXT_VISIT'
                        ? `다음 점검 · ${METHOD_LABEL[headline.method]}`
                        : '지금 할 일'}
                    </span>
                    <span className="mt-0.5 block font-bold break-keep">
                      {headline.kind === 'NEXT_VISIT' &&
                        `${formatVisitDate(headline.date)} ${TIME_SLOT_LABEL[headline.timeSlot]}`}
                      {headline.kind === 'RESCHEDULE' &&
                        `${headline.round}회차 날짜를 다시 골라 주세요`}
                      {headline.kind === 'BOOK' &&
                        `남은 점검 ${headline.remaining}회 — 원하는 날짜를 골라 주세요`}
                    </span>
                    {headline.kind === 'NEXT_VISIT' && (
                      <span className="mt-0.5 block text-sm text-muted">
                        {METHOD_WHO[headline.method]}
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true" className="text-xl">
                    ↓
                  </span>
                </a>
              )}

              {plan.status === 'ACTIVE' && (
                <div className="mt-4 space-y-3">
                  {plan.years.map((y) => (
                    <UsageMeter key={y.year} year={y} />
                  ))}
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

            {(plan.status === 'ACTIVE' || plan.status === 'PENDING_PAYMENT') && (
              <section
                aria-labelledby="how-title"
                className="rounded-2xl border border-border bg-white p-5"
              >
                <h2 id="how-title" className="font-bold text-fg">
                  점검은 이렇게 진행돼요
                </h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
                  <li>원하는 날짜와 통화 시간대를 골라 점검을 잡아요.</li>
                  <li>그날 전기아저씨가 전화로 집 전기 상태를 함께 점검해요.</li>
                  <li>
                    통화 내용을 보고 필요하다고 판단되면 전기기사가 직접 방문해 점검합니다.
                  </li>
                </ol>
              </section>
            )}

            {plan.status === 'ACTIVE' && (
              <NewVisitSection
                plan={plan}
                savedMessage={savedNotice?.key === NEW_VISIT_KEY ? savedNotice.message : null}
                onOpen={() => setSavedNotice(null)}
                onSaved={(message) => onSaved(NEW_VISIT_KEY, message)}
              />
            )}

            <section aria-labelledby="visits-title">
              <h2 id="visits-title" className="px-1 font-bold text-fg">
                점검 일정
              </h2>
              <p className="mt-1 px-1 text-sm text-muted">{VISITS_HINT[plan.status]}</p>
              {plan.visits.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-border bg-white p-4 text-sm text-muted">
                  아직 잡힌 점검이 없어요.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {plan.visits.map((visit) => (
                    <VisitCard
                      key={visit.id}
                      plan={plan}
                      visit={visit}
                      highlighted={visit.id === plan.actionVisitId}
                      savedMessage={savedNotice?.key === visit.id ? savedNotice.message : null}
                      onOpen={() => setSavedNotice(null)}
                      onSaved={(message) => onSaved(visit.id, message)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-white p-5">
              <h2 className="font-bold text-fg">도움이 필요하신가요?</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                임박한 점검의 변경, 주소·연락처 수정, 환불은 전화로 도와드려요.
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
  const base = `입금 기한은 따로 없어요. 입금이 확인된 날부터 ${planYears(plan.termMonths)}년 이용이 시작돼요.`;
  const first = plan.visits.find((v) => v.round === 1);
  if (!first || first.status !== 'REQUESTED') return base;
  // 희망일 >= 확인일 + 리드타임  ⇔  확인일 <= 희망일 - 리드타임
  const lastConfirmDay = addDays(first.date, -INSPECTION_MIN_LEAD_DAYS);
  if (todayKst() > lastConfirmDay) {
    return `${base} 희망하신 첫 점검 날짜(${formatVisitDate(first.date)})가 가까워져, 입금이 확인되면 첫 점검 날짜를 다시 고르게 돼요.`;
  }
  return `${base} ${formatDate(lastConfirmDay)}까지 확인되면 첫 점검은 희망하신 ${formatVisitDate(first.date)}에 진행하고, 그보다 늦어지면 날짜를 다시 고르게 돼요.`;
}

/** 사용량 칸의 세 가지 모양 — 완료(진한 채움)·예약(옅은 채움+테두리)·남음(빈 칸). */
const SEGMENT_SHAPE = {
  done: 'bg-brand-600',
  booked: 'border border-brand-400 bg-brand-100',
  open: 'border border-dashed border-brand-300 bg-white/70',
} as const;

/**
 * 연차 하나의 사용량 — 12칸 막대. 완료·예약·남음을 모양으로 나눠 "몇 번 남았는지"를 숫자를
 * 세지 않고도 보이게 한다. 2년권은 연차마다 한 줄씩(연차마다 12회라 한 줄로 합치면 몫이 흐려진다).
 */
function UsageMeter({ year }: { year: YearView }) {
  const booked = Math.max(0, year.used - year.completed);
  const segments = Array.from({ length: year.quota }, (_, i) =>
    i < year.completed ? 'done' : i < year.completed + booked ? 'booked' : 'open',
  );
  const summary = `${year.year}년차 ${year.quota}회 중 ${year.used}회 사용 · 완료 ${year.completed}회`;
  return (
    <div className={year.window && !year.isCurrent && year.remaining === 0 ? 'opacity-70' : ''}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-semibold tabular-nums">
          {summary}
          {year.isCurrent && (
            <span className="ml-1.5 text-xs font-semibold text-brand-700">이번 연차</span>
          )}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${summary}, 남은 점검 ${year.remaining}회`}
        className="mt-1.5 grid grid-cols-12 gap-1"
      >
        {segments.map((shape, i) => (
          <span key={i} className={`block h-2 rounded-full ${SEGMENT_SHAPE[shape]}`} />
        ))}
      </div>
      {year.window && (
        <p className="mt-1 text-xs opacity-75">
          {formatDateRange(year.window.start, year.window.lastDay)}
        </p>
      )}
    </div>
  );
}

/** [min, max] 에서 막히지 않은 첫날. 달력의 "가장 빠른 날짜로 정하기" 지름길이 쓴다. */
function firstOpenDate(min: string, max: string, taken: ReadonlySet<string>): string {
  for (let d = min; d <= max; d = addDays(d, 1)) if (!taken.has(d)) return d;
  return min;
}

/**
 * 폼 열기·닫기와 초점 복귀. 닫히면 초점을 여는 버튼으로 돌려준다 — 눌렀던 저장·닫기 버튼이
 * 사라지면 초점이 문서 맨 앞으로 튄다. 첫 렌더에서는 건드리지 않는다.
 */
function useFormToggle() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);
  function close() {
    returnFocus.current = true;
    setOpen(false);
  }
  return { open, setOpen, close, toggleRef };
}

/** 새 점검 잡기 — 남은 횟수가 있는 연차(bookRange) 안에서, 이미 잡힌 날을 빼고 고른다. */
function NewVisitSection({
  plan,
  savedMessage,
  onOpen,
  onSaved,
}: {
  plan: PlanView;
  savedMessage: string | null;
  onOpen: () => void;
  onSaved: (message: string) => void;
}) {
  const { open, setOpen, close, toggleRef } = useFormToggle();
  const range = plan.bookRange;

  return (
    <section
      id="new-visit"
      aria-labelledby="new-visit-title"
      className="scroll-mt-20 rounded-2xl border border-border bg-white p-4"
    >
      <h2 id="new-visit-title" className="font-bold text-fg">
        새 점검
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {range
          ? `${formatDateRange(range.earliest, range.latest)} 사이에서 원하는 날짜를 고를 수 있어요. 같은 날 두 번은 잡을 수 없어요.`
          : '남은 점검이 없거나 고를 수 있는 날짜가 없어요.'}
      </p>

      {range && !open && (
        <button
          ref={toggleRef}
          type="button"
          onClick={() => {
            onOpen();
            setOpen(true);
          }}
          className={buttonClasses(plan.nextVisit ? 'secondary' : 'primary', 'md', 'mt-3 w-full')}
        >
          새 점검 날짜 잡기
        </button>
      )}

      <SavedLine message={savedMessage} />

      {open && range && (
        <BookingForm
          idPrefix={NEW_VISIT_KEY}
          label="새 점검 희망일"
          min={range.earliest}
          max={range.latest}
          taken={plan.bookedDates}
          initial={null}
          onClose={close}
          onSaved={(message) => {
            close();
            onSaved(message);
          }}
        />
      )}
    </section>
  );
}

/** 저장 확인 문구 — 폼이 있던 자리에 남긴다. 낭독되도록 영역은 항상 두고 내용만 바꾼다. */
function SavedLine({ message }: { message: string | null }) {
  return (
    <p
      role="status"
      className={
        message ? 'mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700' : ''
      }
    >
      {message}
    </p>
  );
}

function VisitCard({
  plan,
  visit,
  highlighted,
  savedMessage,
  onOpen,
  onSaved,
}: {
  plan: PlanView;
  visit: VisitView;
  highlighted: boolean;
  /** 이 회차를 방금 저장했을 때의 확인 문구. 폼이 있던 자리에 남는다. */
  savedMessage: string | null;
  onOpen: () => void;
  onSaved: (message: string) => void;
}) {
  const { open, setOpen, close, toggleRef } = useFormToggle();

  const canceled = visit.status === 'CANCELED';
  const display = visitDisplay(visit);
  const dateStruck = visit.needsReschedule || canceled;
  // 취소된 회차는 이력으로만 보인다 — 그 몫은 "새 점검 날짜 잡기"가 다시 쓴다(서버가 빈 회차에 배정).
  const changeable = visit.bookable && !canceled && visit.status !== 'COMPLETED';
  const showYear = planYears(plan.termMonths) > 1;

  // 날짜 변경은 그 회차의 연차 안에서만 — 1년차 몫을 2년차로 넘기면 연차마다 12회라는 약속이 깨진다.
  const yearWin = plan.years.find((y) => y.year === visit.year)?.window ?? null;
  const earliest = yearWin
    ? [yearWin.start, addDays(todayKst(), INSPECTION_MIN_LEAD_DAYS)].sort().at(-1)!
    : null;
  // 자기 날짜는 막지 않는다 — 시간대·요청사항만 바꾸는 저장도 된다.
  const taken = plan.bookedDates.filter((d) => d !== visit.date);

  return (
    <li
      id={`visit-${visit.id}`}
      className={`scroll-mt-20 rounded-2xl border bg-white p-4 ${
        highlighted ? 'border-amber-300' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-fg">
          {visit.round}회차
          {showYear && (
            <span className="ml-2 text-xs font-semibold text-muted">{visit.year}년차</span>
          )}
        </h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_TONE[display]}`}>
          {visitBadge(visit)}
        </span>
      </div>

      <p className="mt-2 text-sm">
        <span className={dateStruck ? 'text-muted line-through' : 'font-semibold text-fg'}>
          {formatVisitDate(visit.date)} · {TIME_SLOT_LABEL[visit.timeSlot]}
        </span>
      </p>
      {!canceled && (
        <p className="mt-1 text-xs text-muted">
          {METHOD_LABEL[visit.method]}
          {display === 'SCHEDULED' && ` — ${METHOD_WHO[visit.method]}`}
        </p>
      )}
      {visit.note && (
        <p className="mt-1 text-sm break-words text-muted">요청사항: {visit.note}</p>
      )}

      {visit.needsReschedule && visit.bookable && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          입금 확인이 늦어져 선택하신 날짜에는 점검할 수 없게 됐어요. 이 회차의 날짜를 다시 골라
          주세요.
        </p>
      )}
      {canceled && plan.status === 'ACTIVE' && (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          이 점검은 취소되었어요. 필요하면 &lsquo;새 점검 날짜 잡기&rsquo;로 다시 잡아 주세요.
        </p>
      )}

      {changeable && !open && (
        <button
          ref={toggleRef}
          type="button"
          onClick={() => {
            onOpen();
            setOpen(true);
          }}
          className={buttonClasses(highlighted ? 'primary' : 'secondary', 'md', 'mt-3 w-full')}
        >
          {visit.needsReschedule ? '날짜 다시 고르기' : '날짜 변경'}
        </button>
      )}

      {visit.blocked && visit.blocked !== 'COMPLETED' && !canceled && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {BLOCK_HINT[visit.blocked]}{' '}
          <a href={`tel:${COMPANY.tel}`} className="font-semibold text-brand-700 underline">
            {COMPANY.tel}
          </a>
        </p>
      )}

      <SavedLine message={savedMessage} />

      {/* earliest 는 yearWin 이 있을 때만 계산되므로 둘을 함께 좁힌다 — 폼이 열릴 수 있는
          회차(bookable)는 활성 구독이라 언제나 둘 다 갖는다. */}
      {open && yearWin && earliest && (
        <BookingForm
          idPrefix={visit.id}
          visitId={visit.id}
          round={visit.round}
          label={`${visit.round}회차 점검 희망일`}
          min={earliest}
          max={yearWin.lastDay}
          taken={taken}
          initial={visit}
          onClose={close}
          onSaved={(message) => {
            close();
            onSaved(message);
          }}
        />
      )}
    </li>
  );
}

/**
 * 날짜·통화 시간대·요청사항 폼. 새 점검(visitId 없음)과 기존 회차의 날짜 변경이 같은 폼을 쓴다 —
 * 서버도 같은 입구(POST /api/my/inspection/visits)로 받는다.
 */
function BookingForm({
  idPrefix,
  visitId = null,
  round = null,
  label,
  min,
  max,
  taken,
  initial,
  onClose,
  onSaved,
}: {
  idPrefix: string;
  visitId?: string | null;
  round?: number | null;
  label: string;
  min: string;
  max: string;
  /** 이미 점검이 잡힌 날 — 달력에서 고를 수 없다. */
  taken: readonly string[];
  /** 변경하는 기존 회차. 새 점검이면 null. */
  initial: VisitView | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  // 폼은 열릴 때마다 새로 마운트되므로 초기값이 곧 서버의 현재 값이다 — 폴링이나 관리자의
  // 대리 변경으로 바뀐 값을 낡은 채로 들고 있다가 도로 저장하는 일이 없다.
  // 다시 골라야 하는 날짜(지난 날짜)는 채워 두지 않는다 — 달력이 범위 밖 값으로 시작한다.
  const [date, setDate] = useState(
    initial && !initial.needsReschedule && initial.date >= min && initial.date <= max
      ? initial.date
      : '',
  );
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(initial?.timeSlot ?? 'ANY');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const takenSet = new Set(taken);
  const earliestOpen = firstOpenDate(min, max, takenSet);
  const calendarId = `visit-date-${idPrefix}`;
  const titleId = `visit-form-title-${idPrefix}`;
  const errorId = `visit-error-${idPrefix}`;

  // 폼은 버튼 아래에 열린다 — 누른 자리에서는 안 보일 수 있으므로 폼으로 스크롤하고
  // 달력의 선택 가능한 칸(로빙 셀)으로 초점을 옮긴다. 닫힐 때의 초점 복귀는 useFormToggle 몫.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    formRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    const target = document.getElementById(calendarId) ?? document.getElementById(titleId);
    target?.focus({ preventScroll: true });
  }, [calendarId, titleId]);

  async function save() {
    if (busy) return;
    setError(null);
    if (!isDateString(date)) {
      setError('희망 날짜를 선택해 주세요.');
      document.getElementById(calendarId)?.focus();
      return;
    }
    if (takenSet.has(date)) {
      setError('그날은 이미 점검이 잡혀 있어요. 다른 날짜를 골라 주세요.');
      document.getElementById(calendarId)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/my/inspection/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          ...(visitId ? { visitId } : {}),
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
      // 새 점검의 회차 번호는 서버가 정한다 — 응답의 plan 에서 그날의 점검을 찾아 읽는다.
      const savedRound =
        round ??
        (body.plan as PlanView | undefined)?.visits.find(
          (v) => v.date === date && v.status !== 'CANCELED',
        )?.round ??
        null;
      // 요일 괄호 뒤에는 조사가 어색하게 붙는다("(목)로") — 조사 자리에는 "…일로"로 끝나는 표기를 쓴다.
      onSaved(
        `${savedRound != null ? `${savedRound}회차 ` : ''}점검을 ${formatDate(date)}로 ${
          visitId ? '변경했어요' : '잡았어요'
        }.`,
      );
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={formRef} className="mt-3 scroll-mb-28 space-y-3 rounded-xl bg-neutral-50 p-3">
      <div>
        {/* 달력의 이름은 격자 자체가 aria-label 로 가진다 — <label htmlFor> 가 가리킬
            단일 입력란이 없기 때문. */}
        <p id={titleId} tabIndex={-1} className="mb-2 text-sm font-medium outline-none">
          희망 날짜
          {taken.length > 0 && (
            <span className="ml-1 font-normal text-muted">(줄 그은 날은 이미 잡힌 날이에요)</span>
          )}
        </p>
        {/* 375px 폭에서 날짜 칸이 44px 이상 되도록 달력만 폼(p-3)과 카드(p-4) 여백 쪽으로 넓힌다.
            폭 계산: 본문 335 - 카드 테두리·여백 34 - 폼 여백 24 = 277 → -mx-6 로 325,
            달력 자체 테두리·여백 10 을 빼면 315 / 7 = 45px. 카드 테두리와는 4px 간격이 남는다. */}
        <div className="-mx-6 sm:mx-0">
          <InspectionCalendar
            id={calendarId}
            label={label}
            value={date}
            onChange={setDate}
            min={min}
            max={max}
            isDisabled={(d) => takenSet.has(d)}
            invalid={error != null}
            describedBy={error ? errorId : undefined}
          />
        </div>
        <SelectedDateLine
          date={date}
          earliest={earliestOpen}
          onPickEarliest={() => setDate(earliestOpen)}
        />
      </div>
      {/* 기본은 전화 점검이라 시간대는 "전화받기 좋은 때"다 — 방문으로 바뀌면 방문 시간대가 된다.
          공용 선택기의 제목(희망 시간대)은 신청서와 함께 쓰므로 뜻은 여기서 덧붙인다. */}
      <div>
        <InspectionTimeSlotPicker
          name={`visit-slot-${idPrefix}`}
          value={timeSlot}
          onChange={setTimeSlot}
        />
        <p className="mt-1 text-xs text-muted">방문 점검으로 바뀌면 이 시간대에 방문해요.</p>
      </div>
      <div>
        <label htmlFor={`visit-note-${idPrefix}`} className="mb-1 block text-sm font-medium">
          요청사항 <span className="font-normal text-muted">(선택)</span>
        </label>
        <textarea
          id={`visit-note-${idPrefix}`}
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
          onClick={onClose}
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
  );
}
