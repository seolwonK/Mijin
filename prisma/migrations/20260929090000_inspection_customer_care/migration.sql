-- 전기점검 고객 관리 (2026-09-29): 회차별 점검 결과 기록 + 구독 환불 기록.
-- 모두 널 허용 컬럼 추가뿐이라 기존 행에 영향이 없다.

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('NORMAL', 'CAUTION', 'NEEDS_VISIT');

ALTER TABLE "InspectionVisit" ADD COLUMN "result" "InspectionResult";
ALTER TABLE "InspectionVisit" ADD COLUMN "resultNote" TEXT;

ALTER TABLE "InspectionPlan" ADD COLUMN "refundedWon" INTEGER;
ALTER TABLE "InspectionPlan" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "InspectionPlan" ADD COLUMN "refundNote" TEXT;
ALTER TABLE "InspectionPlan"
  ADD CONSTRAINT "InspectionPlan_refund_positive" CHECK ("refundedWon" IS NULL OR "refundedWon" > 0);
