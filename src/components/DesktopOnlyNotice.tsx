import Link from 'next/link';

// 데스크톱 전용 어드민 화면의 모바일 안내 — 빈 화면에 문구만 남기지 않고
// 돌아갈 경로를 함께 제공한다.
export default function DesktopOnlyNotice({ message }: { message: string }) {
  return (
    <div className="rounded-admin-md border border-border bg-white p-5 text-center">
      <p className="text-sm text-muted">{message}</p>
      <Link
        href="/admin"
        className="mt-3 inline-block text-sm font-semibold text-brand-600 underline"
      >
        관리자 홈으로 돌아가기
      </Link>
    </div>
  );
}
