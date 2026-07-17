import Link from 'next/link';
import Image from 'next/image';
import Surface from '@/components/Surface';
import TrackStepper from '@/components/TrackStepper';
import SectionCta from '@/components/SectionCta';
import ReviewSection from '@/components/ReviewSection';
import { UrgencyPill } from '@/components/StatusPill';
import { BoltIcon, ClipboardIcon, ShieldIcon, MapPinIcon, CheckIcon } from '@/components/icons';

// 롱폼 증축 섹션(§2~§7) 데이터 — 카피 방향은 .omc/research/longform/gate/section-plan.md 승인안 그대로.
// 이미지 파이프라인: .omc/research/longform/gate/images/{scope-*,raw/process-*,raw/band-*}.png
// → cwebp/PIL 변환, public/images/landing/*.webp (각 ≤250KB).
const PROCESS_STEPS = [
  { n: 1, title: '접수', desc: '음성 또는 텍스트로 고장 내용을 30초 만에 남겨요.', image: '/images/landing/process-1.webp' },
  { n: 2, title: '배정', desc: '관리자 확인 또는 자동배정으로 담당자를 연결해요.', image: '/images/landing/process-2.webp' },
  { n: 3, title: '출동', desc: '배정된 업체·기술자가 현장으로 출동해요.', image: '/images/landing/process-3.webp' },
  { n: 4, title: '완료', desc: '수리가 끝나면 처리 완료로 표시돼요.', image: '/images/landing/process-4.webp' },
] as const;

// 6칸은 예시 카테고리 — ServiceRequest.description은 자유 텍스트라 이 목록으로 한정되지 않는다(카피에서도 단정 금지).
const SCOPE_ITEMS = [
  { title: '콘센트', image: '/images/landing/scope-outlet.webp' },
  { title: '배선', image: '/images/landing/scope-wiring.webp' },
  { title: '조명', image: '/images/landing/scope-light.webp' },
  { title: '차단기', image: '/images/landing/scope-breaker.webp' },
  { title: '누전', image: '/images/landing/scope-short.webp' },
  { title: '설비', image: '/images/landing/scope-facility.webp' },
] as const;

// section-plan.md §2 FAQ 초안 8개 중 #5(취소/변경)는 게이트 결정으로 제외 — 공개 채널 미확정.
const FAQ_ITEMS = [
  {
    q: '요금은 어떻게 책정되나요?',
    a: '앱 내 온라인 결제·가격표는 없습니다. 고장 원인과 자재에 따라 비용이 달라져 현장 확인 후 안내되며, 정산은 현장에서 직접 이루어집니다. 접수 자체는 무료입니다.',
  },
  {
    q: '접수하면 얼마나 빨리 배정되나요?',
    a: '접수 시 선택한 긴급도에 따라 목표 응대 시간이 다릅니다. 초긴급은 1시간 내, 긴급은 2시간 내, 일반은 순차적으로 처리됩니다. 실제 배정은 담당 지역의 업체·기술자 현황에 따라 달라질 수 있습니다.',
  },
  {
    q: '긴급도는 어떻게 구분되나요?',
    a: '초긴급(정전·누전 등 즉시 위험)·긴급·일반 3단계로 접수 시 직접 선택합니다.',
  },
  {
    q: '서비스 가능 지역은 어디인가요?',
    a: '전국 시/도·시/군/구 단위로 접수 가능합니다. 다만 지역별 실제 배정은 등록된 업체·기술자 현황에 따라 다르며, 담당 업체가 없는 지역은 관리자가 직접 확인 후 연결합니다.',
  },
  {
    q: '기술자·업체는 어떻게 신뢰할 수 있나요?',
    a: '업체·기술자 모두 관리자 승인을 거친 후에만 활동하며, 개인기술자는 추가로 근로계약서에 전자 서명을 완료해야 배정 대상이 됩니다.',
  },
  {
    q: '진행 상황은 어떻게 확인하나요?',
    a: '접수 시 등록한 전화번호로 접수 내역 조회에서 확인할 수 있습니다. 진행 중인 건은 15초마다 자동으로 갱신됩니다.',
  },
  {
    q: '완료 후 후기는 어떻게 남기나요?',
    a: '완료 처리되면 문자로 만족도 조사 링크가 발송되며, 별점과 선택 후기를 1회 제출할 수 있습니다.',
  },
] as const;

// "신뢰 블루 프로" 히어로 재구성(redesign/blue-pro, blue-pro-gate 승인 대상) — 기존 텍스트
// 인트로 카드(Surface tint + 아이콘 배지) 대신 생성 이미지 중심 히어로로 교체했다.
// 이미지: public/images/hero-main.webp(hero-1-panel.png를 webp 변환, 배전반+블루 케이블 —
// .omc/research/blue-pro/candidates/hero-1-panel.png). Next 16: `priority`는 deprecated라
// `preload={true}`를 쓴다(node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md).
// 오버레이는 admin-* 대신 brand-950(모바일 네임스페이스 딥블루)을 써서 관리자 다크 톤 스코프를
// 침범하지 않는다. CTA/링크(고장 접수·접수 내역 조회·로그인 허브)는 기존과 동일하게 유지.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col px-5 pb-28 md:items-center md:justify-center md:px-6 md:py-16">
      <section className="relative -mx-5 aspect-[4/5] w-[calc(100%+2.5rem)] overflow-hidden md:mx-0 md:aspect-[21/9] md:w-full md:max-w-2xl md:rounded-3xl md:shadow-surface-lg">
        <Image
          src="/images/hero-main.webp"
          alt=""
          fill
          sizes="(min-width: 768px) 42rem, 100vw"
          style={{ objectFit: 'cover' }}
          preload={true}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/85 via-brand-950/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
          <p className="text-[13px] font-semibold text-brand-200">
            가까운 출동 업체를 바로 연결해 드려요
          </p>
          <h1 className="mt-2 text-[28px] leading-tight font-extrabold text-white md:text-4xl">
            전기 출동 서비스
          </h1>
          <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-white/85 md:max-w-md md:text-lg">
            전기 고장이 나셨나요? 접수하시면 가까운 출동 업체를 빠르게 연결해 드립니다.
          </p>
          <Link
            href="/request/new"
            className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-surface-md transition-transform active:scale-[0.98]"
          >
            <BoltIcon className="h-4 w-4" />
            고장 접수하기
          </Link>
        </div>
      </section>

      {/* CTA */}
      <div className="mt-3 flex w-full flex-col gap-3 md:mt-4 md:max-w-2xl md:flex-row md:gap-4">
        <Surface as="section" tint className="rounded-3xl md:flex-1">
          <Link
            href="/request/new"
            className="group flex items-center gap-4 p-5 text-left md:flex-col md:items-start md:gap-3 md:p-7"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100">
              <BoltIcon className="h-6 w-6 text-brand-700" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold text-fg md:text-xl">
                고장 접수하기
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                음성 또는 텍스트로, 1분이면 접수 완료
              </span>
            </span>
            <span className="ml-auto text-xl text-brand-400 transition-transform group-hover:translate-x-0.5 md:hidden">
              ›
            </span>
          </Link>
        </Surface>

        <Surface as="section" className="rounded-3xl md:flex-1">
          <Link
            href="/lookup"
            className="group flex items-center gap-4 p-5 text-left md:flex-col md:items-start md:gap-3 md:p-7"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100">
              <ClipboardIcon className="h-6 w-6 text-muted" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold text-fg md:text-xl">
                접수 내역 조회
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                전화번호로 진행 상황 확인
              </span>
            </span>
            <span className="ml-auto text-xl text-neutral-300 transition-transform group-hover:translate-x-0.5 md:hidden">
              ›
            </span>
          </Link>
        </Surface>
      </div>

      {/* 서비스 소개 — 처리 파이프라인 */}
      <Surface as="section" className="mt-3 rounded-3xl p-6 md:mt-4 md:max-w-2xl md:p-7">
        <p className="text-[13px] font-semibold text-muted">접수하면 이렇게 진행돼요</p>
        <div className="mt-4">
          <TrackStepper currentIndex={0} />
        </div>
        <div className="mt-5 flex flex-wrap gap-4">
          <UrgencyPill urgency="CRITICAL" />
          <UrgencyPill urgency="URGENT" />
          <UrgencyPill urgency="NORMAL" />
        </div>
      </Surface>

      {/* §2 프로세스 4단계 */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">이렇게 진행돼요</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          접수부터 완료까지, 각 단계가 어떻게 이어지는지 미리 알려 드립니다.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {PROCESS_STEPS.map((step) => (
            <Surface key={step.n} className="flex items-center gap-4 rounded-2xl p-4">
              <Image
                src={step.image}
                alt=""
                width={96}
                height={96}
                className="h-16 w-16 shrink-0 md:h-20 md:w-20"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-bold text-fg">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {step.n}
                  </span>
                  {step.title}
                </p>
                <p className="mt-1 text-sm text-muted">{step.desc}</p>
              </div>
            </Surface>
          ))}
        </div>
        <div className="mt-5">
          <SectionCta />
        </div>
      </section>

      {/* §3 서비스 범위 */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">어떤 고장이든 문의해 주세요</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          콘센트부터 배전반까지, 전기와 관련된 문제라면 접수 시 자유롭게 설명해 주세요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          {SCOPE_ITEMS.map((item) => (
            <Surface
              key={item.title}
              className="flex flex-col items-center gap-2 rounded-2xl p-4 text-center"
            >
              <Image src={item.image} alt="" width={640} height={640} className="h-16 w-16 md:h-20 md:w-20" />
              <span className="text-sm font-semibold text-fg">{item.title}</span>
            </Surface>
          ))}
        </div>
        <div className="mt-5">
          <SectionCta />
        </div>
      </section>

      {/* §4 신뢰 요소 */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">믿고 맡기세요</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          근로계약을 마친 기술자와 관리자의 배정 확인을 거쳐 연결해 드립니다.
        </p>
        <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
          <div className="relative -mx-5 aspect-[4/3] w-[calc(100%+2.5rem)] overflow-hidden md:mx-0 md:aspect-square md:w-2/5 md:shrink-0 md:rounded-3xl">
            <Image
              src="/images/landing/band-trust.webp"
              alt=""
              fill
              sizes="(min-width: 768px) 24rem, 100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <ul className="space-y-3 md:flex-1">
            <li className="flex gap-3">
              <ShieldIcon className="h-5 w-5 shrink-0 text-brand-600" />
              <span className="text-sm text-fg">
                <strong className="font-bold">계약 기술자</strong> — 근로계약 전자 서명을 완료한 기술자만
                배정 대상이 됩니다.
              </span>
            </li>
            <li className="flex gap-3">
              <MapPinIcon className="h-5 w-5 shrink-0 text-brand-600" />
              <span className="text-sm text-fg">
                <strong className="font-bold">전국 지역 커버리지</strong> — 담당 업체가 없는 지역은 관리자가
                직접 확인 후 연결합니다.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckIcon className="h-5 w-5 shrink-0 text-brand-600" />
              <span className="text-sm text-fg">
                <strong className="font-bold">관리자 배정 시스템</strong> — 업체·기술자 모두 승인 절차를 거친
                후에만 배정 후보가 됩니다.
              </span>
            </li>
          </ul>
        </div>
        <div className="mt-5">
          <SectionCta />
        </div>
      </section>

      {/* §5 실설문 집계 후기 — 독립 async 데이터 경계, 임계 미만/조회 실패 시 미렌더 */}
      <ReviewSection />

      {/* §6 FAQ */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">자주 묻는 질문</h2>
        <div className="mt-5 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white shadow-surface-sm">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="shrink-0 text-lg text-neutral-300 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* §7 최종 CTA 밴드 — 히어로 오버레이 그라디언트 패턴 재사용 */}
      <section className="relative -mx-5 mt-8 aspect-[16/9] w-[calc(100%+2.5rem)] overflow-hidden md:mx-0 md:mt-10 md:aspect-[21/9] md:w-full md:max-w-2xl md:rounded-3xl md:shadow-surface-lg">
        <Image
          src="/images/landing/band-final.webp"
          alt=""
          fill
          sizes="(min-width: 768px) 42rem, 100vw"
          style={{ objectFit: 'cover' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/85 via-brand-950/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
          <h2 className="text-2xl font-extrabold text-white md:text-3xl">전기 고장, 지금 접수하세요</h2>
          <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-white/85 md:max-w-md md:text-lg">
            출동 가능한 업체를 바로 연결해 드립니다.
          </p>
          <Link
            href="/request/new"
            className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-surface-md transition-transform active:scale-[0.98]"
          >
            <BoltIcon className="h-4 w-4" />
            고장 접수하기
          </Link>
        </div>
      </section>

      {/* 로그인 허브 */}
      <div className="mt-6 text-center md:mt-8">
        <Link
          href="/login"
          className="inline-block rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-white hover:text-fg"
        >
          업체 · 개인기술자 · 관리자 로그인 →
        </Link>
      </div>
    </main>
  );
}
