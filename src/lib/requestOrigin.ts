// 교차 사이트 요청 판별 — 로그인 CSRF(공격자 계정으로 몰래 로그인시키기)·강제 로그아웃 방지용.
//
// 세션 쿠키가 SameSite=Lax 라 교차 사이트 POST 에 쿠키가 실리지는 않지만, 로그인·로그아웃은
// 쿠키 없이도 **응답의 Set-Cookie 로** 피해자 브라우저 상태를 바꾼다. 그래서 브라우저가 붙이는
// Origin / Sec-Fetch-Site 로 출처를 확인한다.
//
// Origin 이 없는 요청(curl·서버 간 호출·Playwright request fixture)은 통과시킨다 — 브라우저는
// 교차 출처 POST 에 Origin 을 반드시 붙이므로, 없다는 것은 브라우저 CSRF 가 아니라는 뜻이다.

function firstHost(value: string | null): string | null {
  const v = value?.split(',')[0]?.trim().toLowerCase();
  return v ? v : null;
}

/**
 * 호스트만 비교한다(프로토콜 제외). 프록시(CloudType) 뒤에서는 앱이 보는 요청 URL 이 http 이고
 * 브라우저 Origin 은 https 라 프로토콜까지 비교하면 운영에서 정상 요청이 막힌다. 브라우저는
 * Origin 호스트를 페이지가 위조할 수 없으므로 호스트 일치만으로 동일 출처를 판정하기에 충분하다.
 */
export function isCrossSiteRequest(req: { headers: Headers; url: string }): boolean {
  if (req.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') return true;

  const origin = req.headers.get('origin');
  if (origin == null) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // 'null'(샌드박스 iframe·file://) 등 파싱 불가 Origin 은 출처를 증명하지 못한다.
    return true;
  }
  if (!originHost) return true;

  const allowed = new Set<string>();
  const fwd = firstHost(req.headers.get('x-forwarded-host'));
  if (fwd) allowed.add(fwd);
  const host = firstHost(req.headers.get('host'));
  if (host) allowed.add(host);
  try {
    allowed.add(new URL(req.url).host.toLowerCase());
  } catch {
    /* 상대 URL 등 — 헤더 기반 후보만 쓴다 */
  }
  return !allowed.has(originHost);
}
