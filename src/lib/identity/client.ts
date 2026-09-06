// 브라우저 측 본인인증 시작 헬퍼. 서버(src/lib/identity/index.ts)와 짝을 이룬다.
//   서버 IDENTITY_PROVIDER=kcp     → /api/identity/kcp/start 로 서버가 KCP 거래등록을 하고, 브라우저는
//                                    받은 call_url 에 form POST 로 KCP 인증창을 연다(PC: 팝업, 모바일: 페이지 전환).
//                                    결과는 /api/identity/kcp/return 이 팝업이면 postMessage, 페이지면 복귀 쿼리로 준다.
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

// 리다이렉트 복귀 시 URL 쿼리로 돌아오는 파라미터 이름(포트원 V2 SDK 규약 — KCP 직접 연동의
// /api/identity/kcp/return 도 같은 이름으로 돌려준다).
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

// ── NHN KCP 본인확인(V2) 직접 연동 ─────────────────────────────────────────────
// 팝업은 사용자 클릭의 일시적 활성화 안에서 **먼저** 열어 둔다(빈 창). 거래등록(fetch)이 끝난 뒤
// 열면 그 사이 활성화가 소진돼 브라우저가 팝업을 막는다. 열어 둔 창은 form.target 으로 채운다.
const KCP_POPUP_NAME = 'kcp_auth_popup';
const KCP_MESSAGE_TYPE = 'kcp-identity';
const KCP_RESULT_TIMEOUT_MS = 15 * 60_000;

type KcpStartResponse = {
  ok?: boolean;
  ordrIdxx?: string;
  regCertKey?: string;
  callUrl?: string;
  error?: string;
};

type KcpPopupMessage = {
  type?: string;
  ordrIdxx?: string;
  ok?: boolean;
  identityVerificationId?: string;
  code?: string;
  message?: string;
};

// 모바일은 페이지 전환 방식(KCP 가이드 3-3: kcp_page_submit_yn=Y). PASS 앱 전환·복귀가 팝업에서는 깨진다.
function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent);
}

function openKcpPopup(): Window | null {
  const width = 410;
  const height = 500;
  const left = Math.max(0, (screen.width - width) / 2);
  const top = Math.max(0, (screen.height - height) / 2);
  try {
    return window.open(
      '',
      KCP_POPUP_NAME,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,status=no,menubar=no,scrollbars=yes,resizable=no`,
    );
  } catch {
    return null;
  }
}

function submitKcpForm(callUrl: string, regCertKey: string, target: string): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = callUrl;
  form.target = target;
  form.style.display = 'none';
  const add = (name: string, value: string) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };
  add('reg_cert_key', regCertKey);
  add('kcp_page_submit_yn', target === '_self' ? 'Y' : 'N');
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function waitForKcpPopup(popup: Window, ordrIdxx: string): Promise<IdentityStartResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closedTimer);
      clearTimeout(timeout);
      fn();
    };
    const onMessage = (event: MessageEvent<KcpPopupMessage>) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== KCP_MESSAGE_TYPE || data.ordrIdxx !== ordrIdxx) return;
      if (data.ok && data.identityVerificationId) {
        finish(() => resolve({ identityVerificationId: data.identityVerificationId }));
      } else {
        finish(() => reject(new Error(data.message ?? '본인인증이 취소되었거나 실패했습니다')));
      }
    };
    window.addEventListener('message', onMessage);
    // 사용자가 창을 그냥 닫은 경우. 결과 메시지는 닫히기 직전에 오므로 잠깐 여유를 둔다.
    const closedTimer = setInterval(() => {
      if (popup.closed) {
        setTimeout(() => finish(() => reject(new Error('본인인증 창이 닫혔습니다. 다시 시도해 주세요.'))), 800);
      }
    }, 500);
    const timeout = setTimeout(
      () => finish(() => reject(new Error('본인인증 시간이 지났습니다. 다시 시도해 주세요.'))),
      KCP_RESULT_TIMEOUT_MS,
    );
  });
}

async function startKcpVerification(input: {
  redirectUrl: string;
  onBeforeRedirect?: () => void;
}): Promise<IdentityStartResult> {
  const popup = isMobileBrowser() ? null : openKcpPopup();
  const mode: 'POPUP' | 'PAGE' = popup ? 'POPUP' : 'PAGE';

  let started: KcpStartResponse;
  try {
    const res = await fetch('/api/identity/kcp/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, returnPath: new URL(input.redirectUrl, window.location.origin).pathname }),
    });
    started = (await res.json()) as KcpStartResponse;
    if (!res.ok || !started.ok || !started.ordrIdxx || !started.regCertKey || !started.callUrl) {
      throw new Error(started.error ?? '본인인증을 시작하지 못했습니다');
    }
  } catch (e) {
    popup?.close();
    throw e;
  }

  if (!popup) {
    // 페이지 전환: 이 페이지가 통째로 KCP 인증창으로 갔다가 redirectUrl 로 돌아온다(복귀 처리는 호출 화면).
    input.onBeforeRedirect?.();
    submitKcpForm(started.callUrl, started.regCertKey, '_self');
    return new Promise<IdentityStartResult>(() => undefined);
  }

  submitKcpForm(started.callUrl, started.regCertKey, KCP_POPUP_NAME);
  return waitForKcpPopup(popup, started.ordrIdxx);
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
  if (config.provider === 'kcp') {
    return startKcpVerification(input);
  }
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
