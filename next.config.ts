import type { NextConfig } from "next";
import os from "os";

// next dev를 폰(내부 IP)에서 열 때 dev 에셋의 교차 출처 요청을 허용
const lanIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

// 전 응답 공통 보안 헤더. 본인확인 이용기관 점검(6번 접근통제·7번 안전한 통신)에서
// 브라우저 측 방어선으로 함께 확인되는 항목들이다. 앱이 직접 내려 CDN/프록시 설정에
// 의존하지 않게 한다(CloudType 엣지가 HSTS 를 주지만 max-age 가 182일뿐이라 여기서 1년으로 올린다).
//
// Content-Security-Policy 는 의도적으로 넣지 않았다. 본인인증은 cdn.portone.io 스크립트 로드 +
// PASS 인증창 팝업/리다이렉트로 동작하는데, 통신사·대행사 도메인이 채널 구성에 따라 달라져
// 실인증 흐름 전수 확인 없이 CSP 를 걸면 가입 자체가 조용히 막힌다. 실연동 채널로 전 통신사
// 흐름을 실측한 뒤 별도로 도입할 것.
const securityHeaders = [
  // HTTPS 고정. 평문 HTTP 로 접근하는 브라우저가 없도록 1년간 강제한다.
  // HTTP 응답에서는 브라우저가 무시하므로 로컬 개발에 영향이 없다.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // 응답 Content-Type 을 브라우저가 임의 추론하지 않게 한다 (업로드 파일 경유 XSS 차단).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 가입·관리자 화면이 외부 사이트 iframe 에 실려 클릭재킹당하는 것을 막는다.
  // 본인인증은 팝업/리다이렉트 방식이라 우리 페이지가 프레임될 일이 없다.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // 외부로 나갈 때 경로·쿼리를 빼고 출처만 보낸다 (조회코드 등이 리퍼러로 새지 않게).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 쓰는 기능만 자기 출처에 허용: 접수 사진(카메라)·음성 녹음(마이크)·현장 위치(위치).
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), payment=()",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", ...lanIPs],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
