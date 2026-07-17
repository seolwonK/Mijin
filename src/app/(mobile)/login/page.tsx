import Link from 'next/link';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import { BuildingIcon, WrenchIcon } from '@/components/icons';

const ROLES: {
  href: string;
  Icon: typeof BuildingIcon;
  title: string;
  desc: string;
}[] = [
  { href: '/partner/login', Icon: BuildingIcon, title: '업체', desc: '출동 업체 로그인' },
  { href: '/tech/login', Icon: WrenchIcon, title: '개인기술자', desc: '기술자 로그인' },
  // 관리자 로그인은 /admin/login 직접 접근 — 고객용 허브에는 노출하지 않는다(불필요한 공격면·혼란 제거).
];

// 블루 프로 배경(딥네이비 케이블+보케, public/images/bg-login.webp — hub-login-bg.png webp 변환,
// .omc/research/blue-pro/candidates/hub-login-bg.png). 역할 카드(Surface)는 불투명 흰 배경이라
// 이미지 위에서도 그대로 legible; 네이비 오버레이는 카드 밖 여백에 노출되는 인사말·구분선
// 텍스트만 흰색 계열로 바꿔 대비를 맞춘다. Next 16: `priority`는 deprecated, `preload={true}` 사용
// (node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md).
export default function LoginHubPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <Image
        src="/images/bg-login.webp"
        alt=""
        fill
        sizes="100vw"
        style={{ objectFit: 'cover' }}
        preload={true}
        className="-z-10"
      />
      <div className="absolute inset-0 -z-10 bg-brand-950/60" />

      <PageHeader title="로그인" back="/" variant="overlay" />

      <div className="mx-auto w-full max-w-md space-y-3 p-4 md:py-10">
        <div className="px-1 pb-2">
          <h2 className="text-xl font-bold text-white">환영합니다</h2>
          <p className="mt-1 text-sm text-white/70">이용하실 계정 유형을 선택해 주세요.</p>
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

        <div className="mt-3 space-y-2 border-t border-white/20 pt-5">
          <p className="px-1 text-xs font-semibold tracking-wide text-white/60 uppercase">
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
