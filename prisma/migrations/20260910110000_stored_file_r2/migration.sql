ALTER TABLE "StoredFile" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "StoredFile" ADD COLUMN "storageKey" TEXT;
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_storage_check"
  CHECK (("data" IS NOT NULL) <> ("storageKey" IS NOT NULL));
