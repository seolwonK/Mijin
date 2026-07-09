// 브라우저 측 본인인증 시작 헬퍼. 서버(src/lib/identity/index.ts)와 짝을 이룬다.
//   NEXT_PUBLIC_IDENTITY_PROVIDER=portone → PortOne SDK 로 PASS/통신사 인증 팝업
//   그 외(미설정 포함)                    → mock: 입력한 이름/휴대폰을 그대로 반환
// 반환값은 서버 /api/identity/verify 로 그대로 POST 한다.
// 서버가 이 값을 재검증하므로, 여기서 만든 값은 신뢰 대상이 아니다.

export type IdentityStartResult = {
  identityVerificationId?: string;
  name?: string;
  phone?: string;
};

const PROVIDER = process.env.NEXT_PUBLIC_IDENTITY_PROVIDER ?? 'mock';

type PortOneSDK = {
  requestIdentityVerification(req: {
    storeId: string;
    identityVerificationId: string;
    channelKey: string;
  }): Promise<{ code?: string; message?: string; identityVerificationId?: string }>;
};

declare global {
  interface Window {
    PortOne?: PortOneSDK;
  }
}

const PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js';

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

export async function startIdentityVerification(input: {
  name: string;
  phone: string;
}): Promise<IdentityStartResult> {
  if (PROVIDER !== 'portone') {
    // mock: 입력값을 그대로 넘긴다 (서버 mock provider 가 인증 처리)
    return { name: input.name, phone: input.phone };
  }

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
  if (!storeId || !channelKey) {
    throw new Error(
      '본인인증 설정(NEXT_PUBLIC_PORTONE_STORE_ID / CHANNEL_KEY)이 없습니다',
    );
  }

  const PortOne = await loadPortOne();
  const response = await PortOne.requestIdentityVerification({
    storeId,
    channelKey,
    identityVerificationId: `identity-verification-${crypto.randomUUID()}`,
  });

  if (response.code || !response.identityVerificationId) {
    throw new Error(response.message ?? '본인인증이 취소되었거나 실패했습니다');
  }
  return { identityVerificationId: response.identityVerificationId };
}
