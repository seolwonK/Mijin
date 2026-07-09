import Link from 'next/link';
import BackButton from '@/components/BackButton';

const ROLES: { href: string; emoji: string; title: string; desc: string }[] = [
  { href: '/partner/login', emoji: '🏢', title: '업체', desc: '출동 업체 로그인' },
  { href: '/tech/login', emoji: '🔧', title: '개인기술자', desc: '기술자 로그인' },
  { href: '/admin/login', emoji: '🛠️', title: '관리자', desc: '관리자 로그인' },
];

export default function LoginHubPage() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/85 px-4 py-2.5 backdrop-blur md:py-3">
        <BackButton fallback="/" />
        <h1 className="text-lg font-bold">로그인</h1>
      </header>

      <div className="mx-auto w-full max-w-md space-y-3 p-4 md:py-10">
        <p className="px-1 pb-1 text-sm text-slate-500">
          이용하실 계정 유형을 선택해 주세요.
        </p>

        {ROLES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-card-hover active:translate-y-0"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
              {r.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{r.title}</span>
              <span className="block text-sm text-slate-500">{r.desc}</span>
            </span>
            <span className="text-xl text-slate-300">›</span>
          </Link>
        ))}

        <div className="mt-3 space-y-2 border-t border-slate-100 pt-5">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            처음이신가요? 가입하기
          </p>
          <Link
            href="/partner/signup"
            className="flex items-center gap-2 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            🏢 출동 업체로 등록하기
            <span className="ml-auto">→</span>
          </Link>
          <Link
            href="/tech/signup"
            className="flex items-center gap-2 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            🔧 개인기술자로 가입하기
            <span className="ml-auto">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
