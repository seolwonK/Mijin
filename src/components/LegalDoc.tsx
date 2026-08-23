import PageHeader from '@/components/PageHeader';
import { COMPANY } from '@/lib/company';

// 이용약관·개인정보처리방침 공용 문서 프레임 — 조문 단위로 쌓는 긴 텍스트 문서.
// 본문은 가독성 우선(줄간격·문단 간격)으로 두고 장식 요소는 쓰지 않는다. 조문 제목은 h2,
// 항목은 <ol>/<ul>로 구조화해 스크린리더와 심사 담당자 모두가 조문 번호로 찾아갈 수 있게 한다.
export function LegalDoc({
  title,
  effectiveDate,
  intro,
  children,
}: {
  title: string;
  effectiveDate: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <PageHeader title={title} back="/" />
      <article className="mx-auto w-full max-w-2xl px-5 py-6 md:py-10">
        <p className="text-xs text-muted">시행일자 {effectiveDate}</p>
        {intro && <div className="mt-3 text-sm leading-relaxed text-fg">{intro}</div>}
        <div className="mt-6 space-y-7">{children}</div>
      </article>
    </main>
  );
}

export function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-fg">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}

export function NumberedList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

export function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// 개인정보처리방침의 수집 항목·위탁 현황 등 표 형태 정보
export function InfoTable({
  head,
  rows,
}: {
  head: string[];
  rows: (React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
        <thead className="bg-neutral-50 text-neutral-600">
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-border px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className="border-b border-border px-3 py-2 leading-relaxed last:border-b-0">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 사업자 정보 블록 — 소개 페이지·약관 말미 공용
export function CompanyInfoBlock() {
  const rows = [
    ['상호', COMPANY.name],
    ['대표자', COMPANY.ceo],
    ['사업자등록번호', COMPANY.bizRegNo],
    ['사업장 주소', COMPANY.address],
    ...(COMPANY.tel ? [['전화', COMPANY.tel]] : []),
    ['서비스 주소', COMPANY.siteDisplayUrl],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl bg-neutral-50 p-4 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-neutral-600">{k}</dt>
          <dd className="min-w-0 break-keep text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
