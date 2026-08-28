-- CI/DI 평문 보관 폐지 → 키 해시(HMAC-SHA256)만 저장.
--
-- CI(연계정보)·DI(중복가입확인정보)는 개인을 영구 식별하는 값인데, 이 서비스가 그 값으로
-- 하는 일은 "같은 사람인가" 비교뿐이라 되돌릴 수 있는 형태로 둘 이유가 없었다.
-- 실제로 코드 어디에서도 읽지 않은 채 평문으로만 쌓이고 있었다.
--
-- ⚠️ 기존 행의 평문 CI/DI 는 이 마이그레이션에서 열과 함께 영구 삭제된다(복구 불가).
--    의도된 파기다 — 쓰이지 않는 평문 고유식별정보를 남겨 둘 이유가 없다.
--    새 행부터는 src/lib/identity/hash.ts 가 만든 해시가 ciHash/diHash 에 들어간다.
DROP INDEX IF EXISTS "IdentityVerification_ci_idx";

ALTER TABLE "IdentityVerification" DROP COLUMN "ci";
ALTER TABLE "IdentityVerification" DROP COLUMN "di";

ALTER TABLE "IdentityVerification" ADD COLUMN "ciHash" TEXT;
ALTER TABLE "IdentityVerification" ADD COLUMN "diHash" TEXT;

CREATE INDEX "IdentityVerification_ciHash_idx" ON "IdentityVerification"("ciHash");
