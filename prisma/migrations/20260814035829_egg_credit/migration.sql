-- CreateEnum
CREATE TYPE "EggLedgerReason" AS ENUM ('CHARGE', 'ACCEPT_SPEND', 'ADMIN_ADJUST');

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "eggBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Technician" ADD COLUMN     "eggBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EggLedger" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "technicianId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" "EggLedgerReason" NOT NULL,
    "memo" TEXT,
    "actorAdminUserId" TEXT,
    "assignmentId" TEXT,
    "chargeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EggLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EggLedger_assignmentId_key" ON "EggLedger"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EggLedger_chargeKey_key" ON "EggLedger"("chargeKey");

-- CreateIndex
CREATE INDEX "EggLedger_providerId_createdAt_idx" ON "EggLedger"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "EggLedger_technicianId_createdAt_idx" ON "EggLedger"("technicianId", "createdAt");

-- 알 장부 XOR 강제: 업체/기술자 중 정확히 하나 (CommissionEntry·Assignment 전례와 동일 idiom)
ALTER TABLE "EggLedger" ADD CONSTRAINT "EggLedger_target_xor" CHECK (num_nonnulls("providerId", "technicianId") = 1);
