import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col p-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="text-5xl">⚡</div>
        <h1 className="text-2xl font-bold">전기 출동 서비스</h1>
        <p className="text-gray-500">
          전기 고장이 나셨나요?
          <br />
          접수하시면 가까운 출동 업체를 연결해 드립니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 pb-6">
        <Link
          href="/request/new"
          className="rounded-2xl bg-blue-600 p-5 text-center text-lg font-bold text-white active:bg-blue-700"
        >
          ⚡ 고장 접수하기
        </Link>
        <Link
          href="/lookup"
          className="rounded-2xl border border-gray-300 bg-white p-5 text-center text-lg font-bold text-gray-800 active:bg-gray-50"
        >
          📋 접수 내역 조회
        </Link>
        <div className="mt-4 flex justify-center gap-6 text-sm text-gray-400">
          <Link href="/partner/login" className="underline">
            업체 로그인
          </Link>
          <Link href="/admin/login" className="underline">
            관리자 로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
