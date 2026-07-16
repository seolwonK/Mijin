import Link from 'next/link';
import Image from 'next/image';
import Surface from '@/components/Surface';
import TrackStepper from '@/components/TrackStepper';
import { UrgencyPill } from '@/components/StatusPill';
import { BoltIcon, ClipboardIcon } from '@/components/icons';

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
