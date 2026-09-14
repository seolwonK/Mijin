import type { Metadata } from 'next';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

// 커스텀 404 — Next 기본 영문 화면 대신 한국어 안내와 복귀 동선. 404 상태코드·noindex 는 Next 가 자동으로 낸다.
export const metadata: Metadata = {
  title: '페이지를 찾을 수 없습니다',
  // 루트의 index,follow 를 덮어쓴다 — Next 가 404 에 자동으로 내는 noindex 와 같은 방향으로 맞춰 상충을 없앤다.
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <BrandLogo variant="bust" size="lg" />
      <h1 className="mt-6 text-2xl font-extrabold text-fg">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        주소가 잘못되었거나 페이지가 옮겨졌을 수 있어요.
        <br />
        전기 고장은 아래에서 바로 접수할 수 있습니다.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3">
        <Link
          href="/request/new"
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-700 px-5 font-semibold text-white"
        >
          고장 접수하기
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border bg-white px-5 font-semibold text-fg"
        >
          홈으로
        </Link>
        <Link href="/lookup" className="mt-1 text-sm font-semibold text-brand-700 underline">
          접수 내역 조회
        </Link>
      </div>
    </main>
  );
}
