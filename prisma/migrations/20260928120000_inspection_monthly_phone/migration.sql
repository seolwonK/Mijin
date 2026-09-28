-- 정기 전기점검 개편 (사용자 결정 2026-09-28)
--   분기 1회 방문(연 4회, 연 50,000원) → 1년에 12회 · 원하는 날짜 · 전화(유선) 점검,
--   필요할 때만 플랫폼 판단으로 방문 점검. 1년권(월 7,700원)·2년권(월 5,500원) 일시 입금.
-- 기존 구독도 새 방식으로 일괄 전환한다(사용자 결정) — 1년권(12개월)으로 보고, 이미 받은
-- 방문 기록은 그대로 회차 1~4 로 남는다.

-- CreateEnum
CREATE TYPE "InspectionMethod" AS ENUM ('PHONE', 'ONSITE');

-- 이용 기간(개월). 기존 구독은 모두 1년짜리였다.
ALTER TABLE "InspectionPlan" ADD COLUMN "termMonths" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "InspectionPlan"
  ADD CONSTRAINT "InspectionPlan_termMonths_allowed" CHECK ("termMonths" IN (12, 24));

-- 분기(quarter) → 회차(round). 값은 그대로 이어진다(기존 1~4 회차).
ALTER TABLE "InspectionVisit" DROP CONSTRAINT "InspectionVisit_quarter_range";
ALTER TABLE "InspectionVisit" RENAME COLUMN "quarter" TO "round";
ALTER INDEX "InspectionVisit_planId_quarter_key" RENAME TO "InspectionVisit_planId_round_key";
ALTER TABLE "InspectionVisit"
  ADD CONSTRAINT "InspectionVisit_round_range" CHECK ("round" BETWEEN 1 AND 24);

-- 점검 방식. 새 방식의 기본은 전화 점검이고, 이미 다녀온(완료) 방문만 방문 점검으로 기록한다.
ALTER TABLE "InspectionVisit" ADD COLUMN "method" "InspectionMethod" NOT NULL DEFAULT 'PHONE';
UPDATE "InspectionVisit" SET "method" = 'ONSITE' WHERE "status" = 'COMPLETED';

-- 연 50,000원 요금제는 폐지(사용자 결정 2026-09-28). 아직 입금 전인 신청은 새 1년권
-- 총액(월 7,700원 × 12 = 92,400원)으로 받는다. 이미 입금된 구독의 priceWon 은 실제로 받은
-- 금액 기록이라 바꾸지 않는다. 기존 고객 대상 별도 안내는 하지 않는다(사용자 결정).
UPDATE "InspectionPlan" SET "priceWon" = 92400
  WHERE "status" = 'PENDING_PAYMENT' AND "termMonths" = 12 AND "priceWon" = 50000;
