import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col p-6 md:items-center md:justify-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center md:flex-none md:gap-5">
        <div className="text-5xl md:text-7xl">⚡</div>
        <h1 className="text-2xl font-bold md:text-4xl">전기 출동 서비스</h1>
        <p className="text-gray-500 md:text-lg">
          전기 고장이 나셨나요?
          <br />
          접수하시면 가까운 출동 업체를 연결해 드립니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:mt-12 md:w-full md:max-w-2xl md:flex-row md:gap-5">
        <Link
          href="/request/new"
          className="rounded-2xl bg-blue-600 p-5 text-center text-lg font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-700 md:flex-1 md:rounded-3xl md:p-8 md:text-xl md:shadow-sm"
        >
          ⚡ 고장 접수하기
        </Link>
        <Link
          href="/lookup"
          className="rounded-2xl border border-gray-300 bg-white p-5 text-center text-lg font-bold text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-50 md:flex-1 md:rounded-3xl md:p-8 md:text-xl md:shadow-sm"
        >
          📋 접수 내역 조회
        </Link>
      </div>

      <div className="mt-6 pb-6 text-center md:mt-10 md:pb-0">
        <Link
          href="/login"
          className="text-sm font-medium text-gray-400 underline-offset-4 hover:text-gray-600 hover:underline"
        >
          업체 · 개인기술자 · 관리자 로그인 →
        </Link>
      </div>
    </main>
  );
}
