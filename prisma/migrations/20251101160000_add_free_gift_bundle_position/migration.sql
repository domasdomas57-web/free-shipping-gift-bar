-- Add position fields to FreeGiftBundleSettings
ALTER TABLE "FreeGiftBundleSettings" ADD COLUMN "position" TEXT NOT NULL DEFAULT 'top';
ALTER TABLE "FreeGiftBundleSettings" ADD COLUMN "floatingAlignment" TEXT NOT NULL DEFAULT 'top-center';
