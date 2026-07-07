-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "bizCertFileId" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "voiceFileId" TEXT;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);
