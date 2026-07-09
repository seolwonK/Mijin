import BackButton from '@/components/BackButton';

// 앱 공통 상단 헤더. 화면마다 반복되던 sticky 헤더 마크업을 하나로 통일한다.
// - back: BackButton fallback 경로 (없으면 뒤로가기 버튼 숨김 — 포털 홈 등)
// - right: 우측 슬롯 (LogoutButton, +등록 버튼 등)
// - width: 본문과 정렬할 최대폭 (기본 max-w-2xl; 홈은 max-w-5xl, 상세는 max-w-3xl 등)
export default function PageHeader({
  title,
  back,
  right,
  width = 'max-w-2xl',
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
  width?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
      <div
        className={`mx-auto flex w-full ${width} items-center gap-2 px-4 py-2.5 md:py-3`}
      >
        {back && <BackButton fallback={back} />}
        <h1 className="text-lg font-bold">{title}</h1>
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}
