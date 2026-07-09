-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "birthDate" TEXT,
    "gender" TEXT,
    "ci" TEXT,
    "di" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityVerification_phone_idx" ON "IdentityVerification"("phone");

-- CreateIndex
CREATE INDEX "IdentityVerification_ci_idx" ON "IdentityVerification"("ci");
