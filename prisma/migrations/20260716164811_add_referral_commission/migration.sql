-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "referredByUserId" TEXT;

-- AlterTable
ALTER TABLE "Technician" ADD COLUMN     "referredByUserId" TEXT;

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "providerId" TEXT,
    "technicianId" TEXT,
    "surveyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEntry_surveyId_key" ON "CommissionEntry"("surveyId");

-- CreateIndex
CREATE INDEX "CommissionEntry_referrerUserId_status_idx" ON "CommissionEntry"("referrerUserId", "status");

-- CreateIndex
CREATE INDEX "Provider_referredByUserId_idx" ON "Provider"("referredByUserId");

-- CreateIndex
CREATE INDEX "Technician_referredByUserId_idx" ON "Technician"("referredByUserId");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 피소개자 스냅샷은 업체(providerId) 또는 개인기술자(technicianId) 중 정확히 하나여야 한다 (XOR 불변식)
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "commission_entry_one_target" CHECK (num_nonnulls("providerId", "technicianId") = 1);
