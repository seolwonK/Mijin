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
  INSPECTION_PRICE_WON,
  INSPECTION_VISITS_PER_TERM,
  formatWon,
} from '@/lib/inspection';
import { readInspectionAccount } from '@/lib/inspectionAccount';

const PER_VISIT_WON = INSPECTION_PRICE_WON / INSPECTION_VISITS_PER_TERM;

export const metadata: Metadata = {
  title: `정기 전기점검 — 연 ${INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원, 분기마다 1회 방문`,
  description: `${COMPANY.name} 정기 전기점검은 연 ${INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원에 분기마다 1회씩 1년 ${INSPECTION_VISITS_PER_TERM}회, 전기기사가 방문해 분전반·누전차단기·콘센트·조명을 점검합니다. 고장 나기 전에 미리 확인하세요.`,
  alternates: { canonical: '/inspection' },
};

// 입금 계좌를 DB 에서 읽는다. 매 요청 DB 를 타면 랜딩의 응답 속도를 버리므로 5분 ISR 로 둔다 —
// 계좌는 거의 바뀌지 않고, 바뀌어도 5분 안에 반영되면 충분하다. 빌드 시점에 DB 가 없는
// CloudType 환경에서는 readInspectionAccount 가 null 을 돌려주고(그 함수의 try/catch),
// 화면은 "계좌 준비 중"으로 떨어졌다가 첫 재검증에서 정상화된다.
export const revalidate = 300;

const CHECK_ITEMS = [
  { title: '분전반(두꺼비집)', desc: '차단기 동작·단자 조임·과열 흔적을 확인해요.' },
  { title: '누전차단기', desc: '테스트 버튼으로 실제로 떨어지는지 직접 확인해요.' },
  { title: '콘센트 · 스위치', desc: '흔들림·탄 자국·접촉 불량을 살펴요.' },
  { title: '조명 · 배선', desc: '노출 배선과 등기구 상태를 함께 봐요.' },
  { title: '누전 여부', desc: '절연 상태를 측정해 새는 전기가 있는지 확인해요.' },
  { title: '점검 결과 안내', desc: '당장 고쳐야 할 것과 지켜봐도 되는 것을 구분해 알려드려요.' },
] as const;

const PROCESS_STEPS = [
  { title: '신청하기', desc: '점검받을 주소와 1회차 희망 날짜를 남겨 주세요.' },
  { title: '연회비 입금', desc: `안내된 계좌로 ${formatWon(INSPECTION_PRICE_WON)}을 입금해 주세요.` },
  { title: '입금 확인', desc: '확인되면 문자로 알려드리고, 그날부터 1년이 시작돼요.' },
  { title: '분기마다 방문', desc: '분기별로 원하는 날짜를 직접 고르면 그날 방문해요.' },
] as const;

const FAQ_ITEMS = [
  {
    q: '비용은 얼마인가요?',
    a: `1년에 ${INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원입니다. 분기마다 1회씩 1년에 ${INSPECTION_VISITS_PER_TERM}회 방문하므로 1회당 ${PER_VISIT_WON.toLocaleString('ko-KR')}원꼴입니다. 점검 비용 외에 출장비를 따로 받지 않습니다.`,
  },
  {
    q: '결제는 어떻게 하나요?',
    a: '카드 결제는 받지 않고 계좌이체(무통장입금)로만 받습니다. 신청하면 화면과 문자로 입금 계좌를 안내해 드리고, 관리자가 입금을 확인하면 구독이 시작됩니다.',
  },
  {
    q: '분기는 언제부터 언제까지인가요?',
    a: '입금이 확인된 날부터 1년이며, 그날을 기준으로 3개월씩 4구간으로 나눕니다. 예를 들어 3월 10일에 시작하면 1회차는 3월 10일~6월 9일, 2회차는 6월 10일~9월 9일 사이에 방문합니다.',
  },
  {
    q: '방문 날짜는 제가 정하나요?',
    a: '네. 분기마다 원하는 날짜를 직접 고르면 그날 방문합니다. 날짜별 예약 인원 제한은 없으며, 방문 준비를 위해 신청일로부터 2일 뒤부터 선택할 수 있습니다. 날짜는 방문 전까지 마이페이지에서 언제든 바꿀 수 있습니다.',
  },
  {
    q: '점검하다 고장을 발견하면 수리도 해주나요?',
    a: '점검은 상태를 확인하고 알려드리는 데까지입니다. 수리가 필요하면 그 자리에서 필요한 작업과 예상 비용을 안내해 드리고, 수리 대금은 점검 비용과 별도로 현장에서 정산합니다.',
  },
  {
    q: '지금 전기가 고장 났는데 이걸 신청하면 되나요?',
    a: '아닙니다. 이미 고장이 났다면 전기점검이 아니라 전기 고장 접수를 이용해 주세요. 접수는 무료이고 가까운 출동 업체를 바로 연결해 드립니다.',
  },
  {
    q: '중간에 그만두면 환불되나요?',
    a: '남은 회차가 있으면 사용하지 않은 회차만큼 환불해 드립니다. 고객센터로 문의해 주세요.',
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
          priceWon: INSPECTION_PRICE_WON,
          visitsPerTerm: INSPECTION_VISITS_PER_TERM,
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
              <p className="text-xs font-bold text-brand-600">고장 나기 전에, 미리 점검</p>
              <h1 className="mt-2 text-2xl leading-tight font-extrabold text-fg md:text-3xl">
                1년에 {INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원,
                <br />
                분기마다 전기를 봐 드려요
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                연회비 {formatWon(INSPECTION_PRICE_WON)}만 내시면 전기기사가 1년에{' '}
                {INSPECTION_VISITS_PER_TERM}번, 3개월에 한 번씩 댁으로 찾아가 분전반·누전차단기·
                콘센트·조명을 점검합니다. 방문 날짜는 분기마다 직접 고르시면 됩니다.
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
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: '연회비', value: formatWon(INSPECTION_PRICE_WON) },
              { label: '방문 횟수', value: `연 ${INSPECTION_VISITS_PER_TERM}회` },
              { label: '방문 주기', value: '분기당 1회' },
              { label: '1회당 비용', value: formatWon(PER_VISIT_WON) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-border bg-white px-3 py-3 text-center"
              >
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="mt-1 font-bold tabular-nums text-fg">{item.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/inspection/apply" className={buttonClasses('primary', 'lg', 'flex-1')}>
              점검 신청하기
              <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/my/login" className={buttonClasses('secondary', 'lg', 'sm:w-44')}>
              내 점검 현황
            </Link>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <CheckIcon className="h-4 w-4 shrink-0" />
            출장비 없음 · 점검 결과는 방문 현장에서 바로 안내
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
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="pay-title" className="mt-10">
          <h2 id="pay-title" className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <WonIcon className="h-5 w-5 shrink-0 text-brand-600" />
            연회비와 입금 방법
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            연회비는 {formatWon(INSPECTION_PRICE_WON)}이며 계좌이체(무통장입금)로만 받습니다.
            아래 계좌로 입금하신 뒤 관리자가 입금을 확인하면 그날부터 1년이 시작됩니다.
            입금자명이 신청자 이름과 다르면 신청서에 입금자명을 따로 적어 주세요.
          </p>
          <BankAccountCard
            account={account}
            amountWon={INSPECTION_PRICE_WON}
            className="mt-4"
          />
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

        <div className="mt-10 flex flex-col gap-2 sm:flex-row">
          <Link href="/inspection/apply" className={buttonClasses('primary', 'lg', 'flex-1')}>
            정기 전기점검 신청하기
          </Link>
        </div>
      </div>
    </main>
  );
}
