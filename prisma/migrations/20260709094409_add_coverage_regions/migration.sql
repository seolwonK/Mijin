-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Technician" ADD COLUMN     "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];
