-- NHN KCP 본인확인(V2) 직접 연동의 거래 세션.
--
-- 포트원 경유를 걷어내고 앱이 KCP 를 직접 호출한다. KCP 흐름은 거래등록(reg_cert_key 발급) →
-- 인증창 → Ret_URL 콜백 → 결과조회·복호화 인데, 가이드(3-3)는 콜백으로 내려온 reg_cert_key 를
-- 가맹점 DB 의 값과 대조하라고 못박는다. 그래서 세션이 아니라 이 테이블에 거래를 남긴다.
-- 인증이 끝나면 결과를 IdentityVerification(우리 토큰)으로 옮기고 이 행은 소비 표시만 남긴다 —
-- 실명·CI/DI 는 여기 저장하지 않는다.
CREATE TABLE "KcpCertSession" (
    "ordrIdxx" TEXT NOT NULL,
    "regCertKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "returnPath" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resCd" TEXT,
    "resMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "authedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "KcpCertSession_pkey" PRIMARY KEY ("ordrIdxx")
);

CREATE UNIQUE INDEX "KcpCertSession_regCertKey_key" ON "KcpCertSession"("regCertKey");

CREATE INDEX "KcpCertSession_expiresAt_idx" ON "KcpCertSession"("expiresAt");
