import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE,
  sanitizeFreeGiftSettingsInput,
  SHOP_CURRENCY_QUERY,
} from "./app.bundles";

const CACHE_CONTROL_HEADER = "no-store, max-age=0";

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

  try {
    const proxyContext = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const shopFromQuery = url.searchParams.get("shop");
    const shop = proxyContext.session?.shop ?? shopFromQuery ?? undefined;

    const freeGiftClient = (prisma as any).freeGiftBundleSettings;
    if (!freeGiftClient) {
      console.error("FreeGiftBundleSettings model missing on Prisma client");
      return json(
        {
          shop,
          settings: toStorefrontPayload(DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE),
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

    let giftFeatureEnabled = false;
    const shopSettingsClient = (prisma as any).shopSettings;

    if (shopSettingsClient && shop) {
      try {
        const settings = await shopSettingsClient.findUnique({ where: { shop } });
        if (settings) {
          if (Array.isArray(settings.activeFeatures)) {
            giftFeatureEnabled = settings.activeFeatures.includes("gift");
          } else if (typeof settings.plan === "string") {
            giftFeatureEnabled = settings.plan === "bundle";
          }

          if (typeof settings.subscriptionStatus === "string" && settings.subscriptionStatus !== "ACTIVE") {
            giftFeatureEnabled = false;
          }
        }
      } catch (settingsError) {
        console.error("Failed to load shop settings for gift bundle loader", settingsError);
      }
    }

    const storefrontPayload = toStorefrontPayload(sanitized);

    if (!giftFeatureEnabled) {
      storefrontPayload.enabled = false;
      storefrontPayload.autoAdd = false;
      storefrontPayload.autoRemove = false;
    }

    return json(
      {
        shop: shop ?? null,
        settings: storefrontPayload,
        shopCurrency: null,
      },
      { headers: { "Cache-Control": CACHE_CONTROL_HEADER } }
    );
  } catch (error) {
    console.error("Failed to load free gift settings", error);
    return json(
      {
        shop: null,
        settings: toStorefrontPayload(DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE),
        shopCurrency: null,
      },
      {
        status: 200,
        headers: { "Cache-Control": CACHE_CONTROL_HEADER },
      }
    );
  }
};

type SaveFreeGiftPayload = {
  bundle?: string;
  settings?: unknown;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed" },
      { status: 405 }
    );
  }

  const { admin, session } = await authenticate.admin(request);

  let shopCurrency: string | null = null;
  try {
    const response = await admin.graphql(SHOP_CURRENCY_QUERY);
    const payload = await response.json();
    const currencyCode = payload?.data?.shop?.currencyCode;
    if (typeof currencyCode === "string" && currencyCode.trim()) {
      shopCurrency = currencyCode.trim();
    }
  } catch (error) {
    console.error("Failed to fetch shop currency for free gift save", error);
  }

  let payload: SaveFreeGiftPayload;
  try {
    payload = (await request.json()) as SaveFreeGiftPayload;
  } catch (error) {
    console.error("Failed to parse free gift payload", error);
    return json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || payload.bundle !== "Free Gift Bundle") {
    return json({ success: false, error: "Unsupported bundle" }, { status: 400 });
  }

  const sanitizedSettings = sanitizeFreeGiftSettingsInput(payload.settings, {
    shopCurrency,
  });

  const shopSettingsClient = (prisma as any).shopSettings;
  let canManageGiftBundle = false;

  if (shopSettingsClient) {
    try {
      const settings = await shopSettingsClient.findUnique({
        where: { shop: session.shop },
      });

      if (settings) {
        if (Array.isArray(settings.activeFeatures)) {
          canManageGiftBundle = settings.activeFeatures.includes("gift");
        } else if (typeof settings.plan === "string") {
          canManageGiftBundle = settings.plan === "bundle";
        }

        if (typeof settings.subscriptionStatus === "string" && settings.subscriptionStatus !== "ACTIVE") {
          canManageGiftBundle = false;
        }
      }
    } catch (settingsError) {
      console.error("Failed to load shop settings for gift bundle save", settingsError);
    }
  }

  if (!canManageGiftBundle) {
    return json(
      { success: false, error: "Upgrade to Full Bundle Plan to unlock Gift Bundles." },
      { status: 403 }
    );
  }

  try {
    const freeGiftClient = (prisma as any).freeGiftBundleSettings;
    if (!freeGiftClient) {
      console.error("FreeGiftBundleSettings model missing on Prisma client");
      return json(
        { success: false, error: "Settings model not available" },
        { status: 500 }
      );
    }

    const record = await freeGiftClient.upsert({
      where: { shop: session.shop },
      create: {
        shop: session.shop,
        ...sanitizedSettings,
      },
      update: {
        ...sanitizedSettings,
      },
    });

    const outbound = sanitizeFreeGiftSettingsInput(record, { shopCurrency });

    return json({ success: true, settings: outbound });
  } catch (error) {
    console.error("Failed to persist free gift settings", error);
    return json(
      { success: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
};
