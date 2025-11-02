-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
