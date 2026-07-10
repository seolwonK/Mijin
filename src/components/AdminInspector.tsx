import Link from 'next/link';

// "관제탑"(B) 우측 인스펙터 패널 — 목록에서 행을 선택하면 상세 화면 이동 없이 핵심 정보를 먼저
// 보여준다. 실제 배정 처리(후보 조회·배정·회수·취소)는 여전히 /admin/requests/[id]에서만
// 이뤄진다 — 이 패널에 "즉시 배정" 같은 미구현 액션을 넣지 않고, 유일한 액션을 그 화면으로의
// 실제 이동(primaryHref)으로 한정해 가짜 버튼을 만들지 않는다.
// 화면 폭이 좁아지면(< xl) 정보 밀도를 지키기 위해 숨긴다 — 행 클릭 시 상세 페이지로 바로 이동해도
// 기능은 100% 유지된다(단지 이 화면 이탈 없이 보는 미리보기 기능만 넓은 화면 전용).
export type InspectorField = { label: string; value: React.ReactNode };

export default function AdminInspector({
  eyebrow,
  title,
  flag,
  fields,
  description,
  primaryHref,
  primaryLabel = '상세 열기',
  empty,
}: {
  eyebrow: string;
  title?: string;
  flag?: React.ReactNode;
  fields?: InspectorField[];
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  empty?: string;
}) {
  return (
    <aside className="hidden w-[296px] shrink-0 overflow-y-auto border-l border-admin-border bg-admin-surface p-4 xl:block">
      <p className="font-mono text-[10px] tracking-wide text-admin-faint uppercase">{eyebrow}</p>

      {!title ? (
        <p className="mt-10 text-center text-sm text-admin-faint">
          {empty ?? '행을 선택하면 상세가 표시됩니다'}
        </p>
      ) : (
        <>
          <p className="mt-2 font-mono text-lg font-bold text-admin-cyan">{title}</p>
          {flag && (
            <p className="mt-2 flex items-start gap-1.5 rounded-admin-md border border-admin-red/30 bg-admin-red/10 p-2.5 text-[11.5px] text-admin-red">
              {flag}
            </p>
          )}
          {fields && fields.length > 0 && (
            <div className="mt-3 divide-y divide-admin-border border-t border-admin-border text-xs">
              {fields.map((f) => (
                <div key={f.label} className="flex items-center justify-between py-2">
                  <span className="text-admin-faint">{f.label}</span>
                  <span className="font-semibold text-admin-ink">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          {description && (
            <p className="mt-3 rounded-admin-md bg-admin-surface-2 p-3 text-[12.5px] leading-relaxed text-admin-dim">
              {description}
            </p>
          )}
          {primaryHref && (
            <Link
              href={primaryHref}
              className="mt-3.5 flex w-full items-center justify-center rounded-admin-md bg-admin-cyan py-2.5 text-[12.5px] font-bold text-admin-bg transition-opacity hover:opacity-90"
            >
              {primaryLabel}
            </Link>
          )}
        </>
      )}
    </aside>
  );
}
