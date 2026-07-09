import Link from 'next/link';
import PageHeader from '@/components/PageHeader';

const ROLES: { href: string; emoji: string; title: string; desc: string }[] = [
  { href: '/partner/login', emoji: '🏢', title: '업체', desc: '출동 업체 로그인' },
  { href: '/tech/login', emoji: '🔧', title: '개인기술자', desc: '기술자 로그인' },
  { href: '/admin/login', emoji: '🛠️', title: '관리자', desc: '관리자 로그인' },
];

export default function LoginHubPage() {
  return (
    <main className="min-h-screen">
      <PageHeader title="로그인" back="/" />

      <div className="mx-auto w-full max-w-md space-y-3 p-4 md:py-10">
        <div className="px-1 pb-2">
          <h2 className="text-xl font-bold text-fg">환영합니다</h2>
          <p className="mt-1 text-sm text-muted">이용하실 계정 유형을 선택해 주세요.</p>
        </div>

        {ROLES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover active:translate-y-0"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-2xl">
              {r.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-fg">{r.title}</span>
              <span className="block text-sm text-muted">{r.desc}</span>
            </span>
            <span className="text-xl text-neutral-300">›</span>
          </Link>
        ))}

        <div className="mt-3 space-y-2 border-t border-border pt-5">
          <p className="px-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            처음이신가요? 가입하기
          </p>
          <Link
            href="/partner/signup"
            className="flex items-center gap-2 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            🏢 출동 업체로 등록하기
            <span className="ml-auto">→</span>
          </Link>
          <Link
            href="/tech/signup"
            className="flex items-center gap-2 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            🔧 개인기술자로 가입하기
            <span className="ml-auto">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
