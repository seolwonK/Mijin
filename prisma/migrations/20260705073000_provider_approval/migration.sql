-- CreateEnum
CREATE TYPE "ProviderApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "approvalStatus" "ProviderApproval" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "bizCertPath" TEXT,
ADD COLUMN     "bizRegNo" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Provider_bizRegNo_key" ON "Provider"("bizRegNo");

-- 기존(관리자 직접 등록) 업체는 승인 상태 유지
UPDATE "Provider" SET "approvalStatus" = 'APPROVED', "approvedAt" = CURRENT_TIMESTAMP;
