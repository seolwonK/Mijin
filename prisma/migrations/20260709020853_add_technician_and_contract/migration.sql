-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('DAILY', 'PERMANENT');

-- CreateEnum
CREATE TYPE "WageType" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('BANK_TRANSFER', 'DIRECT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TECHNICIAN';

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_providerId_fkey";

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "employerAddress" TEXT,
ADD COLUMN     "employerBizRegNo" TEXT,
ADD COLUMN     "employerCeo" TEXT,
ADD COLUMN     "employerName" TEXT NOT NULL DEFAULT '미진전기',
ADD COLUMN     "employerPhone" TEXT;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "technicianId" TEXT,
ALTER COLUMN "providerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Technician" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "memo" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "approvalStatus" "ProviderApproval" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "workLocation" TEXT NOT NULL,
    "jobDescription" TEXT NOT NULL,
    "workStartTime" TEXT,
    "workEndTime" TEXT,
    "breakStartTime" TEXT,
    "breakEndTime" TEXT,
    "hoursNote" TEXT,
    "workDays" TEXT NOT NULL,
    "weeklyHoliday" TEXT,
    "wageType" "WageType",
    "wageAmount" INTEGER,
    "bonusExists" BOOLEAN NOT NULL DEFAULT false,
    "bonusAmount" INTEGER,
    "otherPayExists" BOOLEAN NOT NULL DEFAULT false,
    "otherPayDesc" TEXT,
    "otherPayAmount" INTEGER,
    "payDate" TEXT,
    "payMethod" "PayMethod",
    "annualLeaveNote" TEXT DEFAULT '근로기준법에 따라 부여',
    "insuranceEmployment" BOOLEAN NOT NULL DEFAULT true,
    "insuranceAccident" BOOLEAN NOT NULL DEFAULT true,
    "insurancePension" BOOLEAN NOT NULL DEFAULT true,
    "insuranceHealth" BOOLEAN NOT NULL DEFAULT true,
    "workerAddress" TEXT,
    "workerSignatureName" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Technician_userId_key" ON "Technician"("userId");

-- CreateIndex
CREATE INDEX "Technician_approvalStatus_idx" ON "Technician"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentContract_technicianId_key" ON "EmploymentContract"("technicianId");

-- CreateIndex
CREATE INDEX "Assignment_technicianId_status_idx" ON "Assignment"("technicianId", "status");

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 배정 대상은 업체(providerId) 또는 개인기술자(technicianId) 중 정확히 하나여야 한다 (XOR 불변식)
ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_one_assignee" CHECK (num_nonnulls("providerId", "technicianId") = 1);
