import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col px-6 py-8 md:items-center md:justify-center md:py-16">
      {/* 히어로 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center md:flex-none md:gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 text-4xl shadow-[0_10px_30px_-8px_rgb(37_99_235_/_0.5)] md:h-24 md:w-24 md:text-5xl">
          ⚡
        </div>
        <div className="space-y-2">
          <h1 className="text-[28px] font-extrabold leading-tight md:text-4xl">
            전기 출동 서비스
          </h1>
          <p className="mx-auto max-w-xs text-[15px] leading-relaxed text-slate-500 md:max-w-md md:text-lg">
            전기 고장이 나셨나요? 접수하시면 가까운 출동 업체를 빠르게 연결해
            드립니다.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-8 flex w-full flex-col gap-3 md:mt-12 md:max-w-2xl md:flex-row md:gap-4">
        <Link
          href="/request/new"
          className="group flex items-center gap-4 rounded-3xl bg-blue-600 p-5 text-left text-white shadow-[0_12px_30px_-10px_rgb(37_99_235_/_0.55)] transition-all hover:bg-blue-700 active:scale-[0.99] md:flex-1 md:flex-col md:items-start md:gap-3 md:p-7"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl">
            ⚡
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-bold md:text-xl">고장 접수하기</span>
            <span className="mt-0.5 block text-sm text-blue-100">
              1분이면 접수 완료
            </span>
          </span>
          <span className="ml-auto text-xl text-blue-200 transition-transform group-hover:translate-x-0.5 md:hidden">
            →
          </span>
        </Link>

        <Link
          href="/lookup"
          className="group flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 text-left text-slate-800 shadow-card transition-all hover:border-slate-300 hover:shadow-card-hover active:scale-[0.99] md:flex-1 md:flex-col md:items-start md:gap-3 md:p-7"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            📋
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-bold md:text-xl">접수 내역 조회</span>
            <span className="mt-0.5 block text-sm text-slate-500">
              전화번호로 진행 상황 확인
            </span>
          </span>
          <span className="ml-auto text-xl text-slate-300 transition-transform group-hover:translate-x-0.5 md:hidden">
            →
          </span>
        </Link>
      </div>

      {/* 로그인 허브 */}
      <div className="mt-8 pb-6 text-center md:mt-10 md:pb-0">
        <Link
          href="/login"
          className="inline-block rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
        >
          업체 · 개인기술자 · 관리자 로그인 →
        </Link>
      </div>
    </main>
  );
}
