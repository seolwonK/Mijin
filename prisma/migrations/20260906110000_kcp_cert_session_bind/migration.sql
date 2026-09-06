-- KCP 거래를 시작한 브라우저와 결과조회 요청을 묶는 바인딩 해시.
-- /api/identity/kcp/start 가 httpOnly 쿠키로 내려준 비밀의 SHA-256 을 저장하고, /api/identity/verify 는
-- 같은 쿠키를 요구한다. ordr_idxx·reg_cert_key 는 브라우저에 나가는 공개값이라 이것만으로 거래를
-- 식별하면 "남이 만든 거래를 피해자가 인증하고 공격자가 토큰을 받는" 경로가 열린다(코드 리뷰 지적).
ALTER TABLE "KcpCertSession" ADD COLUMN "bindHash" TEXT;
