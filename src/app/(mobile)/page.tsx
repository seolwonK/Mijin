import Link from 'next/link';
import Surface from '@/components/Surface';
import TrackStepper from '@/components/TrackStepper';
import { UrgencyPill } from '@/components/StatusPill';
import { BoltIcon, ClipboardIcon } from '@/components/icons';

// "결"(C) 콘셉트 실물 반영 — 히어로/CTA/서비스 소개/로그인 허브 콘텐츠는 기존과 동일하되
// Card(border+shadow) 대신 Surface(그림자만, 카드리스)로 면을 분리하고, 파이프라인 소개를
// TrackStepper로 표현한다. 하단 FloatingDock과 겹치지 않도록 pb 여유를 둔다
// (독은 (mobile)/layout.tsx에서 전역 마운트 — 이 화면(`/`)은 독 노출 대상).
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col px-5 pt-7 pb-28 md:items-center md:justify-center md:px-6 md:py-16">
      <Surface tint className="rounded-3xl p-7 text-center md:max-w-lg md:p-10">
        <p className="text-[13px] font-semibold text-brand-700">
          가까운 출동 업체를 바로 연결해 드려요
        </p>
        <div className="mt-3 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 md:h-20 md:w-20">
            <BoltIcon className="h-7 w-7 text-white md:h-9 md:w-9" />
          </div>
        </div>
        <h1 className="mt-4 text-[26px] leading-tight font-extrabold text-fg md:text-4xl">
          전기 출동 서비스
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-muted md:max-w-md md:text-lg">
          전기 고장이 나셨나요? 접수하시면 가까운 출동 업체를 빠르게 연결해 드립니다.
        </p>
      </Surface>

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
