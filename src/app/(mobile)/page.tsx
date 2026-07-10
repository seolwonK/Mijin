import Link from 'next/link';
import { cardClasses } from '@/components/Card';
import { BoltIcon, ClipboardIcon } from '@/components/icons';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col px-6 py-8 md:items-center md:justify-center md:py-16">
      {/* 히어로 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center md:flex-none md:gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-600 md:h-24 md:w-24">
          <BoltIcon className="h-9 w-9 text-white md:h-11 md:w-11" />
        </div>
        <div className="space-y-2">
          <h1 className="text-[28px] font-extrabold leading-tight text-fg md:text-4xl">
            전기 출동 서비스
          </h1>
          <p className="mx-auto max-w-xs text-[15px] leading-relaxed text-muted md:max-w-md md:text-lg">
            전기 고장이 나셨나요? 접수하시면 가까운 출동 업체를 빠르게 연결해
            드립니다.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-8 flex w-full flex-col gap-3 md:mt-12 md:max-w-2xl md:flex-row md:gap-4">
        <Link
          href="/request/new"
          className="group flex items-center gap-4 rounded-3xl bg-brand-600 p-5 text-left text-white transition-colors hover:bg-brand-700 active:scale-[0.99] md:flex-1 md:flex-col md:items-start md:gap-3 md:p-7"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <BoltIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-bold md:text-xl">고장 접수하기</span>
            <span className="mt-0.5 block text-sm text-brand-100">
              1분이면 접수 완료
            </span>
          </span>
          <span className="ml-auto text-xl text-brand-200 transition-transform group-hover:translate-x-0.5 md:hidden">
            →
          </span>
        </Link>

        <Link
          href="/lookup"
          className={cardClasses(
            'group flex items-center gap-4 rounded-3xl p-5 text-left text-fg transition-all hover:border-neutral-300 hover:shadow-card-hover active:scale-[0.99] md:flex-1 md:flex-col md:items-start md:gap-3 md:p-7',
          )}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100">
            <ClipboardIcon className="h-6 w-6 text-muted" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-bold md:text-xl">접수 내역 조회</span>
            <span className="mt-0.5 block text-sm text-muted">
              전화번호로 진행 상황 확인
            </span>
          </span>
          <span className="ml-auto text-xl text-neutral-300 transition-transform group-hover:translate-x-0.5 md:hidden">
            →
          </span>
        </Link>
      </div>

      {/* 로그인 허브 */}
      <div className="mt-8 pb-6 text-center md:mt-10 md:pb-0">
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
