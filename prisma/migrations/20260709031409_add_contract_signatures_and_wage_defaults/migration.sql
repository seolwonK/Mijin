-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "defaultDailyWage" INTEGER,
ADD COLUMN     "defaultMonthlyWage" INTEGER,
ADD COLUMN     "defaultPayDate" TEXT,
ADD COLUMN     "defaultPayMethod" "PayMethod",
ADD COLUMN     "employerSignatureDataUrl" TEXT;

-- AlterTable
ALTER TABLE "EmploymentContract" ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "workerSignatureDataUrl" TEXT;
