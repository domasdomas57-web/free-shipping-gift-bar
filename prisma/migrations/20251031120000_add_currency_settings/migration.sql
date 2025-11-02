-- Add currency configuration columns for the free shipping bar settings
ALTER TABLE "FreeShippingBarSettings" ADD COLUMN "currencyMode" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "FreeShippingBarSettings" ADD COLUMN "manualCurrency" TEXT NOT NULL DEFAULT 'EUR';
