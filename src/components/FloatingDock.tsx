'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, BoltIcon, SearchIcon, UserIcon } from '@/components/icons';

// "결"(C) 플로팅 글래스 독 — 보류돼 있던 P3 시드#1(전역 탭바) 제안을 흡수한다
// (.omc/research/simplification-proposals.md 시드#1: 화면 수 적고 선형 플로우라 보류 권장,
// 이번 하이브리드 파운데이션에서 고객 화면 한정으로 가볍게 도입).
// 역할 인지: 고객 탐색 화면(홈/조회)에서만 노출 — 업체·전기기사·관리자 로그인 이후 화면은
// 각자의 역할 컨텍스트가 있어 고객 역할 전환 독이 필요 없다.
// 몰입 화면 숨김: 접수 폼(/request/new)은 자체 하단 고정 제출 버튼을 쓰므로 독과 겹치면 안 되고,
// 접수 완료 화면도 다음 행동(전화/조회)에 집중해야 해 독을 숨긴다.
// 소개·약관·개인정보처리방침은 푸터에서 진입하는 고객 정보 화면이라 독을 유지한다.
const VISIBLE_PATHS = ['/', '/lookup', '/about', '/terms', '/privacy'];

const ITEMS = [
  { href: '/', label: '홈', Icon: HomeIcon },
  { href: '/request/new', label: '접수', Icon: BoltIcon },
  { href: '/lookup', label: '조회', Icon: SearchIcon },
];

const HOME_LINKS = [
  { href: '/lookup', label: '접수 조회', Icon: SearchIcon },
  { href: '/request/new', label: '고장 접수', Icon: BoltIcon },
  { href: '/login', label: '업체·기사 로그인', Icon: UserIcon },
];

export default function FloatingDock() {
  const pathname = usePathname();
  if (!VISIBLE_PATHS.includes(pathname)) return null;

  // 홈의 바로가기는 동일한 폭과 아이콘·라벨 구성을 사용한다.
  // 아직 세 목적지 중 어느 곳에도 진입하지 않았으므로 선택 상태는 표시하지 않는다.
  if (pathname === '/') {
    return (
      <nav aria-label="고객 화면 이동" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white px-2 pt-1 pb-[max(8px,env(safe-area-inset-bottom))] md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {HOME_LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-semibold whitespace-nowrap text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-brand-700 focus-visible:text-brand-700 active:bg-brand-50 motion-reduce:transition-none"
            >
              <Icon
                className={`h-6 w-6 shrink-0 ${
                  href === '/request/new' ? 'fill-amber-400 text-brand-700' : ''
                }`}
              />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="고객 화면 이동"
      className="fixed bottom-5 left-1/2 z-30 flex w-max -translate-x-1/2 gap-1 rounded-full bg-white/75 p-1.5 shadow-surface-lg backdrop-blur-xl [-webkit-backdrop-filter:blur(20px)]"
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-full px-5 py-2 text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              active ? 'bg-brand-600 text-white' : 'text-muted hover:text-fg'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
