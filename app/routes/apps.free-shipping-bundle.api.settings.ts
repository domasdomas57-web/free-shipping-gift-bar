import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE,
  DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE,
  sanitizeFreeGiftSettingsInput,
  sanitizeFreeShippingSettingsInput,
} from "./app.bundles";

const CACHE_CONTROL_HEADER = "no-store, max-age=0";

type FreeShippingSettingsPayload = {
  enabled: boolean;
  position: string;
  floatingAlignment: string;
  colorMode: string;
  solidColor: string;
  gradientStart: string;
  gradientEnd: string;
  textColor: string;
  fontSize: string;
  bold: boolean;
  animateProgress: boolean;
  threshold: string;
  hideWhenUnlocked: boolean;
  visibilityMode: string;
  visibilityDurationSeconds: string;
  lockedMessage: string;
  unlockedMessage: string;
  currencyMode: string;
  manualCurrency: string;
};

type FreeGiftSettingsPayload = {
  enabled: boolean;
  position: string;
  floatingAlignment: string;
  colorMode: string;
  solidColor: string;
  gradientStart: string;
  gradientEnd: string;
  textColor: string;
  fontSize: string;
  bold: boolean;
  animateProgress: boolean;
  threshold: string;
  hideWhenUnlocked: boolean;
  visibilityMode: string;
  visibilityDurationSeconds: string;
  lockedMessage: string;
  unlockedMessage: string;
  autoAdd: boolean;
  autoRemove: boolean;
  giftProductId: string | null;
  giftProductTitle: string | null;
  giftVariantId: string | null;
  giftVariantTitle: string | null;
  giftProductImageUrl: string | null;
};

function toStorefrontPayload(
  settings: typeof DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE
): FreeShippingSettingsPayload {
  return {
    enabled: Boolean(settings.enabled),
    position: settings.position,
    floatingAlignment: settings.floatingAlignment,
    colorMode: settings.colorMode,
    solidColor: settings.solidColor,
    gradientStart: settings.gradientStart,
    gradientEnd: settings.gradientEnd,
    textColor: settings.textColor,
    fontSize: settings.fontSize,
    bold: Boolean(settings.bold),
    animateProgress: Boolean(settings.animateProgress),
    threshold: settings.threshold,
    hideWhenUnlocked: Boolean(settings.hideWhenUnlocked),
    visibilityMode: settings.visibilityMode,
    visibilityDurationSeconds: settings.visibilityDurationSeconds,
    lockedMessage: settings.lockedMessage,
    unlockedMessage: settings.unlockedMessage,
    currencyMode: settings.currencyMode,
    manualCurrency: settings.manualCurrency,
  };
}

function toGiftStorefrontPayload(
  settings: typeof DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE
): FreeGiftSettingsPayload {
  return {
    enabled: Boolean(settings.enabled),
    position: settings.position,
    floatingAlignment: settings.floatingAlignment,
    colorMode: settings.colorMode,
    solidColor: settings.solidColor,
    gradientStart: settings.gradientStart,
    gradientEnd: settings.gradientEnd,
    textColor: settings.textColor,
    fontSize: settings.fontSize,
    bold: Boolean(settings.bold),
    animateProgress: Boolean(settings.animateProgress),
    threshold: settings.threshold,
    hideWhenUnlocked: Boolean(settings.hideWhenUnlocked),
    visibilityMode: settings.visibilityMode,
    visibilityDurationSeconds: settings.visibilityDurationSeconds,
    lockedMessage: settings.lockedMessage,
    unlockedMessage: settings.unlockedMessage,
    autoAdd: Boolean(settings.autoAdd),
    autoRemove: Boolean(settings.autoRemove),
    giftProductId: settings.giftProductId ?? null,
    giftProductTitle: settings.giftProductTitle ?? null,
    giftVariantId: settings.giftVariantId ?? null,
    giftVariantTitle: settings.giftVariantTitle ?? null,
    giftProductImageUrl: settings.giftProductImageUrl ?? null,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return json(
      { error: "Method not allowed" },
      {
        status: 405,
        headers: { "Cache-Control": CACHE_CONTROL_HEADER },
      }
    );
  }

  const url = new URL(request.url);
  const bundleParam = (url.searchParams.get("bundle") || "free-shipping").toLowerCase();
  const isGiftBundle =
    bundleParam === "free-gift" || bundleParam === "free_gift" || bundleParam === "free-gift-bundle";

  try {
    const proxyContext = await authenticate.public.appProxy(request);
    const shopFromQuery = url.searchParams.get("shop");
    const shop = proxyContext.session?.shop ?? shopFromQuery ?? undefined;

    const freeShippingClient = (prisma as any).freeShippingBarSettings;
    const freeGiftClient = (prisma as any).freeGiftBundleSettings;

    if (isGiftBundle) {
      if (!freeGiftClient) {
        console.error("FreeGiftBundleSettings model missing on Prisma client");
        return json(
          {
            shop,
            settings: toGiftStorefrontPayload(DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE),
            shopCurrency: null,
          },
          { headers: { "Cache-Control": CACHE_CONTROL_HEADER } }
        );
      }

      const record = shop
        ? await freeGiftClient.findUnique({
            where: { shop },
          })
        : null;

      const sanitized = record
        ? sanitizeFreeGiftSettingsInput(record)
        : DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE;

      return json(
        {
          shop: shop ?? null,
          settings: toGiftStorefrontPayload(sanitized),
          shopCurrency: null,
        },
        { headers: { "Cache-Control": CACHE_CONTROL_HEADER } }
      );
    }

    if (!freeShippingClient) {
      console.error("FreeShippingBarSettings model missing on Prisma client");
      return json(
        {
          shop,
          settings: toStorefrontPayload(DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE),
          shopCurrency: null,
        },
        {
          headers: { "Cache-Control": CACHE_CONTROL_HEADER },
        }
      );
    }

    const record = shop
      ? await freeShippingClient.findUnique({
          where: { shop },
        })
      : null;

    const sanitized = record
      ? sanitizeFreeShippingSettingsInput(record)
      : DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE;

    return json(
      {
        shop: shop ?? null,
        settings: toStorefrontPayload(sanitized),
        shopCurrency: null,
      },
      {
        headers: { "Cache-Control": CACHE_CONTROL_HEADER },
      }
    );
  } catch (error) {
    console.error("Failed to load storefront settings", error);
    return json(
      {
        shop: null,
        settings: isGiftBundle
          ? toGiftStorefrontPayload(DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE)
          : toStorefrontPayload(DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE),
        shopCurrency: null,
      },
      {
        status: 200,
        headers: { "Cache-Control": CACHE_CONTROL_HEADER },
      }
    );
  }
};
