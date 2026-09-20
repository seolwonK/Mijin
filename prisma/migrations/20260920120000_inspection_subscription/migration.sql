-- CreateEnum
CREATE TYPE "InspectionPlanStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InspectionVisitStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InspectionTimeSlot" AS ENUM ('MORNING', 'AFTERNOON', 'ANY');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOMER';

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "inspectionBankAccountHolder" TEXT,
ADD COLUMN     "inspectionBankAccountNumber" TEXT,
ADD COLUMN     "inspectionBankName" TEXT;

-- CreateTable
CREATE TABLE "InspectionPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressDetail" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "memo" TEXT,
    "status" "InspectionPlanStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "priceWon" INTEGER NOT NULL,
    "depositorName" TEXT NOT NULL,
    "paidConfirmedAt" TIMESTAMP(3),
    "paidConfirmedByUserId" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionVisit" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "preferredDate" DATE NOT NULL,
    "timeSlot" "InspectionTimeSlot" NOT NULL DEFAULT 'ANY',
    "status" "InspectionVisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "adminMemo" TEXT,
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectionPlan_status_createdAt_idx" ON "InspectionPlan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InspectionPlan_userId_createdAt_idx" ON "InspectionPlan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InspectionVisit_preferredDate_status_idx" ON "InspectionVisit"("preferredDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionVisit_planId_quarter_key" ON "InspectionVisit"("planId", "quarter");

-- AddForeignKey
ALTER TABLE "InspectionPlan" ADD CONSTRAINT "InspectionPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionVisit" ADD CONSTRAINT "InspectionVisit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InspectionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── 스키마 문법으로 표현할 수 없는 불변식 (EggLedger CHECK 제약 전례) ──────────────

-- 한 계정이 동시에 여러 구독을 들 수 없다. 종료(EXPIRED)·취소(CANCELED)된 구독은 제외해
-- 1년 뒤 갱신 신청은 그대로 통과시킨다. 부분 유니크 인덱스는 Prisma 스키마 문법에 없어
-- 여기에만 존재한다 — 앱(api/inspection/apply)의 사전 검사가 1차, 이 인덱스가 최종 방어선.
CREATE UNIQUE INDEX "InspectionPlan_one_open_per_user"
  ON "InspectionPlan"("userId")
  WHERE "status" IN ('PENDING_PAYMENT', 'ACTIVE');

-- 분기는 1~4 뿐이다. quarter 는 Int 라 타입만으로는 막히지 않는다.
ALTER TABLE "InspectionVisit"
  ADD CONSTRAINT "InspectionVisit_quarter_range" CHECK ("quarter" BETWEEN 1 AND 4);

-- 구독 기간은 상태와 짝을 이룬다: 입금 확인 전에는 기간이 없고, 활성화된 뒤에는 반드시 있다.
-- 취소는 활성화 전후 어느 쪽에서도 일어날 수 있어 기간 유무를 강제하지 않는다.
ALTER TABLE "InspectionPlan"
  ADD CONSTRAINT "InspectionPlan_term_matches_status" CHECK (
    ("status" = 'PENDING_PAYMENT' AND "startDate" IS NULL AND "endDate" IS NULL)
    OR ("status" IN ('ACTIVE', 'EXPIRED') AND "startDate" IS NOT NULL AND "endDate" IS NOT NULL)
    OR "status" = 'CANCELED'
  );
