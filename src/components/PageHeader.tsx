import Link from 'next/link';
import BackButton from '@/components/BackButton';

// 앱 공통 상단 헤더. 화면마다 반복되던 sticky 헤더 마크업을 하나로 통일한다.
// - back: BackButton fallback 경로 (없으면 뒤로가기 버튼 숨김 — 포털 홈 등)
// - right: 우측 슬롯 (LogoutButton, +등록 버튼 등)
// - width: 본문과 정렬할 최대폭 (기본 max-w-2xl; 홈은 max-w-5xl, 상세는 max-w-3xl 등)
// - crumbs: 선택적 다단 경로("목록 / 이름 / 하위페이지"). 마지막 항목은 현재 페이지라
//   링크 없이 표시된다. back(직전 1단계 복귀)과 공존하며, 전달하지 않으면 아래 no-crumbs
//   분기가 기존 마크업과 완전히 동일해 렌더 결과가 100% 하위호환된다.
type Crumb = { label: string; href: string };

export default function PageHeader({
  title,
  back,
  right,
  width = 'max-w-2xl',
  crumbs,
  variant = 'default',
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
  width?: string;
  crumbs?: Crumb[];
  variant?: 'default' | 'overlay';
}) {
  if (!crumbs || crumbs.length === 0) {
    return (
      <header
        className={
          variant === 'overlay'
            ? 'sticky top-0 z-20 border-b border-white/15 bg-brand-950/60 text-white backdrop-blur'
            : 'sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur'
        }
      >
        <div
          className={`mx-auto flex w-full ${width} items-center gap-2 px-4 py-2.5 md:py-3`}
        >
          {back && <BackButton fallback={back} tone={variant === 'overlay' ? 'inverse' : undefined} />}
          <h1 className="text-xl font-bold">{title}</h1>
          {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
        </div>
      </header>
    );
  }

  return (
    <header
      className={
        variant === 'overlay'
          ? 'sticky top-0 z-20 border-b border-white/15 bg-brand-950/60 text-white backdrop-blur'
          : 'sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur'
      }
    >
      <div className={`mx-auto w-full ${width} px-4 py-2.5 md:py-3`}>
        <nav
          aria-label="이동 경로"
          className={
            variant === 'overlay'
              ? 'mb-1 flex items-center gap-1 text-xs text-white/70'
              : 'mb-1 flex items-center gap-1 text-xs text-muted'
          }
        >
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={crumb.href} className="flex min-w-0 items-center gap-1">
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={variant === 'overlay' ? 'shrink-0 text-white/30' : 'shrink-0 text-neutral-300'}
                  >
                    /
                  </span>
                )}
                {isLast ? (
                  <span className={variant === 'overlay' ? 'truncate text-white' : 'truncate text-fg'} aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className={
                      variant === 'overlay'
                        ? 'max-w-[6rem] shrink-0 truncate text-white/70 transition-colors hover:text-white hover:underline sm:max-w-[10rem]'
                        : 'max-w-[6rem] shrink-0 truncate transition-colors hover:text-brand-600 hover:underline sm:max-w-[10rem]'
                    }
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
        <div className="flex w-full items-center gap-2">
          {back && <BackButton fallback={back} tone={variant === 'overlay' ? 'inverse' : undefined} />}
          <h1 className="text-xl font-bold">{title}</h1>
          {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
        </div>
      </div>
    </header>
  );
}
