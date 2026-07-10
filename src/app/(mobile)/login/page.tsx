import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import { BuildingIcon, WrenchIcon, ShieldIcon } from '@/components/icons';

const ROLES: {
  href: string;
  Icon: typeof BuildingIcon;
  title: string;
  desc: string;
}[] = [
  { href: '/partner/login', Icon: BuildingIcon, title: '업체', desc: '출동 업체 로그인' },
  { href: '/tech/login', Icon: WrenchIcon, title: '개인기술자', desc: '기술자 로그인' },
  { href: '/admin/login', Icon: ShieldIcon, title: '관리자', desc: '관리자 로그인' },
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
          <Surface key={r.href} as="section" className="rounded-2xl transition-transform hover:-translate-y-0.5 active:translate-y-0">
            <Link href={r.href} className="flex items-center gap-4 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100">
                <r.Icon className="h-6 w-6 text-muted" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-fg">{r.title}</span>
                <span className="block text-sm text-muted">{r.desc}</span>
              </span>
              <span className="text-xl text-neutral-300">›</span>
            </Link>
          </Surface>
        ))}

        <div className="mt-3 space-y-2 border-t border-border pt-5">
          <p className="px-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            처음이신가요? 가입하기
          </p>
          <Link
            href="/partner/signup"
            className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            <BuildingIcon className="h-5 w-5 shrink-0" />
            출동 업체로 등록하기
            <span className="ml-auto">→</span>
          </Link>
          <Link
            href="/tech/signup"
            className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            <WrenchIcon className="h-5 w-5 shrink-0" />
            개인기술자로 가입하기
            <span className="ml-auto">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
