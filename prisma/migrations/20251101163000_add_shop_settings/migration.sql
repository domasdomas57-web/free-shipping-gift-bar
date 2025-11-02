-- Add planKey and trialEndsAt to Subscription
ALTER TABLE "Subscription" ADD COLUMN "planKey" TEXT NOT NULL DEFAULT 'shipping';
ALTER TABLE "Subscription" ADD COLUMN "trialEndsAt" DATETIME;
UPDATE "Subscription" SET "currency" = 'EUR' WHERE "currency" = 'USD';

-- Create ShopSettings table
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL UNIQUE,
    "plan" TEXT NOT NULL DEFAULT 'shipping',
    "activeFeatures" TEXT NOT NULL,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "subscriptionId" TEXT,
    "trialEndsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to update updatedAt on ShopSettings
CREATE TRIGGER "ShopSettings_updatedAt"
AFTER UPDATE ON "ShopSettings"
FOR EACH ROW
BEGIN
    UPDATE "ShopSettings" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;
