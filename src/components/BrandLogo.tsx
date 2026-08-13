import Image from 'next/image';

// 로고 락업 — 캐릭터 버스트(public/brand/ajeossi-logo-bust.webp, RGBA 투명 배경 646×917
// 확인됨) + "전기아저씨" 워드마크. 워드마크는 이미지 합성이 아니라 실제 텍스트(Pretendard,
// globals.css body 기본 폰트)로 조립한다 — G2 팔레트(.omc/research/ajeossi/g2-palette.md §5)
// 결정: 생성 이미지에 한글을 직접 새기면 글리프가 깨지기 쉽고, 실제 텍스트여야 스크린리더·
// 검색엔진에도 브랜드명이 노출된다.
//
// 사용처(ralplan Phase 1b-3): 랜딩 히어로·로그인 허브·포털 헤더·푸터. 이 컴포넌트 자체는
// 어디에도 아직 배치하지 않았다 — 랜딩(Phase 2, G3 게이트)·포털/어드민(Phase 3, P3G 게이트)
// 둘 다 해당 화면의 레이아웃을 다시 짜므로, 지금 기존 마크업에 끼워 넣으면 재작업이 된다.
// 배치는 각 표면 게이트에서 진행한다.
//
// 버스트 이미지는 정사각형이 아닌 세로 버스트 컷(비율 646:917)이라 원형 마스크를 씌우지
// 않는다 — 배경이 투명이라 원형으로 자르지 않아도 어떤 표면 위에서나 자연스럽게 붙는다.

type BrandLogoSize = 'sm' | 'md' | 'lg';

type BrandLogoProps = {
  /** lockup(기본): 버스트+워드마크 가로 배치. bust: 버스트만(초소형 노출용). wordmark: 텍스트만. */
  variant?: 'lockup' | 'bust' | 'wordmark';
  /** default: brand-700 텍스트(라이트 배경). inverse: 흰 텍스트(히어로 오버레이 등 어두운 배경). */
  tone?: 'default' | 'inverse';
  size?: BrandLogoSize;
  className?: string;
};

// 버스트 원본 646×917(세로 비율 0.7045) — Next Image에는 실제 intrinsic 값을 전달하고,
// 화면 표시 크기는 className의 높이 고정 + w-auto로 비율을 지킨다(정사각형으로 찌그러뜨리지
// 않기 위함 — page.tsx의 정사각형 아이콘 패턴과 달리 이 버스트는 세로형이라 그대로 못 씀).
const BUST_INTRINSIC = { width: 646, height: 917 };

const BUST_HEIGHT_CLASS: Record<BrandLogoSize, string> = {
  sm: 'h-7',
  md: 'h-9',
  lg: 'h-12',
};

const WORDMARK_TEXT_CLASS: Record<BrandLogoSize, string> = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-xl',
};

export default function BrandLogo({
  variant = 'lockup',
  tone = 'default',
  size = 'md',
  className = '',
}: BrandLogoProps) {
  const textTone = tone === 'inverse' ? 'text-white' : 'text-brand-700';

  const bust = (
    <Image
      src="/brand/ajeossi-logo-bust.webp"
      alt={variant === 'bust' ? '전기아저씨' : ''}
      width={BUST_INTRINSIC.width}
      height={BUST_INTRINSIC.height}
      className={`w-auto shrink-0 ${BUST_HEIGHT_CLASS[size]}`}
    />
  );

  const wordmark = (
    <span className={`font-extrabold ${WORDMARK_TEXT_CLASS[size]} ${textTone}`}>전기아저씨</span>
  );

  if (variant === 'bust') {
    return <span className={`inline-flex ${className}`}>{bust}</span>;
  }

  if (variant === 'wordmark') {
    return (
      <span className={`inline-flex items-center ${className}`}>{wordmark}</span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {bust}
      {wordmark}
    </span>
  );
}
