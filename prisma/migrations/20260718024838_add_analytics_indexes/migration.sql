-- CreateIndex
CREATE INDEX "Assignment_status_respondedAt_idx" ON "Assignment"("status", "respondedAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_createdAt_idx" ON "ServiceRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_completedAt_idx" ON "ServiceRequest"("completedAt");
