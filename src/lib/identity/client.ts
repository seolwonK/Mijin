// 브라우저 측 본인인증 시작 헬퍼. 서버(src/lib/identity/index.ts)와 짝을 이룬다.
//   서버 IDENTITY_PROVIDER=portone → /api/identity/config 가 storeId·channelKey 를 내려주고,
//                                    PortOne V2 SDK 로 PASS/통신사 인증(PC: 팝업, 모바일: 리다이렉트)
//   그 외(미설정 포함)              → mock: 입력한 이름/휴대폰을 그대로 반환
// 반환값은 서버 /api/identity/verify 로 그대로 POST 한다.
// 서버가 이 값을 재검증하므로, 여기서 만든 값은 신뢰 대상이 아니다.
//
// 설정을 NEXT_PUBLIC_ 환경변수 대신 서버 API 로 받는 이유는 src/lib/identity/config.ts 참조.

import type { IdentityPublicConfig } from './config';

export type IdentityStartResult = {
  identityVerificationId?: string;
  name?: string;
  phone?: string;
};

type PortOneSDK = {
  requestIdentityVerification(req: {
    storeId: string;
    identityVerificationId: string;
    channelKey: string;
    redirectUrl?: string;
  }): Promise<{ code?: string; message?: string; identityVerificationId?: string }>;
};

declare global {
  interface Window {
    PortOne?: PortOneSDK;
  }
}

const PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js';

// 리다이렉트 복귀 시 URL 쿼리로 돌아오는 파라미터 이름(포트원 V2 SDK 규약).
export const REDIRECT_PARAM_ID = 'identityVerificationId';
export const REDIRECT_PARAM_CODE = 'code';
export const REDIRECT_PARAM_MESSAGE = 'message';

let configPromise: Promise<IdentityPublicConfig> | null = null;

export function fetchIdentityConfig(): Promise<IdentityPublicConfig> {
  if (!configPromise) {
    configPromise = fetch('/api/identity/config', { cache: 'no-store' })
      .then(async (res) => {
        const data = (await res.json()) as IdentityPublicConfig | { error?: string };
        if (!res.ok || !('provider' in data)) {
          throw new Error(
            ('error' in data && data.error) || '본인인증 설정을 불러오지 못했습니다',
          );
        }
        return data;
      })
      .catch((e) => {
        configPromise = null; // 일시 오류면 다음 시도에서 다시 받는다
        throw e;
      });
  }
  return configPromise;
}

// KCP(NHN KCP V2) 는 identityVerificationId 를 "영문 대소문자·숫자만, 40자 이하"로 제한한다
// (developers.portone.io/opi/ko/integration/pg/v2/kcp-v2-identity-verification). 포트원 일반
// 가이드의 `identity-verification-${uuid}` 예시는 하이픈 포함 57자라 KCP 채널에서 거부된다.
// 앞 8자리는 시각(base36) — 로그에서 순서를 읽기 좋고, 뒤 30자리는 CSPRNG 로 충돌을 막는다.
export function newIdentityVerificationId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  let rand = '';
  for (const b of bytes) rand += alphabet[b % alphabet.length];
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8);
  return `iv${ts}${rand}`; // 2 + 8 + 30 = 40자
}

function loadPortOne(): Promise<PortOneSDK> {
  if (window.PortOne) return Promise.resolve(window.PortOne);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PORTONE_SDK_URL}"]`,
    );
    const onLoad = () => {
      if (window.PortOne) resolve(window.PortOne);
      else reject(new Error('PortOne SDK 로드에 실패했습니다'));
    };
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('PortOne SDK 로드에 실패했습니다')),
        { once: true },
      );
      if (window.PortOne) resolve(window.PortOne);
      return;
    }
    const script = document.createElement('script');
    script.src = PORTONE_SDK_URL;
    script.onload = onLoad;
    script.onerror = () => reject(new Error('PortOne SDK 로드에 실패했습니다'));
    document.head.appendChild(script);
  });
}

// 화면 진입 시 미리 호출해 두면 클릭 시점에 설정 fetch·SDK 로드 대기가 없어진다 — 팝업은
// 사용자 클릭의 일시적 활성화(transient activation) 안에서 열려야 브라우저가 차단하지 않으므로,
// 클릭 뒤 네트워크 대기가 길어질수록 팝업 차단 위험이 커진다. 실패는 조용히 무시한다(클릭 시 재시도).
export function preloadIdentityVerification(): void {
  void fetchIdentityConfig()
    .then((config) => (config.provider === 'portone' ? loadPortOne() : undefined))
    .catch(() => undefined);
}

// PC 에서는 팝업으로 끝나 프로미스가 결과를 돌려준다. 모바일 대부분은 리다이렉트 방식이라
// 이 함수는 돌아오지 않고 페이지가 통째로 인증창으로 갔다가 redirectUrl 로 복귀한다 —
// 복귀 처리는 호출한 화면(tech/signup)이 URL 쿼리(REDIRECT_PARAM_*)로 한다.
// 따라서 호출 전에 화면 상태를 저장해 두는 것은 호출자 책임이며, onBeforeRedirect 로 그 시점을 준다.
export async function startIdentityVerification(input: {
  name: string;
  phone: string;
  redirectUrl: string;
  onBeforeRedirect?: () => void;
}): Promise<IdentityStartResult> {
  const config = await fetchIdentityConfig();
  if (config.provider !== 'portone') {
    // mock: 입력값을 그대로 넘긴다 (서버 mock provider 가 인증 처리)
    return { name: input.name, phone: input.phone };
  }

  const PortOne = await loadPortOne();
  input.onBeforeRedirect?.();
  const response = await PortOne.requestIdentityVerification({
    storeId: config.storeId,
    channelKey: config.channelKey,
    identityVerificationId: newIdentityVerificationId(),
    redirectUrl: input.redirectUrl,
  });

  if (response.code || !response.identityVerificationId) {
    throw new Error(response.message ?? '본인인증이 취소되었거나 실패했습니다');
  }
  return { identityVerificationId: response.identityVerificationId };
}
