-- DropIndex
DROP INDEX "Assignment_providerId_status_idx";

-- DropIndex
DROP INDEX "Assignment_technicianId_status_idx";

-- CreateTable
CREATE TABLE "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "providerId" TEXT,
    "technicianId" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "paidAmount" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurvey_requestId_key" ON "SatisfactionSurvey"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurvey_token_key" ON "SatisfactionSurvey"("token");

-- CreateIndex
CREATE INDEX "SatisfactionSurvey_providerId_idx" ON "SatisfactionSurvey"("providerId");

-- CreateIndex
CREATE INDEX "SatisfactionSurvey_technicianId_idx" ON "SatisfactionSurvey"("technicianId");

-- CreateIndex
CREATE INDEX "Assignment_providerId_status_respondedAt_idx" ON "Assignment"("providerId", "status", "respondedAt");

-- CreateIndex
CREATE INDEX "Assignment_technicianId_status_respondedAt_idx" ON "Assignment"("technicianId", "status", "respondedAt");

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 배정 대상 스냅샷은 업체(providerId) 또는 개인기술자(technicianId) 중 정확히 하나여야 한다 (XOR 불변식)
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "satisfaction_survey_one_assignee" CHECK (num_nonnulls("providerId", "technicianId") = 1);
