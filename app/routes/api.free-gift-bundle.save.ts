import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  sanitizeFreeGiftSettingsInput,
  SHOP_CURRENCY_QUERY,
} from "./app.bundles";

interface SaveFreeGiftPayload {
  bundle?: string;
  settings?: unknown;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);

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
    return json({ success: false, error: "Upgrade to Full Bundle Plan to unlock Gift Bundles." }, { status: 403 });
  }

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

    const outbound = sanitizeFreeGiftSettingsInput(record, {
      shopCurrency,
    });

    return json({ success: true, settings: outbound });
  } catch (error) {
    console.error("Failed to persist free gift settings", error);
    return json(
      { success: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
};
