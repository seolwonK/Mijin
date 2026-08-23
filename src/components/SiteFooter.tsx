import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { COMPANY, LEGAL_LINKS } from '@/lib/company';

// 전 페이지 공통 푸터 — PG(NHN KCP 본인인증) 심사 요건: "본인인증을 진행하는 페이지를 포함한 모든
// 페이지 하단에 사업자 정보(상호·대표자·사업자등록번호·주소·유선번호)가 고정 노출되어야 한다".
// (mobile) 그룹 레이아웃에 children 뒤로 마운트돼 고객·업체·전기기사 전 화면에 붙는다.
//
// 하단 여백: 모바일에서는 FloatingDock(fixed bottom-5)·접수 폼의 고정 제출 바가 푸터 아랫부분을
// 덮지 않도록 pb-28을 둔다(각 페이지 main이 쓰는 것과 같은 값). 독은 md+에서도 떠 있으므로 전 구간 동일.
const ROWS: { label: string; value: string }[] = [
  { label: '상호', value: COMPANY.name },
  { label: '대표자', value: COMPANY.ceo },
  { label: '사업자등록번호', value: COMPANY.bizRegNo },
  { label: '주소', value: COMPANY.address },
  ...(COMPANY.tel ? [{ label: '전화', value: COMPANY.tel }] : []),
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-neutral-50 px-5 pt-6 pb-28 text-xs text-muted">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BrandLogo size="sm" />
          <nav aria-label="약관 및 안내" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`transition-colors ease-brand duration-brand-base hover:text-fg ${
                  'emphasis' in l && l.emphasis ? 'font-bold text-neutral-700' : ''
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 leading-relaxed">
          {ROWS.map((r) => (
            <div key={r.label} className="contents">
              <dt className="font-semibold text-neutral-600">{r.label}</dt>
              <dd className="min-w-0 break-keep">{r.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">
          {COMPANY.name}는 전기 고장 접수와 출동 업체·전기기사 연결을 돕는 중개 플랫폼이며, 수리 대금은
          현장에서 시공 업체와 직접 정산합니다.
        </p>
        <p className="mt-1 text-[11px] text-neutral-400">© 2026 {COMPANY.name}. All rights reserved.</p>
      </div>
    </footer>
  );
}
