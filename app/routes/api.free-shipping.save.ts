import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  sanitizeFreeShippingSettingsInput,
  SHOP_CURRENCY_QUERY,
} from "./app.bundles";

interface SaveFreeShippingPayload {
  bundle?: string;
  settings?: unknown;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
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
    console.error("Failed to fetch shop currency for save", error);
  }

  let payload: SaveFreeShippingPayload;
  try {
    payload = (await request.json()) as SaveFreeShippingPayload;
  } catch (error) {
    console.error("Failed to parse free shipping payload", error);
    return json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || payload.bundle !== "Free Shipping Bar") {
    return json({ success: false, error: "Unsupported bundle" }, { status: 400 });
  }

  const sanitizedSettings = sanitizeFreeShippingSettingsInput(payload.settings, {
    shopCurrency,
  });

  try {
    const freeShippingClient = (prisma as any).freeShippingBarSettings;

    if (!freeShippingClient) {
      console.error("FreeShippingBarSettings model missing on Prisma client");
      return json(
        { success: false, error: "Settings model not available" },
        { status: 500 }
      );
    }

    const record = await freeShippingClient.upsert({
      where: { shop: session.shop },
      create: {
        shop: session.shop,
        ...sanitizedSettings,
      },
      update: {
        ...sanitizedSettings,
      },
    });

    return json({
      success: true,
      settings: sanitizeFreeShippingSettingsInput(record, { shopCurrency }),
    });
  } catch (error) {
    console.error("Failed to persist free shipping settings", error);
    return json({ success: false, error: "Failed to save settings" }, { status: 500 });
  }
};
