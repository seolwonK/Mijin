-- CreateIndex
CREATE INDEX "CommissionEntry_status_createdAt_idx" ON "CommissionEntry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SatisfactionSurvey_submittedAt_idx" ON "SatisfactionSurvey"("submittedAt");
