-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FreeGiftBundleSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" TEXT NOT NULL DEFAULT '50',
    "giftProductId" TEXT,
    "giftProductTitle" TEXT,
    "giftVariantId" TEXT,
    "giftVariantTitle" TEXT,
    "giftProductImageUrl" TEXT,
    "colorMode" TEXT NOT NULL DEFAULT 'gradient',
    "solidColor" TEXT NOT NULL DEFAULT '#0EA5E9',
    "gradientStart" TEXT NOT NULL DEFAULT '#38BDF8',
    "gradientEnd" TEXT NOT NULL DEFAULT '#0EA5E9',
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "fontSize" TEXT NOT NULL DEFAULT 'medium',
    "bold" BOOLEAN NOT NULL DEFAULT true,
    "animateProgress" BOOLEAN NOT NULL DEFAULT true,
    "lockedMessage" TEXT NOT NULL DEFAULT 'Add {{remaining}} more to unlock your free gift!',
    "unlockedMessage" TEXT NOT NULL DEFAULT 'You''ve unlocked your free gift! We''ll add it automatically.',
    "autoAdd" BOOLEAN NOT NULL DEFAULT true,
    "autoRemove" BOOLEAN NOT NULL DEFAULT true,
    "hideWhenUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "visibilityMode" TEXT NOT NULL DEFAULT 'always',
    "visibilityDurationSeconds" TEXT NOT NULL DEFAULT '10',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FreeGiftBundleSettings" ("animateProgress", "autoAdd", "autoRemove", "bold", "colorMode", "createdAt", "enabled", "fontSize", "giftProductId", "giftProductImageUrl", "giftProductTitle", "giftVariantId", "giftVariantTitle", "gradientEnd", "gradientStart", "hideWhenUnlocked", "id", "lockedMessage", "shop", "solidColor", "textColor", "threshold", "unlockedMessage", "updatedAt", "visibilityDurationSeconds", "visibilityMode") SELECT "animateProgress", "autoAdd", "autoRemove", "bold", "colorMode", "createdAt", "enabled", "fontSize", "giftProductId", "giftProductImageUrl", "giftProductTitle", "giftVariantId", "giftVariantTitle", "gradientEnd", "gradientStart", "hideWhenUnlocked", "id", "lockedMessage", "shop", "solidColor", "textColor", "threshold", "unlockedMessage", "updatedAt", "visibilityDurationSeconds", "visibilityMode" FROM "FreeGiftBundleSettings";
DROP TABLE "FreeGiftBundleSettings";
ALTER TABLE "new_FreeGiftBundleSettings" RENAME TO "FreeGiftBundleSettings";
CREATE UNIQUE INDEX "FreeGiftBundleSettings_shop_key" ON "FreeGiftBundleSettings"("shop");
CREATE TABLE "new_FreeShippingBarSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" TEXT NOT NULL DEFAULT 'top',
    "floatingAlignment" TEXT NOT NULL DEFAULT 'top-center',
    "colorMode" TEXT NOT NULL DEFAULT 'gradient',
    "solidColor" TEXT NOT NULL DEFAULT '#16A34A',
    "gradientStart" TEXT NOT NULL DEFAULT '#4ADE80',
    "gradientEnd" TEXT NOT NULL DEFAULT '#16A34A',
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "fontSize" TEXT NOT NULL DEFAULT 'medium',
    "bold" BOOLEAN NOT NULL DEFAULT true,
    "animateProgress" BOOLEAN NOT NULL DEFAULT true,
    "threshold" TEXT NOT NULL DEFAULT '20',
    "hideWhenUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "visibilityMode" TEXT NOT NULL DEFAULT 'always',
    "visibilityDurationSeconds" TEXT NOT NULL DEFAULT '10',
    "lockedMessage" TEXT NOT NULL DEFAULT 'Spend {{remaining}} more to unlock Free Shipping!',
    "unlockedMessage" TEXT NOT NULL DEFAULT 'Congratulations! You unlocked Free Shipping!',
    "currencyMode" TEXT NOT NULL DEFAULT 'auto',
    "manualCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FreeShippingBarSettings" ("animateProgress", "bold", "colorMode", "createdAt", "currencyMode", "enabled", "floatingAlignment", "fontSize", "gradientEnd", "gradientStart", "hideWhenUnlocked", "id", "lockedMessage", "manualCurrency", "position", "shop", "solidColor", "textColor", "threshold", "unlockedMessage", "updatedAt") SELECT "animateProgress", "bold", "colorMode", "createdAt", "currencyMode", "enabled", "floatingAlignment", "fontSize", "gradientEnd", "gradientStart", "hideWhenUnlocked", "id", "lockedMessage", "manualCurrency", "position", "shop", "solidColor", "textColor", "threshold", "unlockedMessage", "updatedAt" FROM "FreeShippingBarSettings";
DROP TABLE "FreeShippingBarSettings";
ALTER TABLE "new_FreeShippingBarSettings" RENAME TO "FreeShippingBarSettings";
CREATE UNIQUE INDEX "FreeShippingBarSettings_shop_key" ON "FreeShippingBarSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
