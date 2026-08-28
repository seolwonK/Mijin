// 본인인증 설정 — 서버 전용(process.env 를 읽는다). 브라우저는 /api/identity/config 로 이 값을 받는다.
//
// NEXT_PUBLIC_* 을 쓰지 않는 이유: NEXT_PUBLIC_ 값은 `next build` 시점에 번들에 인라인되는데,
// CloudType(Dockerfile 프리셋)은 환경변수를 컨테이너 런타임에만 주입한다. 그래서 빌드 산출물에는
// 빈 값이 박혀 실서비스에서 "본인인증 설정이 없습니다"로 죽는다(2026-08-24 연동 점검에서 확인).
// 런타임에 서버가 읽어 내려주면 배포 환경변수만 바꿔도 즉시 반영되고, 서버 provider 와
// 클라이언트 provider 가 IDENTITY_PROVIDER 하나로 항상 같이 움직인다(둘이 엇갈릴 여지 제거).
//
// Store ID·채널 키는 브라우저 SDK 호출에 그대로 쓰이는 공개 식별자라 내려줘도 된다.
// API Secret(PORTONE_API_SECRET)은 서버 검증(portone.ts)에서만 쓰고 절대 내려주지 않는다.

export type IdentityProviderName = 'portone' | 'mock';

export type IdentityPublicConfig =
  | { provider: 'mock' }
  | { provider: 'portone'; storeId: string; channelKey: string };

// 인증 완료 후 가입까지 허용하는 시간. 두 곳에서 같은 창을 쓴다.
//   1) 우리가 발급한 verificationId 의 수명(index.ts)
//   2) 대행사 인증 완료 시각(verifiedAt)의 신선도 한계(portone.ts)
// 2)가 없으면 몇 달 전 인증건의 identityVerificationId 를 지금 제출해도 통과한다.
export const IDENTITY_TTL_MS = 10 * 60_000;

function env(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return '';
}

export function identityProviderName(): IdentityProviderName {
  if (process.env.IDENTITY_PROVIDER?.trim() === 'portone') return 'portone';
  // 프로덕션에서 IDENTITY_PROVIDER 를 빠뜨리면 조용히 mock 으로 떨어져 **무인증 가입**이 열린다
  // (mock 은 사용자가 입력한 이름·번호를 그대로 인증 처리한다). 설정 누락을 통과시키는 대신
  // 여기서 던져서 가입 화면과 /api/identity/verify 가 모두 닫히게 한다(fail-closed).
  // 실서비스 배포본으로 로컬 점검을 할 때만 ALLOW_MOCK_IDENTITY=1 로 의도적으로 연다.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_MOCK_IDENTITY?.trim() !== '1'
  ) {
    throw new Error(
      '본인인증 설정 오류: 프로덕션에서는 IDENTITY_PROVIDER=portone 이어야 합니다 (mock 은 무인증 가입을 허용합니다)',
    );
  }
  return 'mock';
}

// 기존 배포가 NEXT_PUBLIC_ 이름으로 값을 넣어 뒀을 수 있어 폴백으로 함께 읽는다.
export function getIdentityPublicConfig(): IdentityPublicConfig {
  if (identityProviderName() !== 'portone') return { provider: 'mock' };
  const storeId = env('PORTONE_STORE_ID', 'NEXT_PUBLIC_PORTONE_STORE_ID');
  const channelKey = env('PORTONE_CHANNEL_KEY', 'NEXT_PUBLIC_PORTONE_CHANNEL_KEY');
  if (!storeId || !channelKey) {
    throw new Error(
      '본인인증 설정이 없습니다: IDENTITY_PROVIDER=portone 이면 PORTONE_STORE_ID 와 PORTONE_CHANNEL_KEY 가 필요합니다',
    );
  }
  return { provider: 'portone', storeId, channelKey };
}
