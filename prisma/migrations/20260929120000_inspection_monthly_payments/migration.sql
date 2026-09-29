-- 전기구독 매월 자동이체 (사용자 결정 2026-09-29): 첫 달 입금 확인일과 같은 날 매월 납부,
-- 미납은 관리자 표시만, 위약금 없는 해지.

ALTER TABLE "InspectionPlan" ADD COLUMN "monthlyWon" INTEGER;

-- 아직 입금 전인 신청은 새 방식(매월 자동이체)으로 받는다 — 요금표 총액과 맞는 것만 월 요금을 채운다.
-- 이미 입금된 구독(개편 전 일시 입금)은 null 로 둔다: 더 받을 돈이 없다.
UPDATE "InspectionPlan" SET "monthlyWon" = "priceWon" / "termMonths"
  WHERE "status" = 'PENDING_PAYMENT'
    AND (("termMonths" = 12 AND "priceWon" = 92400) OR ("termMonths" = 24 AND "priceWon" = 132000));

-- CreateTable
CREATE TABLE "InspectionPayment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountWon" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InspectionPayment_planId_seq_key" ON "InspectionPayment"("planId", "seq");
CREATE INDEX "InspectionPayment_dueDate_paidAt_idx" ON "InspectionPayment"("dueDate", "paidAt");

ALTER TABLE "InspectionPayment" ADD CONSTRAINT "InspectionPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InspectionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InspectionPayment"
  ADD CONSTRAINT "InspectionPayment_seq_range" CHECK ("seq" BETWEEN 1 AND 24);
ALTER TABLE "InspectionPayment"
  ADD CONSTRAINT "InspectionPayment_amount_positive" CHECK ("amountWon" > 0);
