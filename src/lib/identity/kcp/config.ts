// NHN KCP 본인확인(V2) 직접 연동 설정 — 서버 전용(process.env).
//
// 값의 출처(KCP 상점관리자 partner.kcp.co.kr):
//   KCP_SITE_CD     사이트코드 (기술관리센터 > 인증센터 > 가맹점 인증키관리 상단, 예: PO046)
//   KCP_ENC_KEY     가맹점 인증키(ENC_KEY) — 같은 화면에서 발급. 거래등록 암호화·결과 복호화에 쓴다.
//                   외부 노출 금지, 브라우저에 절대 내려주지 않는다.
//   KCP_WEB_SITEID  웹사이트코드 12자 (부가서비스 > 휴대폰본인확인 > 웹사이트코드 설정). DI 생성 기준.
//                   비우면 KCP 가 사이트 기본값을 쓴다.
//   KCP_API_BASE    운영 https://cert.kcp.co.kr (기본) / 테스트 https://testcert.kcp.co.kr
//                   테스트 환경은 사이트코드 AO7F3 + KCP 샘플의 테스트 ENC_KEY 가 사전 발급돼 있다.
//   APP_BASE_URL    Ret_URL(인증 결과를 받을 우리 주소)의 원점. KCP 상점관리자의
//                   「인증결과URL 설정」에 등록된 도메인이어야 한다(미등록 도메인은 KCP 가 거부).
//                   비우면 요청의 x-forwarded-* 헤더로 계산한다.

export type KcpConfig = {
  siteCd: string;
  encKey: string;
  webSiteId: string;
  apiBase: string;
};

const DEFAULT_API_BASE = 'https://cert.kcp.co.kr';

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export function getKcpConfig(): KcpConfig {
  const siteCd = env('KCP_SITE_CD');
  const encKey = env('KCP_ENC_KEY');
  if (!siteCd || !encKey) {
    throw new Error(
      'KCP 본인확인 설정이 없습니다: IDENTITY_PROVIDER=kcp 이면 KCP_SITE_CD 와 KCP_ENC_KEY 가 필요합니다',
    );
  }
  if (!/^[A-Z0-9]{1,5}$/.test(siteCd)) {
    throw new Error('KCP_SITE_CD 형식 오류: 영문 대문자·숫자 5자 이하여야 합니다');
  }
  const webSiteId = env('KCP_WEB_SITEID');
  if (webSiteId && !/^[A-Za-z0-9]{1,12}$/.test(webSiteId)) {
    throw new Error('KCP_WEB_SITEID 형식 오류: 영숫자 12자 이하여야 합니다');
  }
  const apiBase = (env('KCP_API_BASE') || DEFAULT_API_BASE).replace(/\/+$/, '');
  return { siteCd, encKey, webSiteId, apiBase };
}

/** KCP 테스트 서버(testcert)를 보고 있는지 — 로그·화면 안내용. */
export function isKcpTestEnv(config: KcpConfig): boolean {
  return /testcert\.kcp\.co\.kr/.test(config.apiBase);
}
