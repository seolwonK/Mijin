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
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur md:py-3">
        <BackButton fallback="/" />
        <h1 className="text-lg font-bold">로그인</h1>
      </header>

      <div className="mx-auto w-full max-w-md space-y-3 p-4 md:py-8">
        <p className="px-1 text-sm text-gray-500">
          이용하실 계정 유형을 선택해 주세요.
        </p>

        {ROLES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-blue-400 hover:shadow-md active:bg-gray-50"
          >
            <span className="text-3xl">{r.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold">{r.title}</span>
              <span className="block text-sm text-gray-500">{r.desc}</span>
            </span>
            <span className="text-2xl text-gray-300">›</span>
          </Link>
        ))}

        <Link
          href="/tech/signup"
          className="mt-2 block rounded-2xl bg-blue-50 p-4 text-center text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          개인기술자로 일하고 싶으신가요? 가입하기 →
        </Link>
      </div>
    </main>
  );
}
