import type { KcpReturnOutcome } from './session';

// Ret_URL(/api/identity/kcp/return) 응답 조립 — 라우트 파일은 HTTP 핸들러 외 export 를 못 하므로
// 여기서 만들어 단위테스트로 못박는다. 이 파일이 다루는 값은 전부 KCP 가 보낸 것(res_msg 등)이라
// 신뢰하지 않는 입력이다.

export const KCP_POPUP_MESSAGE_TYPE = 'kcp-identity';

export function withParams(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const query = q.toString();
  return query ? `${path}?${query}` : path;
}

/** 복귀 주소 — client.ts 의 REDIRECT_PARAM_* 규약(identityVerificationId 또는 code/message)을 따른다. */
export function redirectTargetOf(outcome: KcpReturnOutcome): string {
  return outcome.ok
    ? withParams(outcome.returnPath, { identityVerificationId: outcome.ordrIdxx })
    : withParams(outcome.returnPath, { code: outcome.code, message: outcome.message });
}

/** `</script>`·`<!--`·U+2028/2029 가 KCP 의 res_msg 로 섞여 들어와도 인라인 스크립트를 깨지 못하게 한다. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function popupMessageOf(outcome: KcpReturnOutcome) {
  return {
    type: KCP_POPUP_MESSAGE_TYPE,
    ordrIdxx: outcome.ordrIdxx,
    ok: outcome.ok,
    identityVerificationId: outcome.ok ? outcome.ordrIdxx : undefined,
    code: outcome.code,
    message: outcome.message,
  };
}

/** 팝업 복귀 HTML — opener 가 있으면 결과를 넘기고 닫는다. 없으면(팝업이 아니었다면) 페이지 전환과 같이 이동. */
export function popupHtml(outcome: KcpReturnOutcome): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>본인인증 처리 중</title>
<meta name="robots" content="noindex"></head>
<body style="font-family:sans-serif;padding:24px;text-align:center;color:#444">
<p>본인인증 결과를 전달하고 있습니다…</p>
<script>
(function () {
  var result = ${jsonForScript(popupMessageOf(outcome))};
  var fallback = ${jsonForScript(redirectTargetOf(outcome))};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(result, window.location.origin);
      window.close();
      return;
    }
  } catch (e) {}
  window.location.replace(fallback);
})();
</script>
</body></html>`;
}
