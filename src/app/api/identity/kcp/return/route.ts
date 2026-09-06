import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_RETURN_PATH, recordKcpReturn, type KcpReturnOutcome } from '@/lib/identity/kcp/session';

// NHN KCP 본인확인(V2) Ret_URL — 인증창이 끝나면 KCP 가 이 주소로 form POST 한다(res_cd, res_msg, reg_cert_key).
// 이 요청은 사용자의 브라우저(팝업 또는 모바일 전체 페이지)에서 온다. 여기서 하는 일은 둘뿐이다:
//   1) reg_cert_key 를 DB 의 거래와 대조해 인증창 결과를 기록한다(session.ts).
//   2) 사용자를 원래 화면으로 돌려보낸다 — 팝업이면 opener 에 postMessage 후 닫고,
//      페이지 전환(모바일)이면 returnPath 로 303 리다이렉트한다. 복귀 파라미터 규약은 client.ts 의
//      REDIRECT_PARAM_* 과 같다(identityVerificationId 또는 code/message).
// 신원 정보는 여기서 다루지 않는다 — /api/identity/verify 가 KCP 결과조회로 직접 받는다.
// 그래서 이 엔드포인트를 위조 호출해도 "인증 성공" 상태 표시 외에 얻을 것이 없고, 그 표시조차
// 결과조회에서 KCP 가 거부하면 무효다.

export const dynamic = 'force-dynamic';

const POPUP_MESSAGE_TYPE = 'kcp-identity';

async function readFields(req: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const type = req.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const json = (await req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json ?? {})) if (typeof v === 'string') out[k] = v;
      return out;
    }
    if (type.includes('multipart/form-data')) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v;
      return out;
    }
    // KCP 기본: application/x-www-form-urlencoded (content-type 이 빠진 경우도 같은 방식으로 시도)
    const params = new URLSearchParams(await req.text());
    for (const [k, v] of params.entries()) out[k] = v;
  } catch {
    // 본문이 깨진 경우 — 아래에서 "거래 없음"으로 처리된다.
  }
  return out;
}

function withParams(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const query = q.toString();
  return query ? `${path}?${query}` : path;
}

function redirectTargetOf(outcome: KcpReturnOutcome): string {
  return outcome.ok
    ? withParams(outcome.returnPath, { identityVerificationId: outcome.ordrIdxx })
    : withParams(outcome.returnPath, { code: outcome.code, message: outcome.message });
}

// `</script>` 등이 KCP 의 res_msg 로 섞여 들어와도 스크립트를 깨지 못하게 한다.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** 팝업 복귀 — opener 가 있으면 결과를 넘기고 닫는다. 없으면(팝업이 아니었다면) 페이지 전환과 같이 이동. */
function popupHtml(outcome: KcpReturnOutcome): NextResponse {
  const message = {
    type: POPUP_MESSAGE_TYPE,
    ordrIdxx: outcome.ordrIdxx,
    ok: outcome.ok,
    identityVerificationId: outcome.ok ? outcome.ordrIdxx : undefined,
    code: outcome.code,
    message: outcome.message,
  };
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>본인인증 처리 중</title>
<meta name="robots" content="noindex"></head>
<body style="font-family:sans-serif;padding:24px;text-align:center;color:#444">
<p>본인인증 결과를 전달하고 있습니다…</p>
<script>
(function () {
  var result = ${jsonForScript(message)};
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
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** 페이지 전환 복귀 — 상대 경로 Location 으로 303. 프록시 뒤의 내부 원점을 밖으로 흘리지 않는다. */
function pageRedirect(outcome: KcpReturnOutcome): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: redirectTargetOf(outcome), 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  const fields = await readFields(req);
  const regCertKey = (fields.reg_cert_key ?? '').trim();
  const resCd = (fields.res_cd ?? '').trim();
  const resMsg = (fields.res_msg ?? '').trim();

  let outcome: KcpReturnOutcome | null = null;
  if (regCertKey) {
    try {
      outcome = await recordKcpReturn({ regCertKey, resCd, resMsg });
    } catch (e) {
      console.error('[identity/kcp/return] 결과 기록 실패', e);
    }
  }

  if (!outcome) {
    // 모르는 거래 — 어느 화면·어느 방식에서 왔는지 알 수 없으니 팝업/페이지 양쪽을 다 처리하는 HTML 로 답한다.
    return popupHtml({
      ordrIdxx: '',
      mode: 'POPUP',
      returnPath: DEFAULT_RETURN_PATH,
      ok: false,
      code: 'KCP_UNKNOWN',
      message: '본인인증 거래를 찾을 수 없습니다. 다시 시도해 주세요.',
    });
  }

  return outcome.mode === 'PAGE' ? pageRedirect(outcome) : popupHtml(outcome);
}
