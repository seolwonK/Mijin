import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';
import JsonLd from '@/components/JsonLd';
import BankAccountCard from '@/components/BankAccountCard';
import { buttonClasses } from '@/components/Button';
import { AlertIcon, CheckIcon, ClipboardIcon, ShieldIcon, WonIcon } from '@/components/icons';
import { COMPANY } from '@/lib/company';
import { PAGE_UPDATED } from '@/lib/pageDates';
import {
  getFaqPageSchema,
  getInspectionServiceSchema,
  getProcessListSchema,
  getWebPageGraph,
} from '@/lib/schema';
import {
  INSPECTION_CHECKS_PER_YEAR,
  INSPECTION_MIN_LEAD_DAYS,
  INSPECTION_MIN_MONTHLY_WON,
  INSPECTION_PRICING,
  INSPECTION_TERMS,
  formatWon,
  planYears,
} from '@/lib/inspection';
import { readInspectionAccount } from '@/lib/inspectionAccount';

/** 표시 순서(2년 약정 먼저)대로 늘어놓은 요금제. */
const PLANS = INSPECTION_TERMS.map((t) => INSPECTION_PRICING[t]);
const TWO_YEAR = INSPECTION_PRICING.TWO_YEAR;
const ONE_YEAR = INSPECTION_PRICING.ONE_YEAR;
const MIN_MONTHLY = INSPECTION_MIN_MONTHLY_WON.toLocaleString('ko-KR');

export const metadata: Metadata = {
  title: `정기 전기점검 — 월 ${MIN_MONTHLY}원부터, 1년 ${INSPECTION_CHECKS_PER_YEAR}회 전화 점검`,
  description: `${COMPANY.name} 정기 전기점검은 월 ${MIN_MONTHLY}원부터(VAT 포함, 2년 자동이체 약정시), 1년에 ${INSPECTION_CHECKS_PER_YEAR}회 원하는 날짜에 전화로 분전반·누전차단기·콘센트·조명 상태를 점검하고, 필요하다고 판단되면 전기기사가 방문해 점검합니다. 고장 나기 전에 미리 확인하세요.`,
  alternates: { canonical: '/inspection' },
};

// 입금 계좌를 DB 에서 읽는다. 매 요청 DB 를 타면 랜딩의 응답 속도를 버리므로 5분 ISR 로 둔다 —
// 계좌는 거의 바뀌지 않고, 바뀌어도 5분 안에 반영되면 충분하다. 빌드 시점에 DB 가 없는
// CloudType 환경에서는 readInspectionAccount 가 null 을 돌려주고(그 함수의 try/catch),
// 화면은 "계좌 준비 중"으로 떨어졌다가 첫 재검증에서 정상화된다.
export const revalidate = 300;

// 전화 점검이 기본이라, 통화로 함께 확인하는 항목과 방문해야 하는 판단을 나눠 적는다.
const CHECK_ITEMS = [
  { title: '분전반(두꺼비집)', desc: '차단기가 자주 떨어지는지, 타는 냄새·열감은 없는지 통화로 함께 확인해요.' },
  { title: '누전차단기', desc: '테스트 버튼을 눌러 실제로 떨어지는지 안내에 따라 확인해요.' },
  { title: '콘센트 · 스위치', desc: '흔들림·탄 자국·접촉 불량이 있는지 살펴봐요.' },
  { title: '조명 · 배선', desc: '깜빡임·노출 배선·등기구 상태를 함께 짚어요.' },
  { title: '필요하면 방문 점검', desc: '통화로 위험 신호가 보이면 전기기사가 찾아가 직접 측정·점검해요.' },
  { title: '점검 결과 안내', desc: '당장 고쳐야 할 것과 지켜봐도 되는 것을 구분해 알려드려요.' },
] as const;

// 첫 단계는 제목만 둔다(사용자 요청 2026-09-29) — 신청서가 그 자체로 설명이다.
const PROCESS_STEPS: ReadonlyArray<{ title: string; desc?: string }> = [
  { title: '구독 신청' },
  {
    title: '첫 달 입금 · 매월 자동이체',
    desc: `안내된 계좌로 첫 달 이용료(월 ${formatWon(TWO_YEAR.monthlyWon)} 또는 ${formatWon(ONE_YEAR.monthlyWon)})를 입금하고, 입금이 확인된 날에 맞춰 매월 자동이체를 걸어 주세요.`,
  },
  { title: '입금 확인', desc: '확인되면 문자로 알려드리고, 그날부터 이용이 시작돼요. 그날이 매월 납부일이 돼요.' },
  {
    title: '원하는 날 전화 점검',
    desc: `1년에 ${INSPECTION_CHECKS_PER_YEAR}회, 원하는 날짜를 고르면 그날 전화로 점검해요. 필요하면 전기기사가 방문해요.`,
  },
];

const FAQ_ITEMS = [
  {
    q: '비용은 얼마인가요?',
    a: `2년 자동이체 약정시 월 ${formatWon(TWO_YEAR.monthlyWon)}, 1년 자동이체 약정시 월 ${formatWon(ONE_YEAR.monthlyWon)}이며 모두 VAT 포함입니다. 이용료는 매월 자동이체로 내시고, 필요해서 방문 점검을 하더라도 출장비를 따로 받지 않습니다.`,
  },
  {
    q: '결제는 어떻게 하나요?',
    a: '카드 결제는 받지 않고 계좌이체로만 받습니다. 신청하면 화면과 문자로 입금 계좌를 안내해 드려요. 첫 달 이용료를 입금하시면 관리자가 확인한 날부터 구독이 시작되고, 그날이 매월 납부일이 됩니다. 이후에는 쓰시는 은행에서 매월 같은 날 자동이체를 걸어 주세요.',
  },
  {
    q: '정말 매번 방문하나요?',
    a: '아니요. 전화(유선) 점검이 기본입니다. 통화로 분전반·차단기·콘센트 상태를 함께 확인하고, 위험 신호가 보이는 등 필요하다고 판단되면 전기기사가 방문해 직접 점검합니다. 방문 여부는 통화 결과를 보고 저희가 정합니다.',
  },
  {
    q: `${INSPECTION_CHECKS_PER_YEAR}회는 어떻게 쓰나요?`,
    a: `입금이 확인된 날부터 1년 단위(이용 연차)로 ${INSPECTION_CHECKS_PER_YEAR}회씩 드립니다. 그 1년 안에서 원하는 날짜에 자유롭게 쓰시면 되고, 한 달에 여러 번 받으셔도 됩니다(같은 날 2회는 불가). 2년 약정은 1년차 ${INSPECTION_CHECKS_PER_YEAR}회, 2년차 ${INSPECTION_CHECKS_PER_YEAR}회입니다.`,
  },
  {
    q: '점검 날짜는 제가 정하나요?',
    // 숫자를 상수에서 끌어온다 — 규칙(서버의 bookingBlock)이 바뀌면 안내도 같이 바뀌어야 한다.
    a: `네. 원하는 날짜와 통화 시간대를 직접 고르면 그날 전화드립니다. 날짜별 예약 인원 제한은 없으며, ${INSPECTION_MIN_LEAD_DAYS === 1 ? '내일' : `오늘로부터 ${INSPECTION_MIN_LEAD_DAYS}일 뒤`} 날짜부터 선택할 수 있습니다. 정한 날짜는 ${INSPECTION_MIN_LEAD_DAYS === 1 ? '점검 전날' : `점검 ${INSPECTION_MIN_LEAD_DAYS}일 전`}까지 마이페이지에서 직접 바꿀 수 있고, ${INSPECTION_MIN_LEAD_DAYS === 1 ? '당일에는' : '그 뒤에는'} 고객센터(${COMPANY.tel})로 연락해 주시면 옮겨 드립니다.`,
  },
  {
    q: '점검하다 고장을 발견하면 수리도 해주나요?',
    a: '점검은 상태를 확인하고 알려드리는 데까지입니다. 수리가 필요하면 필요한 작업과 예상 비용을 안내해 드리고, 수리 대금은 점검 비용과 별도로 정산합니다.',
  },
  {
    q: '지금 전기가 고장 났는데 이걸 신청하면 되나요?',
    a: '아닙니다. 이미 고장이 났다면 전기점검이 아니라 전기 고장 접수를 이용해 주세요. 접수는 무료이고 가까운 출동 업체를 바로 연결해 드립니다.',
  },
  {
    q: '약정 기간 중에 해지할 수 있나요?',
    a: `네, 위약금 없이 해지할 수 있습니다. 고객센터(${COMPANY.tel})로 연락해 주시면 구독을 해지해 드리고, 은행에 걸어 두신 자동이체는 직접 해지해 주세요.`,
  },
] as const;

export default async function InspectionLandingPage() {
  const account = await readInspectionAccount();

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getWebPageGraph({
          path: '/inspection',
          name: '정기 전기점검',
          description: String(metadata.description),
          dateModified: PAGE_UPDATED.inspection,
        })}
      />
      <JsonLd
        data={getInspectionServiceSchema({
          path: '/inspection',
          plans: PLANS,
          checksPerYear: INSPECTION_CHECKS_PER_YEAR,
        })}
      />
      <JsonLd data={getProcessListSchema('정기 전기점검 이용 절차', PROCESS_STEPS)} />
      <JsonLd data={getFaqPageSchema(FAQ_ITEMS)} />

      <PageHeader title="정기 전기점검" back="/" />

      <div className="mx-auto w-full max-w-2xl px-5">
        {/* 히어로 — 직답(가격·횟수)을 h1 바로 아래에 둔다. 답변엔진이 인용하는 자리다. */}
        <section className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-brand-100/50 md:mt-6">
          <div className="flex flex-col md:flex-row md:items-center">
            <div className="px-6 pt-6 pb-4 md:w-3/5 md:py-10">
              <p className="text-xs font-bold text-brand-600">고장 나기 전에, 미리 check check</p>
              <h1 className="mt-2 text-2xl leading-tight font-extrabold break-keep text-fg md:text-3xl">
                월 {MIN_MONTHLY}원부터,
                <br />
                1년에 {INSPECTION_CHECKS_PER_YEAR}번이나 <span className="whitespace-nowrap">check check</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                필요하다고 판단되면 전기기사가 방문해 점검합니다.
              </p>
            </div>
            <div className="flex justify-center px-5 pb-2 md:w-2/5 md:justify-end md:pb-0">
              {/* 이 페이지의 주제 그대로를 그린 그림이라 장식이 아니다 — 대체텍스트를 준다.
                  h-44(176px)/md:h-60(240px) 표시, 비율 0.679 → 폭 120px/163px. */}
              <Image
                src="/brand/ajeossi-inspection.webp"
                alt="점검표를 들고 분전반의 차단기를 확인하는 전기아저씨"
                width={516}
                height={760}
                sizes="(min-width: 768px) 163px, 120px"
                className="h-44 w-auto md:h-60"
              />
            </div>
          </div>
        </section>

        {/* 핵심 정리 — 라벨·값 블록(AI 브리핑 인용 구조, 가이드 페이지와 같은 문법) */}
        <section aria-labelledby="summary-title" className="mt-6">
          <h2 id="summary-title" className="sr-only">
            핵심 정리
          </h2>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: '월 요금(VAT 포함)', value: `${formatWon(INSPECTION_MIN_MONTHLY_WON)}부터` },
              { label: '점검 횟수', value: `연 ${INSPECTION_CHECKS_PER_YEAR}회` },
              { label: '점검 방식', value: '전화 · 필요 시 방문' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-border bg-white px-2 py-3 text-center"
              >
                <dt className="text-xs break-keep text-muted">{item.label}</dt>
                <dd className="mt-1 text-sm font-bold break-keep tabular-nums text-fg sm:text-base">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {/* 모바일(세로 배치)에서 flex-1 은 높이 쪽으로 작동해 버튼이 28px 로 눌린다 —
                가로 배치(sm:)에서만 늘리고, 모바일은 보조 버튼과 같이 w-full 로 둔다. */}
            <Link
              href="/inspection/apply"
              className={buttonClasses('primary', 'lg', 'w-full sm:w-auto sm:flex-1')}
            >
              점검 신청하기
              <span aria-hidden="true">↗</span>
            </Link>
            {/* /my 로 보낸다 — 로그인돼 있으면 바로 현황이고, 아니면 미들웨어가 로그인으로 돌린다.
                /my/login 으로 직접 보내면 이미 로그인한 고객도 매번 로그인 화면을 만난다. */}
            <Link href="/my" className={buttonClasses('secondary', 'lg', 'w-full sm:w-44')}>
              내 점검 현황
            </Link>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <CheckIcon className="h-4 w-4 shrink-0" />
            방문 점검도 출장비 없음 · 점검 결과는 바로 안내
          </p>
        </section>

        <section aria-labelledby="check-title" className="mt-10">
          <h2 id="check-title" className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <ShieldIcon className="h-5 w-5 shrink-0 text-brand-600" />
            이런 것들을 점검해요
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {CHECK_ITEMS.map((item) => (
              <li key={item.title} className="rounded-2xl border border-border bg-white p-4">
                <strong className="block font-bold text-fg">{item.title}</strong>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{item.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="process-title" className="mt-10">
          <h2 id="process-title" className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <ClipboardIcon className="h-5 w-5 shrink-0 text-brand-600" />
            이렇게 진행돼요
          </h2>
          <ol className="mt-4 space-y-2">
            {PROCESS_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-3 rounded-2xl border border-border bg-white p-4"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-fg">{step.title}</h3>
                  {step.desc && (
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{step.desc}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="pay-title" className="mt-10">
          <h2 id="pay-title" className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <WonIcon className="h-5 w-5 shrink-0 text-brand-600" />
            요금과 납부 방법
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {PLANS.map((p) => (
              <li
                key={p.term}
                className={`rounded-2xl border-2 bg-white p-4 ${
                  p.term === 'TWO_YEAR' ? 'border-brand-600' : 'border-border'
                }`}
              >
                <p className="text-xl font-extrabold tabular-nums text-fg">
                  월 {formatWon(p.monthlyWon)}{' '}
                  <span className="text-sm font-semibold text-muted">(VAT 포함)</span>
                </p>
                <p className="mt-1 text-sm text-fg">({planYears(p.months)}년 자동이체 약정시)</p>
                <p className="mt-2 text-sm font-semibold text-brand-700">
                  점검 {INSPECTION_CHECKS_PER_YEAR * planYears(p.months)}회
                  {p.months > 12 ? ` (1년에 ${INSPECTION_CHECKS_PER_YEAR}회)` : ''}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            이용료는 매월 자동이체로 받습니다. 아래 계좌로 첫 달 이용료를 입금하시면 관리자가
            확인한 날부터 이용이 시작되고, 그날이 매월 납부일이 됩니다. 그날에 맞춰 매월 같은
            금액의 자동이체를 걸어 주세요. 위약금 없이 해지할 수 있어요(고객센터로 연락해 주시고,
            자동이체는 직접 해지해 주세요). 입금자명이 신청자 이름과 다르면 신청서에 입금자명을
            따로 적어 주세요.
          </p>
          {/* 금액은 요금제마다 달라 계좌만 보여 준다 — 입금액은 위 요금표와 신청서가 안내한다. */}
          <BankAccountCard account={account} className="mt-4" />
        </section>

        {/* 잘못 찾아온 사람을 위한 탈출구 — 이미 고장 난 사람이 여기서 멈추면 둘 다 손해다. */}
        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="flex items-center gap-2 font-bold text-amber-900">
            <AlertIcon className="h-5 w-5 shrink-0" />
            지금 이미 고장이 났나요?
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-900">
            정전·누전처럼 이미 일어난 고장은 전기점검이 아니라 고장 접수를 이용해 주세요.
            접수는 무료이고 가까운 출동 업체를 바로 연결해 드립니다.
          </p>
          <Link
            href="/request/new"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-amber-600 px-4 font-bold text-white"
          >
            전기 고장 접수하기
            <span aria-hidden="true" className="ml-1.5">
              →
            </span>
          </Link>
        </section>

        <section aria-labelledby="faq-title" className="mt-10">
          <h2 id="faq-title" className="text-xl font-extrabold text-fg">
            자주 묻는 질문
          </h2>
          <div className="mt-4 space-y-2">
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.q}
                className="rounded-2xl border border-border bg-white px-4 py-3"
              >
                <summary className="cursor-pointer font-semibold text-fg">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* md+ 전용 — 모바일은 아래의 고정 CTA 가 같은 일을 한다. */}
        <div className="mt-10 hidden md:flex">
          <Link href="/inspection/apply" className={buttonClasses('primary', 'lg', 'flex-1')}>
            정기 전기점검 신청하기
          </Link>
        </div>
      </div>

      {/* 모바일 고정 CTA — 긴 랜딩 어디에서든 한 번에 신청으로 간다. 이 화면에는 FloatingDock 이
          뜨지 않으므로(VISIBLE_PATHS 밖) 자리가 겹치지 않고, main 의 pb-28 이 가려질 높이를 비워 둔다. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-md gap-2">
          <Link href="/my" className={buttonClasses('secondary', 'lg', 'shrink-0 px-4 text-base')}>
            내 현황
          </Link>
          <Link href="/inspection/apply" className={buttonClasses('primary', 'lg', 'flex-1')}>
            월 {formatWon(INSPECTION_MIN_MONTHLY_WON)}부터 신청하기
          </Link>
        </div>
      </div>
    </main>
  );
}
