-- CreateTable
CREATE TABLE "FreeGiftBundleSettings" (
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
    "unlockedMessage" TEXT NOT NULL DEFAULT 'You have unlocked your free gift! We will add it automatically.',
    "autoAdd" BOOLEAN NOT NULL DEFAULT true,
    "autoRemove" BOOLEAN NOT NULL DEFAULT true,
    "hideWhenUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "visibilityMode" TEXT NOT NULL DEFAULT 'always',
    "visibilityDurationSeconds" TEXT NOT NULL DEFAULT '10',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeGiftBundleSettings_shop_key" ON "FreeGiftBundleSettings"("shop");
