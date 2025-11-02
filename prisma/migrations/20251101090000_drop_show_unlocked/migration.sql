-- Drop showUnlockedMessage column and update locked message placeholder
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
    "lockedMessage" TEXT NOT NULL DEFAULT 'Spend {{remaining}} more to unlock Free Shipping!',
    "unlockedMessage" TEXT NOT NULL DEFAULT 'Congratulations! You unlocked Free Shipping!',
    "currencyMode" TEXT NOT NULL DEFAULT 'auto',
    "manualCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_FreeShippingBarSettings" (
    "id",
    "shop",
    "enabled",
    "position",
    "floatingAlignment",
    "colorMode",
    "solidColor",
    "gradientStart",
    "gradientEnd",
    "textColor",
    "fontSize",
    "bold",
    "animateProgress",
    "threshold",
    "hideWhenUnlocked",
    "lockedMessage",
    "unlockedMessage",
    "currencyMode",
    "manualCurrency",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "shop",
    "enabled",
    "position",
    "floatingAlignment",
    "colorMode",
    "solidColor",
    "gradientStart",
    "gradientEnd",
    "textColor",
    "fontSize",
    "bold",
    "animateProgress",
    "threshold",
    "hideWhenUnlocked",
    REPLACE("lockedMessage", '{{threshold}}', '{{remaining}}'),
    "unlockedMessage",
    "currencyMode",
    "manualCurrency",
    "createdAt",
    "updatedAt"
FROM "FreeShippingBarSettings";

DROP TABLE "FreeShippingBarSettings";
ALTER TABLE "new_FreeShippingBarSettings" RENAME TO "FreeShippingBarSettings";

CREATE UNIQUE INDEX "FreeShippingBarSettings_shop_key" ON "FreeShippingBarSettings"("shop");

PRAGMA foreign_keys=ON;
