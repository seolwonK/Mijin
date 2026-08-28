-- 본인확인 재사용(리플레이) 방지 키.
--
-- 기존에는 같은 대행사 인증건(PortOne identityVerificationId)으로 /api/identity/verify 를
-- 반복 호출하면 그때마다 새 IdentityVerification 행이 생겨, 한 번의 실제 통신사 인증으로
-- 가입 토큰을 무제한 발급받을 수 있었다. consumedAt CAS 는 발급된 토큰 1건의 재사용만 막을 뿐
-- "인증 1건 → 토큰 N건"은 막지 못한다. 이 유니크 인덱스가 그 구멍을 DB 차원에서 닫는다.
--
-- 기존 행은 replayKey 가 NULL 로 남는다. Postgres 는 유니크 인덱스에서 NULL 중복을 허용하므로
-- 과거 인증 이력을 지우거나 고치지 않고도 인덱스를 안전하게 생성할 수 있다
-- (mock provider 시절 행은 providerRef 가 "mock-<번호>"라 중복이 있을 수 있어, 기존 열에
--  유니크를 거는 방식은 배포 중 마이그레이션 실패로 이어진다).
ALTER TABLE "IdentityVerification" ADD COLUMN "replayKey" TEXT;

CREATE UNIQUE INDEX "IdentityVerification_replayKey_key" ON "IdentityVerification"("replayKey");
