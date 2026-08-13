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
  { href: '/tech/login', Icon: WrenchIcon, title: '전기기사', desc: '전기기사 로그인' },
  // 관리자 로그인은 /admin/login 직접 접근 — 고객용 허브에는 노출하지 않는다(불필요한 공격면·혼란 제거).
];

// 로그인 허브 캐릭터 안내 구도 재구축(Phase 2 롤아웃, redesign/ajeossi). 구 "블루 프로" 단계의
// 다크 네이비 배경 사진(bg-login.webp) + overlay 헤더 조합을 걷어내고, 랜딩 히어로와 같은
// 밝은 브랜드 틴트 패널 문법으로 통일했다 — 고객 표면 전체가 "한 회사 제품"으로 읽히도록
// 리듬을 공유한다(원칙 4). 캐릭터는 인사 포즈(ajeossi-hero.webp)를 재사용 — "환영합니다"
// 문구와 자연스럽게 짝이 맞고, 랜딩 히어로와는 화면 맥락이 달라 반복감이 없다.
// PageHeader는 당시 이미 존재하던 'default' variant로 전환만 했다(신규 variant 추가 아님).
// 'overlay' variant는 이 화면이 마지막 소비처였고, 이후 정리 커밋(#12)에서 PageHeader.tsx에서
// 완전히 제거됐다 — 지금 PageHeader는 variant prop 자체가 없다.
export default function LoginHubPage() {
  return (
    <main className="min-h-screen">
      <PageHeader title="로그인" back="/" width="max-w-md" />

      <div className="mx-auto w-full max-w-md space-y-4 p-4 md:py-10">
        <section className="rounded-3xl bg-gradient-to-br from-brand-50 via-white to-brand-100/50 px-6 py-7 text-center">
          <Image
            src="/brand/ajeossi-hero.webp"
            alt=""
            width={436}
            height={689}
            preload={true}
            className="mx-auto h-28 w-auto"
          />
          <h2 className="mt-3 text-xl font-bold text-fg">환영합니다</h2>
          <p className="mt-1 text-sm text-muted">이용하실 계정 유형을 선택해 주세요.</p>
        </section>

        <div className="space-y-3">
          {ROLES.map((r) => (
            <Surface
              key={r.href}
              as="section"
              className="rounded-2xl transition-transform ease-brand duration-brand-base hover:-translate-y-0.5 active:translate-y-0"
            >
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
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          <p className="px-1 text-xs font-semibold text-muted">처음이신가요? 가입하기</p>
          <Link
            href="/partner/signup"
            className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-700 transition-colors ease-brand duration-brand-base hover:bg-brand-100"
          >
            <BuildingIcon className="h-5 w-5 shrink-0" />
            출동 업체로 등록하기
            <span className="ml-auto">→</span>
          </Link>
          <Link
            href="/tech/signup"
            className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-700 transition-colors ease-brand duration-brand-base hover:bg-brand-100"
          >
            <WrenchIcon className="h-5 w-5 shrink-0" />
            전기기사로 가입하기
            <span className="ml-auto">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
