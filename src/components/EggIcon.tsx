import Image from 'next/image';

// 알 크레딧 아이콘 — Gemini 생성 브랜드 에셋(RGBA 투명 배경 256×256, 캐릭터 팔레트의
// 네이비 아웃라인·크림 셸과 동톤).
//   coin: 무표정 글로시 알 — 인라인 카운트·어드민 표기용 (public/brand/egg-coin.webp)
//   face: 스파클 얼굴 알 — 포털 잔액 카드 히어로용 (public/brand/egg-face.webp)
// 금액(원화) 표기 정책: 알은 어디서나 "개수"로만 표기한다. 원화 환산은 결제(충전) 폼
// 한 곳(AdminEggManager 충전 섹션)에만 존재 — 일반 웹 표면에 ₩를 다시 들이지 말 것.

const SRC = {
  coin: '/brand/egg-coin.webp',
  face: '/brand/egg-face.webp',
} as const;

export function EggIcon({
  size = 16,
  variant = 'coin',
  className,
}: {
  size?: number;
  variant?: keyof typeof SRC;
  className?: string;
}) {
  // 장식용 아이콘 — 인접 텍스트("N알")가 의미를 전달하므로 스크린리더에서는 숨긴다.
  return (
    <Image
      src={SRC[variant]}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`inline-block select-none align-[-0.125em] ${className ?? ''}`}
    />
  );
}

// 알 개수 인라인 표기 — 아이콘 + 숫자 + "알". 원화 환산 없음(정책).
export function EggCount({
  count,
  size = 15,
  className,
}: {
  count: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 font-mono ${className ?? ''}`}>
      <EggIcon size={size} />
      {count}알
    </span>
  );
}
