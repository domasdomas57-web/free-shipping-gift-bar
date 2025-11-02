import type { ClientApplication } from "@shopify/app-bridge";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { CSSProperties, MouseEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlockStack,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  ChoiceList,
  ColorPicker,
  Collapsible,
  Frame,
  InlineStack,
  Modal,
  Popover,
  Page,
  Select,
  Text,
  TextField,
  Toast,
  Tooltip,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  Action as ResourcePickerAction,
  ResourceType as ResourcePickerResourceType,
  create as createResourcePicker,
} from "@shopify/app-bridge/actions/ResourcePicker";
import { useLoaderData, useNavigate } from "@remix-run/react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const MANUAL_CURRENCY_CODES = [
  "EUR",
  "USD",
  "GBP",
  "PLN",
  "SEK",
  "NOK",
  "DKK",
  "CHF",
] as const;

type ManualCurrencyCode = (typeof MANUAL_CURRENCY_CODES)[number];
type FontSizeOption = "small" | "medium" | "large";
type ColorMode = "solid" | "gradient";
type BarPosition = "top" | "bottom" | "floating" | "inline";
type FloatingAlignment =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
type VisibilityMode = "always" | "timed";

type HsbColor = {
  hue: number;
  saturation: number;
  brightness: number;
  alpha?: number;
};

interface BaseBundleSettings {
  enabled: boolean;
}

interface StoredFreeShippingBarSettings extends BaseBundleSettings {
  position: BarPosition;
  floatingAlignment: FloatingAlignment;
  colorMode: ColorMode;
  solidColor: string;
  gradientStart: string;
  gradientEnd: string;
  textColor: string;
  fontSize: FontSizeOption;
  bold: boolean;
  animateProgress: boolean;
  threshold: string;
  hideWhenUnlocked: boolean;
  visibilityMode: VisibilityMode;
  visibilityDurationSeconds: string;
  currencyMode: "auto" | "manual";
  manualCurrency: ManualCurrencyCode;
  lockedMessage: string;
  unlockedMessage: string;
}

interface StoredFreeGiftBundleSettings extends BaseBundleSettings {
  position: BarPosition;
  floatingAlignment: FloatingAlignment;
  colorMode: ColorMode;
  solidColor: string;
  gradientStart: string;
  gradientEnd: string;
  textColor: string;
  fontSize: FontSizeOption;
  bold: boolean;
  animateProgress: boolean;
  threshold: string;
  hideWhenUnlocked: boolean;
  visibilityMode: VisibilityMode;
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
}

type FreeShippingBarSettings = StoredFreeShippingBarSettings & {
  type: "free-shipping-bar";
  previewUnlocked: boolean;
};

type FreeGiftBundleSettings = StoredFreeGiftBundleSettings & {
  type: "free-gift-bundle";
  previewUnlocked: boolean;
};

type BundleEditorState = FreeShippingBarSettings | FreeGiftBundleSettings;

interface Bundle {
  title: string;
  description: string;
  logMessage: string;
  imageUrl: string;
}

type GiftVariantOption = {
  id: string;
  title: string;
};

type ProductPickerSelection = {
  id: string;
  title: string;
  featuredImage?: {
    originalSrc?: string | null;
  } | null;
  images?: Array<{
    originalSrc?: string | null;
  }> | null;
  variants?: Array<{
    id?: string | null;
    title?: string | null;
    image?: {
      originalSrc?: string | null;
    } | null;
  }> | null;
};

const DEFAULT_MANUAL_CURRENCY: ManualCurrencyCode = MANUAL_CURRENCY_CODES[0];

function normalizeResourcePickerProduct(
  resource: unknown
): ProductPickerSelection | null {
  if (!resource || typeof resource !== "object") {
    return null;
  }

  const product = resource as Record<string, unknown>;
  const idCandidate =
    typeof product.id === "string"
      ? product.id
      : typeof product.gid === "string"
        ? product.gid
        : null;

  if (!idCandidate) {
    return null;
  }

  const titleCandidate =
    typeof product.title === "string" && product.title.trim()
      ? product.title.trim()
      : typeof product.name === "string" && product.name.trim()
        ? product.name.trim()
        : "Selected product";

  const resolveImageSource = (value: unknown): string | null => {
    if (!value || typeof value !== "object") {
      return null;
    }
    const image = value as Record<string, unknown>;
    const originalSrc = image.originalSrc;
    const url = image.url;
    const src = image.src;

    const candidate =
      (typeof originalSrc === "string" && originalSrc.trim()) ||
      (typeof url === "string" && url.trim()) ||
      (typeof src === "string" && src.trim()) ||
      null;

    return candidate;
  };

  const images: Array<{ originalSrc?: string | null }> = [];
  const pushImage = (value: unknown) => {
    const source = resolveImageSource(value);
    if (source) {
      images.push({ originalSrc: source });
    }
  };

  if (Array.isArray(product.images)) {
    product.images.forEach(pushImage);
  } else if (
    product.images &&
    typeof product.images === "object" &&
    Array.isArray((product.images as any).edges)
  ) {
    ((product.images as any).edges as Array<{ node?: unknown }>).forEach((edge) => {
      if (edge && "node" in edge) {
        pushImage(edge.node);
      }
    });
  }

  pushImage(product.featuredImage);

  const variantsRaw = Array.isArray(product.variants)
    ? (product.variants as unknown[])
    : product.variants &&
        typeof product.variants === "object" &&
        Array.isArray((product.variants as any).edges)
      ? ((product.variants as any).edges as Array<{ node?: unknown }>).map(
          (edge) => edge?.node
        )
      : [];

  const variants = variantsRaw
    .map((variant) => {
      if (!variant || typeof variant !== "object") {
        return null;
      }

      const variantRecord = variant as Record<string, unknown>;
      const variantId =
        typeof variantRecord.id === "string" && variantRecord.id.trim()
          ? variantRecord.id.trim()
          : null;

      if (!variantId) {
        return null;
      }

      const variantTitleCandidate =
        typeof variantRecord.title === "string" && variantRecord.title.trim()
          ? variantRecord.title.trim()
          : typeof variantRecord.name === "string" && variantRecord.name.trim()
            ? variantRecord.name.trim()
            : "Selected variant";

      const variantImageSource = resolveImageSource(
        variantRecord.image ?? variantRecord.featuredImage
      );

      return {
        id: variantId,
        title: cleanMessageSpacing(variantTitleCandidate),
        image: variantImageSource ? { originalSrc: variantImageSource } : null,
      };
    })
    .filter(Boolean) as NonNullable<ProductPickerSelection["variants"]>;

  const featuredImageSource = resolveImageSource(product.featuredImage);

  return {
    id: idCandidate,
    title: cleanMessageSpacing(titleCandidate),
    featuredImage: featuredImageSource ? { originalSrc: featuredImageSource } : null,
    images: images.length ? images : null,
    variants: variants.length ? variants : null,
  };
}

function openLegacyResourcePicker(
  app: ClientApplication
): Promise<ProductPickerSelection | null> {
  return new Promise((resolve, reject) => {
    try {
      const picker = createResourcePicker(app, {
        resourceType: ResourcePickerResourceType.Product,
        options: {
          selectMultiple: false,
          showVariants: true,
        },
      });

      let handled = false;
      let unsubscribeSelect: (() => void) | undefined;
      let unsubscribeCancel: (() => void) | undefined;

      const finalize = (value: ProductPickerSelection | null) => {
        if (handled) {
          return;
        }
        handled = true;
        resolve(value);
      };

      const cleanup = () => {
        unsubscribeSelect?.();
        unsubscribeCancel?.();
        try {
          picker.dispatch(ResourcePickerAction.CLOSE);
        } catch (error) {
          console.debug("Resource picker close dispatch failed", error);
        }
        try {
          picker.unsubscribe();
        } catch (error) {
          console.debug("Resource picker unsubscribe failed", error);
        }
      };

      unsubscribeSelect = picker.subscribe(
        ResourcePickerAction.SELECT,
        (payload: { selection?: unknown[] } | undefined) => {
          try {
            const firstSelection = Array.isArray(payload?.selection)
              ? normalizeResourcePickerProduct(payload?.selection[0])
              : null;
            cleanup();
            finalize(firstSelection);
          } catch (error) {
            cleanup();
            reject(error);
          }
        }
      );

      unsubscribeCancel = picker.subscribe(
        ResourcePickerAction.CANCEL,
        () => {
          cleanup();
          finalize(null);
        }
      );

      picker.dispatch(ResourcePickerAction.OPEN);
    } catch (error) {
      reject(error);
    }
  });
}

const MANUAL_CURRENCY_OPTIONS = MANUAL_CURRENCY_CODES.map((code) => ({
  label: code,
  value: code,
}));

const BAR_POSITIONS = ["top", "bottom", "floating", "inline"] as const;

const FLOATING_ALIGNMENTS: readonly FloatingAlignment[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const FLOATING_ALIGNMENT_OPTIONS: Array<{
  label: string;
  value: FloatingAlignment;
}> = [
  { label: "Top left", value: "top-left" },
  { label: "Top center", value: "top-center" },
  { label: "Top right", value: "top-right" },
  { label: "Bottom left", value: "bottom-left" },
  { label: "Bottom center", value: "bottom-center" },
  { label: "Bottom right", value: "bottom-right" },
];

const COLOR_MODES: readonly ColorMode[] = ["gradient", "solid"] as const;

const FONT_SIZES: readonly FontSizeOption[] = [
  "small",
  "medium",
  "large",
] as const;

const FONT_SIZE_MAP: Record<FontSizeOption, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

const DEFAULT_GRADIENT_START = "#047857";
const DEFAULT_GRADIENT_END = "#22C55E";
const DEFAULT_SOLID_COLOR = "#16A34A";
const DEFAULT_TEXT_COLOR = "#FFFFFF";
const FALLBACK_GRADIENT_START = "#38BDF8";
const FALLBACK_GRADIENT_END = "#0EA5E9";
const DEFAULT_UNLOCKED_MESSAGE = "You've unlocked free shipping!";
const DEFAULT_LOCKED_MESSAGE = "You're {amount} away from free shipping";

const DEFAULT_GIFT_GRADIENT_START = "#9333EA";
const DEFAULT_GIFT_GRADIENT_END = "#F97316";
const DEFAULT_GIFT_SOLID_COLOR = "#F97316";
const DEFAULT_GIFT_TEXT_COLOR = "#FFFFFF";
const DEFAULT_GIFT_UNLOCKED_MESSAGE = "You've unlocked your free gift!";
const DEFAULT_GIFT_LOCKED_MESSAGE = "Add {amount} more to unlock your gift";

const REMAINING_PLACEHOLDER = "{amount}";
const PLACEHOLDER_ALIAS_PATTERN = /\{\{\s*(amount|remaining)\s*\}\}|\{\s*(amount|remaining)\s*\}|\[\s*(amount|remaining)\s*\]/gi;
const PLACEHOLDER_DUPLICATE_BEFORE_PATTERN = /\b(?:amount|remaining)\b\s*\{amount\}/gi;
const PLACEHOLDER_DUPLICATE_AFTER_PATTERN = /\{amount\}\s*\b(?:amount|remaining)\b/gi;

const DEFAULT_VISIBILITY_DURATION_SECONDS = 10;
const MIN_VISIBILITY_DURATION_SECONDS = 3;
const MAX_VISIBILITY_DURATION_SECONDS = 60;

export const SHOP_CURRENCY_QUERY = `#graphql
  query BundlesShopCurrency {
    shop {
      currencyCode
    }
  }
`;

interface CurrencyDetail {
  inputPrefix: string;
  inputSuffix: string;
}

const CURRENCY_DETAILS: Record<string, CurrencyDetail> = {
  EUR: { inputPrefix: "€", inputSuffix: "" },
  USD: { inputPrefix: "$", inputSuffix: "" },
  GBP: { inputPrefix: "£", inputSuffix: "" },
  PLN: { inputPrefix: "zł", inputSuffix: "" },
  SEK: { inputPrefix: "", inputSuffix: " kr" },
  NOK: { inputPrefix: "", inputSuffix: " kr" },
  DKK: { inputPrefix: "", inputSuffix: " kr" },
  CHF: { inputPrefix: "CHF ", inputSuffix: "" },
};

function resolveCurrencyDetail(code: string): CurrencyDetail {
  const normalized = (code || "").toUpperCase();
  return (
    CURRENCY_DETAILS[normalized] || {
      inputPrefix: normalized ? `${normalized} ` : "",
      inputSuffix: normalized ? ` ${normalized}` : "",
    }
  );
}

function isManualCurrencyCode(value: unknown): value is ManualCurrencyCode {
  if (typeof value !== "string") {
    return false;
  }
  return MANUAL_CURRENCY_CODES.includes(value.toUpperCase() as ManualCurrencyCode);
}

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const normalized = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }
  return `#${normalized.toUpperCase()}`;
}

function clampDecimal(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.min(Math.max(value, 0), 1);
  return Number(clamped.toFixed(4));
}

function hexToHsb(value: string, fallback: string): HsbColor {
  const normalized = normalizeHex(value, fallback).slice(1);
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    switch (max) {
      case red:
        hue = ((green - blue) / delta) % 6;
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      default:
        hue = (red - green) / delta + 4;
    }
    hue *= 60;
  }

  if (hue < 0) {
    hue += 360;
  }

  const saturation = max === 0 ? 0 : delta / max;
  const brightness = max;

  return {
    hue: Math.round(hue),
    saturation: clampDecimal(saturation),
    brightness: clampDecimal(brightness),
    alpha: 1,
  };
}

function hsbToHex(color: HsbColor): string {
  const hue = ((color.hue % 360) + 360) % 360;
  const saturation = clampDecimal(color.saturation);
  const brightness = clampDecimal(color.brightness);

  const chroma = brightness * saturation;
  const secondComponent = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = brightness - chroma;

  let redPrime = 0;
  let greenPrime = 0;
  let bluePrime = 0;

  if (hue < 60) {
    redPrime = chroma;
    greenPrime = secondComponent;
    bluePrime = 0;
  } else if (hue < 120) {
    redPrime = secondComponent;
    greenPrime = chroma;
    bluePrime = 0;
  } else if (hue < 180) {
    redPrime = 0;
    greenPrime = chroma;
    bluePrime = secondComponent;
  } else if (hue < 240) {
    redPrime = 0;
    greenPrime = secondComponent;
    bluePrime = chroma;
  } else if (hue < 300) {
    redPrime = secondComponent;
    greenPrime = 0;
    bluePrime = chroma;
  } else {
    redPrime = chroma;
    greenPrime = 0;
    bluePrime = secondComponent;
  }

  const red = Math.round((redPrime + match) * 255);
  const green = Math.round((greenPrime + match) * 255);
  const blue = Math.round((bluePrime + match) * 255);

  const toHex = (component: number) =>
    component.toString(16).padStart(2, "0").toUpperCase();

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function sanitizeThresholdValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value).toFixed(2);
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.,]/g, "").replace(",", ".");
    if (!cleaned) {
      return "0";
    }
    const parsed = parseFloat(cleaned);
    if (Number.isNaN(parsed)) {
      return "0";
    }
    return Math.max(0, parsed).toFixed(2);
  }

  return "0";
}

function sanitizeVisibilityMode(
  value: unknown,
  fallback: VisibilityMode
): VisibilityMode {
  return value === "timed" ? "timed" : fallback;
}

function sanitizeVisibilityDurationValue(
  value: unknown,
  fallback: string
): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const clamped = Math.min(
    MAX_VISIBILITY_DURATION_SECONDS,
    Math.max(MIN_VISIBILITY_DURATION_SECONDS, Math.abs(numeric))
  );

  return clamped.toString();
}

function cleanMessageSpacing(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureSingleDisplayAmount(
  message: string,
  displayAmount: string
): string {
  if (!message) {
    return "";
  }

  let working = message.replace(/[()\[\]{}]/g, " ");

  if (displayAmount) {
    const amountPattern = new RegExp(escapeRegExp(displayAmount), "g");
    let seen = false;
    working = working.replace(amountPattern, (match) => {
      if (seen) {
        return "";
      }
      seen = true;
      return match;
    });
  }

  working = working.replace(/\s{2,}/g, " ");

  return cleanMessageSpacing(working);
}

function normalizeDynamicPlaceholders(value: string): string {
  if (!value) {
    return "";
  }

  const spaced = cleanMessageSpacing(value);
  let normalized = spaced.replace(
    PLACEHOLDER_ALIAS_PATTERN,
    REMAINING_PLACEHOLDER
  );

  normalized = normalized
    .replace(PLACEHOLDER_DUPLICATE_BEFORE_PATTERN, REMAINING_PLACEHOLDER)
    .replace(PLACEHOLDER_DUPLICATE_AFTER_PATTERN, REMAINING_PLACEHOLDER);

  normalized = normalized
    .replace(/\(\s*\{amount\}\s*\)/gi, REMAINING_PLACEHOLDER)
    .replace(/\[\s*\{amount\}\s*\]/gi, REMAINING_PLACEHOLDER);

  return cleanMessageSpacing(normalized);
}

function stripDynamicAmount(message: string, displayAmount: string): string {
  if (!message) {
    return "";
  }

  const canonicalMessage = normalizeDynamicPlaceholders(message);

  if (!displayAmount) {
    return canonicalMessage;
  }

  return canonicalMessage.split(displayAmount).join(REMAINING_PLACEHOLDER);
}

function formatThresholdDisplay(amount: string, currencyCode: string): string {
  const numeric = parseFloat(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode || DEFAULT_MANUAL_CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch (error) {
    console.warn("Failed to format threshold", error);
    return `${currencyCode || DEFAULT_MANUAL_CURRENCY} ${numeric.toFixed(2)}`.trim();
  }
}

function templateToDisplay(template: string, displayAmount: string): string {
  if (!template) {
    return "";
  }

  const canonicalTemplate = normalizeDynamicPlaceholders(template);

  if (!displayAmount) {
    return ensureSingleDisplayAmount(canonicalTemplate, "");
  }

  const displayTemplate = canonicalTemplate
    .split(REMAINING_PLACEHOLDER)
    .join(displayAmount);

  return ensureSingleDisplayAmount(displayTemplate, displayAmount);
}

function displayToTemplate(message: string, displayAmount: string): string {
  if (!message) {
    return "";
  }

  const cleanedMessage = cleanMessageSpacing(message);

  if (!displayAmount) {
    return normalizeDynamicPlaceholders(cleanedMessage);
  }

  return normalizeDynamicPlaceholders(
    cleanedMessage.split(displayAmount).join(REMAINING_PLACEHOLDER)
  );
}

function normalizeLockedTemplate(template: string): string {
  const sanitized = normalizeDynamicPlaceholders(template);
  if (!sanitized) {
    return DEFAULT_LOCKED_MESSAGE;
  }
  if (sanitized.includes(REMAINING_PLACEHOLDER)) {
    return sanitized;
  }
  return `${sanitized} ${REMAINING_PLACEHOLDER}`.trim();
}

const GLOBAL_STYLE_BLOCK = `
@keyframes fsbGradientShift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@keyframes fsbPreviewFade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

// Add Polaris popover and color picker overrides so pointer/touch input works
const POLARIS_COLORPICKER_FIXES = `
.Polaris-Popover__PopoverOverlay { pointer-events: auto !important; }
.Polaris-ColorPicker { touch-action: none; }
`;

export const DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE: StoredFreeShippingBarSettings = {
  enabled: true,
  position: "top",
  floatingAlignment: "top-center",
  colorMode: "gradient",
  solidColor: DEFAULT_SOLID_COLOR,
  gradientStart: DEFAULT_GRADIENT_START,
  gradientEnd: DEFAULT_GRADIENT_END,
  textColor: DEFAULT_TEXT_COLOR,
  fontSize: "medium",
  bold: true,
  animateProgress: true,
  threshold: "50",
  hideWhenUnlocked: false,
  visibilityMode: "always",
  visibilityDurationSeconds: "",
  currencyMode: "auto",
  manualCurrency: DEFAULT_MANUAL_CURRENCY,
  lockedMessage: DEFAULT_LOCKED_MESSAGE,
  unlockedMessage: DEFAULT_UNLOCKED_MESSAGE,
};

export const DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE: StoredFreeGiftBundleSettings = {
  enabled: false,
  position: "top",
  floatingAlignment: "top-center",
  colorMode: "gradient",
  solidColor: DEFAULT_GIFT_SOLID_COLOR,
  gradientStart: DEFAULT_GIFT_GRADIENT_START,
  gradientEnd: DEFAULT_GIFT_GRADIENT_END,
  textColor: DEFAULT_GIFT_TEXT_COLOR,
  fontSize: "medium",
  bold: true,
  animateProgress: true,
  threshold: "75",
  hideWhenUnlocked: false,
  visibilityMode: "always",
  visibilityDurationSeconds: "",
  lockedMessage: DEFAULT_GIFT_LOCKED_MESSAGE,
  unlockedMessage: DEFAULT_GIFT_UNLOCKED_MESSAGE,
  autoAdd: true,
  autoRemove: true,
  giftProductId: null,
  giftProductTitle: null,
  giftVariantId: null,
  giftVariantTitle: null,
  giftProductImageUrl: null,
};

export function sanitizeFreeShippingSettingsInput(
  input: unknown,
  options?: { shopCurrency?: string | null }
): StoredFreeShippingBarSettings {
  const fallback = { ...DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE };
  if (typeof input !== "object" || input === null) {
    return fallback;
  }

  const source = input as Partial<StoredFreeShippingBarSettings> &
    Record<string, unknown>;

  const threshold = sanitizeThresholdValue(source.threshold);
  const visibilityMode = sanitizeVisibilityMode(
    source.visibilityMode,
    fallback.visibilityMode
  );
  const visibilityDurationSeconds = sanitizeVisibilityDurationValue(
    source.visibilityDurationSeconds,
    fallback.visibilityDurationSeconds
  );

  const currencyMode =
    source.currencyMode === "auto" || source.currencyMode === "manual"
      ? (source.currencyMode as "auto" | "manual")
      : fallback.currencyMode;

  const manualCurrencyCandidate =
    typeof source.manualCurrency === "string"
      ? source.manualCurrency.toUpperCase()
      : source.manualCurrency;

  const manualCurrency = isManualCurrencyCode(manualCurrencyCandidate)
    ? manualCurrencyCandidate
    : fallback.manualCurrency;

  const effectiveCurrencyCode =
    currencyMode === "auto"
      ? options?.shopCurrency ?? DEFAULT_MANUAL_CURRENCY
      : manualCurrency;

  const displayAmount = formatThresholdDisplay(
    threshold,
    effectiveCurrencyCode
  );

  return {
    ...fallback,
    enabled: Boolean(source.enabled ?? fallback.enabled),
    position: BAR_POSITIONS.includes(source.position as BarPosition)
      ? (source.position as BarPosition)
      : fallback.position,
    floatingAlignment: FLOATING_ALIGNMENTS.includes(
      source.floatingAlignment as FloatingAlignment
    )
      ? (source.floatingAlignment as FloatingAlignment)
      : fallback.floatingAlignment,
    colorMode: COLOR_MODES.includes(source.colorMode as ColorMode)
      ? (source.colorMode as ColorMode)
      : fallback.colorMode,
    solidColor: normalizeHex(
      typeof source.solidColor === "string"
        ? source.solidColor
        : fallback.solidColor,
      fallback.solidColor
    ),
    gradientStart: normalizeHex(
      typeof source.gradientStart === "string"
        ? source.gradientStart
        : fallback.gradientStart,
      fallback.gradientStart
    ),
    gradientEnd: normalizeHex(
      typeof source.gradientEnd === "string"
        ? source.gradientEnd
        : fallback.gradientEnd,
      fallback.gradientEnd
    ),
    textColor: normalizeHex(
      typeof source.textColor === "string"
        ? source.textColor
        : fallback.textColor,
      fallback.textColor
    ),
    fontSize: FONT_SIZES.includes(source.fontSize as FontSizeOption)
      ? (source.fontSize as FontSizeOption)
      : fallback.fontSize,
    bold: Boolean(source.bold ?? fallback.bold),
    animateProgress: Boolean(
      source.animateProgress ?? fallback.animateProgress
    ),
    threshold,
    hideWhenUnlocked: Boolean(
      source.hideWhenUnlocked ?? fallback.hideWhenUnlocked
    ),
    visibilityMode,
    visibilityDurationSeconds,
    currencyMode,
    manualCurrency,
    lockedMessage: normalizeLockedTemplate(
      typeof source.lockedMessage === "string"
        ? source.lockedMessage
        : fallback.lockedMessage
    ),
    unlockedMessage: cleanMessageSpacing(
      stripDynamicAmount(
        typeof source.unlockedMessage === "string"
          ? source.unlockedMessage
          : fallback.unlockedMessage,
        displayAmount
      ) || fallback.unlockedMessage
    ),
  };
}

export function sanitizeFreeGiftSettingsInput(
  input: unknown,
  options?: { shopCurrency?: string | null }
): StoredFreeGiftBundleSettings {
  const fallback = { ...DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE };
  if (typeof input !== "object" || input === null) {
    return fallback;
  }

  const source = input as Partial<StoredFreeGiftBundleSettings> &
    Record<string, unknown>;

  const threshold = sanitizeThresholdValue(source.threshold);
  const visibilityMode = sanitizeVisibilityMode(
    source.visibilityMode,
    fallback.visibilityMode
  );
  const visibilityDurationSeconds = sanitizeVisibilityDurationValue(
    source.visibilityDurationSeconds,
    fallback.visibilityDurationSeconds
  );

  const effectiveCurrencyCode = options?.shopCurrency ?? DEFAULT_MANUAL_CURRENCY;
  const displayAmount = formatThresholdDisplay(threshold, effectiveCurrencyCode);

  const sanitizedGiftProductId =
    typeof source.giftProductId === "string" && source.giftProductId.trim()
      ? source.giftProductId.trim()
      : null;
  const sanitizedGiftProductTitle =
    typeof source.giftProductTitle === "string" && source.giftProductTitle.trim()
      ? cleanMessageSpacing(source.giftProductTitle)
      : null;
  const sanitizedGiftVariantId =
    typeof source.giftVariantId === "string" && source.giftVariantId.trim()
      ? source.giftVariantId.trim()
      : null;
  const sanitizedGiftVariantTitle =
    typeof source.giftVariantTitle === "string" && source.giftVariantTitle.trim()
      ? cleanMessageSpacing(source.giftVariantTitle)
      : null;
  const sanitizedGiftProductImageUrl =
    typeof source.giftProductImageUrl === "string" && source.giftProductImageUrl.trim()
      ? source.giftProductImageUrl.trim()
      : null;

  const hasVariant = Boolean(sanitizedGiftVariantId);

  return {
    ...fallback,
    enabled: Boolean(source.enabled ?? fallback.enabled),
    position: BAR_POSITIONS.includes(source.position as BarPosition)
      ? (source.position as BarPosition)
      : fallback.position,
    floatingAlignment: FLOATING_ALIGNMENTS.includes(
      source.floatingAlignment as FloatingAlignment
    )
      ? (source.floatingAlignment as FloatingAlignment)
      : fallback.floatingAlignment,
    threshold,
    giftProductId: sanitizedGiftProductId,
    giftProductTitle: sanitizedGiftProductTitle,
    giftVariantId: sanitizedGiftVariantId,
    giftVariantTitle: sanitizedGiftVariantTitle,
    giftProductImageUrl: sanitizedGiftProductImageUrl,
    colorMode: COLOR_MODES.includes(source.colorMode as ColorMode)
      ? (source.colorMode as ColorMode)
      : fallback.colorMode,
    solidColor: normalizeHex(
      typeof source.solidColor === "string" ? source.solidColor : fallback.solidColor,
      fallback.solidColor
    ),
    gradientStart: normalizeHex(
      typeof source.gradientStart === "string"
        ? source.gradientStart
        : fallback.gradientStart,
      fallback.gradientStart
    ),
    gradientEnd: normalizeHex(
      typeof source.gradientEnd === "string"
        ? source.gradientEnd
        : fallback.gradientEnd,
      fallback.gradientEnd
    ),
    textColor: normalizeHex(
      typeof source.textColor === "string" ? source.textColor : fallback.textColor,
      fallback.textColor
    ),
    fontSize: FONT_SIZES.includes(source.fontSize as FontSizeOption)
      ? (source.fontSize as FontSizeOption)
      : fallback.fontSize,
    bold: Boolean(source.bold ?? fallback.bold),
    animateProgress: Boolean(source.animateProgress ?? fallback.animateProgress),
    lockedMessage: normalizeLockedTemplate(
      typeof source.lockedMessage === "string"
        ? source.lockedMessage
        : fallback.lockedMessage
    ),
    unlockedMessage: cleanMessageSpacing(
      stripDynamicAmount(
        typeof source.unlockedMessage === "string"
          ? source.unlockedMessage
          : fallback.unlockedMessage,
        displayAmount
      ) || fallback.unlockedMessage
    ),
    autoAdd: hasVariant ? Boolean(source.autoAdd ?? fallback.autoAdd) : false,
    autoRemove: hasVariant ? Boolean(source.autoRemove ?? fallback.autoRemove) : false,
    hideWhenUnlocked: Boolean(source.hideWhenUnlocked ?? fallback.hideWhenUnlocked),
    visibilityMode,
    visibilityDurationSeconds,
  };
}

function formatUnlockedPreview(
  message: string,
  displayAmount: string,
  fallback: string
): string {
  if (!message.trim()) {
    return cleanMessageSpacing(fallback);
  }

  return stripDynamicAmount(message, displayAmount) || fallback;
}

function resolveSelectionImage(selection: ProductPickerSelection): string | null {
  const featured = selection.featuredImage?.originalSrc;
  if (featured && typeof featured === "string") {
    return featured;
  }

  const galleryImage = selection.images?.find(
    (image) => image?.originalSrc && typeof image.originalSrc === "string"
  )?.originalSrc;

  if (galleryImage && typeof galleryImage === "string") {
    return galleryImage;
  }

  const variantImage = selection.variants?.find(
    (variant) => variant?.image?.originalSrc && typeof variant.image.originalSrc === "string"
  )?.image?.originalSrc;

  return typeof variantImage === "string" ? variantImage : null;
}

function extractVariantOptions(selection: ProductPickerSelection): GiftVariantOption[] {
  if (!Array.isArray(selection.variants)) {
    return [];
  }

  return selection.variants
    .map((variant) => {
      if (!variant || typeof variant.id !== "string") {
        return null;
      }

      return {
        id: variant.id,
        title: cleanMessageSpacing(variant.title ?? "Selected variant"),
      } satisfies GiftVariantOption;
    })
    .filter(Boolean) as GiftVariantOption[];
}

const bundles: Bundle[] = [
  {
    title: "Free Shipping Bar",
    description: "Motivates customers to reach your free shipping threshold.",
    logMessage: "Manage Free Shipping Bar",
    imageUrl: "/images/free-shipping-bar-preview.png",
  },
  {
    title: "Free Gift Bundle",
    description: "Gives shoppers a complimentary gift after a set order amount.",
    logMessage: "Manage Free Gift Bundle",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/free-gift-example.png",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
    console.error("Failed to fetch shop currency", error);
  }

  try {
  const freeShippingClient = (prisma as any).freeShippingBarSettings;
  const freeGiftClient = (prisma as any).freeGiftBundleSettings;
  const shopSettingsClient = (prisma as any).shopSettings;

    if (!freeShippingClient) {
      console.error("FreeShippingBarSettings model not found on Prisma client");
    }

    if (!freeGiftClient) {
      console.error("FreeGiftBundleSettings model not found on Prisma client");
    }

    const [freeShippingRecord, freeGiftRecord, shopSettingsRecord] = await Promise.all([
      freeShippingClient
        ? freeShippingClient.findUnique({ where: { shop: session.shop } })
        : Promise.resolve(null),
      freeGiftClient
        ? freeGiftClient.findUnique({ where: { shop: session.shop } })
        : Promise.resolve(null),
      shopSettingsClient
        ? shopSettingsClient.findUnique({ where: { shop: session.shop } })
        : Promise.resolve(null),
    ]);

    const freeShippingSettings = freeShippingRecord
      ? sanitizeFreeShippingSettingsInput(freeShippingRecord, { shopCurrency })
      : null;
    const freeGiftSettings = freeGiftRecord
      ? sanitizeFreeGiftSettingsInput(freeGiftRecord, { shopCurrency })
      : null;

    let currentPlan: "shipping" | "bundle" | null = null;
    let subscriptionStatus = "inactive";
    let activeFeatures: string[] = [];

    if (shopSettingsRecord) {
      if (typeof shopSettingsRecord.plan === "string") {
        if (shopSettingsRecord.plan === "shipping" || shopSettingsRecord.plan === "bundle") {
          currentPlan = shopSettingsRecord.plan;
        }
      }

      if (typeof shopSettingsRecord.subscriptionStatus === "string") {
        subscriptionStatus = shopSettingsRecord.subscriptionStatus;
      }

      if (Array.isArray(shopSettingsRecord.activeFeatures)) {
        activeFeatures = shopSettingsRecord.activeFeatures.filter((feature: unknown) =>
          feature === "shipping" || feature === "gift"
        );
      }
    }

    return json({
      freeShippingSettings,
      freeGiftSettings,
      shopCurrency,
      currentPlan,
      subscriptionStatus,
      activeFeatures,
    });
  } catch (error) {
    console.error("Failed to load bundle settings", error);
    return json({
      freeShippingSettings: null,
      freeGiftSettings: null,
      shopCurrency,
      currentPlan: null,
      subscriptionStatus: "inactive",
      activeFeatures: [],
    });
  }
};

export function MyBundles() {
  const {
    freeShippingSettings: loaderFreeShippingSettings,
    freeGiftSettings: loaderFreeGiftSettings,
    shopCurrency,
    currentPlan,
    subscriptionStatus,
    activeFeatures,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();

  const canAccessGiftBundle = useMemo(() => {
    if (!Array.isArray(activeFeatures)) {
      return false;
    }

    if (!activeFeatures.includes("gift")) {
      return false;
    }

    return subscriptionStatus === "ACTIVE";
  }, [activeFeatures, subscriptionStatus]);

  const shopifyAppBridge = useAppBridge();

  const normalizedShopCurrency =
    shopCurrency && shopCurrency.trim() ? shopCurrency.trim().toUpperCase() : null;

  const [savedFreeShippingSettings, setSavedFreeShippingSettings] = useState<
    StoredFreeShippingBarSettings | null
  >(loaderFreeShippingSettings ?? null);
  const [savedFreeGiftSettings, setSavedFreeGiftSettings] = useState<
    StoredFreeGiftBundleSettings | null
  >(loaderFreeGiftSettings ?? null);

  const [giftVariantOptions, setGiftVariantOptions] = useState<GiftVariantOption[]>(() => {
    if (loaderFreeGiftSettings?.giftVariantId) {
      return [
        {
          id: loaderFreeGiftSettings.giftVariantId,
          title:
            loaderFreeGiftSettings.giftVariantTitle ?? "Selected variant",
        },
      ];
    }
    return [];
  });

  const baseFreeShippingDefaults = useMemo<FreeShippingBarSettings>(
    () => ({
      type: "free-shipping-bar",
      ...DEFAULT_FREE_SHIPPING_BAR_SETTINGS_BASE,
      currencyMode: normalizedShopCurrency ? "auto" : "manual",
      manualCurrency: DEFAULT_MANUAL_CURRENCY,
      previewUnlocked: false,
    }),
    [normalizedShopCurrency]
  );

  const derivedFreeShippingDefaults = useMemo<FreeShippingBarSettings>(() => {
    const merged: FreeShippingBarSettings = {
      ...baseFreeShippingDefaults,
      ...(savedFreeShippingSettings ?? {}),
      type: "free-shipping-bar",
      previewUnlocked: false,
    };

    const manualCurrency = isManualCurrencyCode(merged.manualCurrency)
      ? merged.manualCurrency
      : DEFAULT_MANUAL_CURRENCY;

    const currencyMode =
      merged.currencyMode === "manual" || !normalizedShopCurrency
        ? "manual"
        : "auto";

    return {
      ...merged,
      manualCurrency,
      currencyMode,
    };
  }, [baseFreeShippingDefaults, savedFreeShippingSettings, normalizedShopCurrency]);

  const derivedFreeGiftDefaults = useMemo<FreeGiftBundleSettings>(() => {
    const merged: FreeGiftBundleSettings = {
      type: "free-gift-bundle",
      ...DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE,
      ...(savedFreeGiftSettings ?? {}),
      previewUnlocked: false,
    };

    if (!BAR_POSITIONS.includes(merged.position)) {
      merged.position = DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE.position;
    }

    if (!FLOATING_ALIGNMENTS.includes(merged.floatingAlignment)) {
      merged.floatingAlignment = DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE.floatingAlignment;
    }

    if (!COLOR_MODES.includes(merged.colorMode)) {
      merged.colorMode = DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE.colorMode;
    }

    if (!FONT_SIZES.includes(merged.fontSize)) {
      merged.fontSize = DEFAULT_FREE_GIFT_BUNDLE_SETTINGS_BASE.fontSize;
    }

    if (!canAccessGiftBundle) {
      merged.enabled = false;
      merged.autoAdd = false;
      merged.autoRemove = false;
    }

    return merged;
  }, [savedFreeGiftSettings, canAccessGiftBundle]);

  const defaultBundleSettings = useMemo(() => {
    const freeShippingDefaults: FreeShippingBarSettings = {
      ...derivedFreeShippingDefaults,
    };

    const giftDefaults: FreeGiftBundleSettings = {
      ...derivedFreeGiftDefaults,
    };

    return {
      "Free Shipping Bar": freeShippingDefaults,
      "Free Gift Bundle": giftDefaults,
    } as Record<string, BundleEditorState>;
  }, [derivedFreeShippingDefaults, derivedFreeGiftDefaults]);

  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [editorState, setEditorState] = useState<BundleEditorState>(() => ({
    ...defaultBundleSettings["Free Shipping Bar"],
  }));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [activeMessageTab, setActiveMessageTab] =
    useState<"locked" | "unlocked">("locked");
  const [expandedSections, setExpandedSections] = useState<
    Record<
      | "positionLayout"
      | "appearance"
      | "textSettings"
      | "behavior"
      | "currency"
      | "livePreview",
      boolean
    >
  >({
    positionLayout: true,
    appearance: true,
    textSettings: true,
    behavior: true,
    currency: true,
    livePreview: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [toastConfig, setToastConfig] = useState<{
    active: boolean;
    content: string;
    variant: "success" | "error";
  }>({
    active: false,
    content: "",
    variant: "success",
  });
  const [gradientStartPopoverActive, setGradientStartPopoverActive] = useState(false);
  const [gradientEndPopoverActive, setGradientEndPopoverActive] = useState(false);
  const [solidColorPopoverActive, setSolidColorPopoverActive] = useState(false);
  const [textColorPopoverActive, setTextColorPopoverActive] = useState(false);

  const toggleGradientStartPopover = useCallback(() => {
    setGradientStartPopoverActive((prev) => !prev);
  }, []);

  const toggleGradientEndPopover = useCallback(() => {
    setGradientEndPopoverActive((prev) => !prev);
  }, []);

  const toggleSolidColorPopover = useCallback(() => {
    setSolidColorPopoverActive((prev) => !prev);
  }, []);

  const toggleTextColorPopover = useCallback(() => {
    setTextColorPopoverActive((prev) => !prev);
  }, []);

  const resolvedCurrencyCode = useMemo(() => {
    if (editorState.type === "free-gift-bundle") {
      return normalizedShopCurrency ?? DEFAULT_MANUAL_CURRENCY;
    }

    if (editorState.type !== "free-shipping-bar") {
      return DEFAULT_MANUAL_CURRENCY;
    }

    if (editorState.currencyMode === "manual") {
      return isManualCurrencyCode(editorState.manualCurrency)
        ? editorState.manualCurrency
        : DEFAULT_MANUAL_CURRENCY;
    }

    return normalizedShopCurrency ?? DEFAULT_MANUAL_CURRENCY;
  }, [editorState, normalizedShopCurrency]);

  const currencyDetail = useMemo(
    () => resolveCurrencyDetail(resolvedCurrencyCode),
    [resolvedCurrencyCode]
  );

  const currencyInputPrefix = currencyDetail.inputPrefix || undefined;
  const currencyInputSuffix = currencyDetail.inputSuffix || undefined;

  const defaultThresholdDisplay = useMemo(
    () => formatThresholdDisplay("0", resolvedCurrencyCode),
    [resolvedCurrencyCode]
  );

  const manualCurrencyValue =
    editorState.type === "free-shipping-bar" &&
    isManualCurrencyCode(editorState.manualCurrency)
      ? editorState.manualCurrency
      : DEFAULT_MANUAL_CURRENCY;

  const planDisplayName = useMemo(() => {
    if (currentPlan === "bundle") {
      return "Full Bundle Plan";
    }
    if (currentPlan === "shipping") {
      return "Shipping Plan";
    }
    return "No plan selected";
  }, [currentPlan]);

  const isCurrencyAuto =
    editorState.type === "free-shipping-bar" &&
    editorState.currencyMode === "auto" &&
    Boolean(normalizedShopCurrency);

  const shouldShowManualCurrencySelect =
    editorState.type === "free-shipping-bar" && !isCurrencyAuto;

  useEffect(() => {
    if (!toastConfig.active) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastConfig((prev) => ({ ...prev, active: false }));
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [toastConfig.active]);

  useEffect(() => {
    const variantId = savedFreeGiftSettings?.giftVariantId;
    if (!variantId) {
      setGiftVariantOptions([]);
      return;
    }

    const variantTitle =
      savedFreeGiftSettings?.giftVariantTitle ?? "Selected variant";

    setGiftVariantOptions((prev) => {
      if (prev.some((option) => option.id === variantId)) {
        return prev;
      }

      return [...prev, { id: variantId, title: variantTitle }];
    });
  }, [
    savedFreeGiftSettings?.giftVariantId,
    savedFreeGiftSettings?.giftVariantTitle,
  ]);

  const toggleSection = useCallback(
    (section: keyof typeof expandedSections) => {
      setExpandedSections((prev) => ({
        ...prev,
        [section]: !prev[section],
      }));
    },
    []
  );

  const openEditor = useCallback(
    (bundle: Bundle) => {
      if (bundle.title === "Free Gift Bundle" && !canAccessGiftBundle) {
        setUpgradeModalOpen(true);
        return;
      }

      const defaults =
        defaultBundleSettings[
          bundle.title as keyof typeof defaultBundleSettings
        ] ?? defaultBundleSettings["Free Shipping Bar"];
      const nextState =
        defaults.type === "free-shipping-bar"
          ? { ...defaults, previewUnlocked: false }
          : { ...defaults };
      setSelectedBundle(bundle);
      setEditorState(nextState);
      setActiveMessageTab("locked");
      setIsModalOpen(true);
    },
    [defaultBundleSettings, canAccessGiftBundle]
  );

  const handleGiftProductClear = useCallback(() => {
    setGiftVariantOptions([]);
    setEditorState((prev) => {
      if (prev.type !== "free-gift-bundle") {
        return prev;
      }

      return {
        ...prev,
        giftProductId: null,
        giftProductTitle: null,
        giftVariantId: null,
        giftVariantTitle: null,
        giftProductImageUrl: null,
        autoAdd: false,
        autoRemove: false,
      };
    });
  }, []);

  const handleGiftVariantChange = useCallback(
    (value: string) => {
      const selectedVariant = giftVariantOptions.find(
        (option) => option.id === value
      );

      setEditorState((prev) => {
        if (prev.type !== "free-gift-bundle") {
          return prev;
        }

        if (!selectedVariant) {
          return {
            ...prev,
            giftVariantId: prev.giftVariantId,
            giftVariantTitle: prev.giftVariantTitle,
          };
        }

        return {
          ...prev,
          giftVariantId: selectedVariant.id,
          giftVariantTitle: selectedVariant.title,
          autoAdd: prev.autoAdd,
          autoRemove: prev.autoRemove,
        };
      });
    },
    [giftVariantOptions]
  );

  const applyGiftProductSelection = useCallback(
    (selection: ProductPickerSelection) => {
      const normalizedSelection: ProductPickerSelection = {
        id: selection.id,
        title: selection.title,
        featuredImage: selection.featuredImage ?? null,
        images: selection.images ?? null,
        variants: selection.variants ?? null,
      };

      const variants = extractVariantOptions(normalizedSelection);
      const fallbackVariant = variants[0] ?? null;

      setGiftVariantOptions(variants);

      setEditorState((prev) => {
        if (prev.type !== "free-gift-bundle") {
          return prev;
        }

        const retainedVariant = variants.find(
          (variant) => variant.id === prev.giftVariantId
        );
        const nextVariant = retainedVariant ?? fallbackVariant;

        return {
          ...prev,
          giftProductId: normalizedSelection.id,
          giftProductTitle: cleanMessageSpacing(normalizedSelection.title),
          giftProductImageUrl: resolveSelectionImage(normalizedSelection),
          giftVariantId: nextVariant ? nextVariant.id : null,
          giftVariantTitle: nextVariant ? nextVariant.title : null,
          autoAdd: nextVariant ? prev.autoAdd : false,
          autoRemove: nextVariant ? prev.autoRemove : false,
        };
      });

      setToastConfig({
        active: true,
        content: "Gift product updated.",
        variant: "success",
      });
    },
    [setEditorState, setGiftVariantOptions, setToastConfig]
  );

  const handleGiftProductSelect = useCallback(async () => {
    if (!shopifyAppBridge || typeof shopifyAppBridge !== "object") {
      setToastConfig({
        active: true,
        content: "❌ Shopify App Bridge is not ready yet. Please refresh and try again.",
        variant: "error",
      });
      return;
    }

    const extractFirstSelection = (result: unknown): unknown => {
      if (!result) {
        return null;
      }

      if (Array.isArray(result) && result.length > 0) {
        return result[0];
      }

      const record = result as Record<string, unknown>;
      const directSelection = record["selection"];

      if (Array.isArray(directSelection) && directSelection.length > 0) {
        return directSelection[0];
      }

      const resources = record["resources"];

      if (
        resources &&
        typeof resources === "object" &&
        Array.isArray((resources as any).selection) &&
        (resources as any).selection.length > 0
      ) {
        return (resources as any).selection[0];
      }

      return null;
    };

    try {
      const resourcePicker = (shopifyAppBridge as any).resourcePicker;

      if (typeof resourcePicker === "function") {
        const result = await resourcePicker({
          type: "product",
          multiple: false,
          variants: true,
        });

        const firstSelection = extractFirstSelection(result);
        const normalizedSelection = normalizeResourcePickerProduct(firstSelection);

        if (normalizedSelection) {
          applyGiftProductSelection(normalizedSelection);
        }

        return;
      }

      const appBridgeApp = (shopifyAppBridge.app ?? undefined) as unknown as
        | ClientApplication
        | undefined;

      if (!appBridgeApp) {
        setToastConfig({
          active: true,
          content: "❌ Shopify App Bridge app is unavailable. Try reloading the page.",
          variant: "error",
        });
        return;
      }

      const legacySelection = await openLegacyResourcePicker(appBridgeApp);

      if (legacySelection) {
        applyGiftProductSelection(legacySelection);
      }
    } catch (error) {
      console.error("Failed to launch Shopify resource picker", error);
      setToastConfig({
        active: true,
        content: "❌ Unable to open the product picker. Please refresh and try again.",
        variant: "error",
      });
    }
  }, [applyGiftProductSelection, setToastConfig, shopifyAppBridge]);

  const closeEditor = useCallback(() => {
    setIsModalOpen(false);
    setIsSaving(false);
  }, []);

  const handleToggleChange = useCallback((checked: boolean, _id: string) => {
    setEditorState((prev) => ({ ...prev, enabled: checked }));
  }, []);

  const handlePositionChange = useCallback((selected: string[]) => {
    const value = (selected[0] ?? "top") as BarPosition;
    setEditorState((prev) =>
      prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
        ? { ...prev, position: value }
        : prev
    );
  }, []);

  const handleFloatingAlignmentChange = useCallback(
    (alignment: FloatingAlignment) => {
      setEditorState((prev) =>
        prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
          ? { ...prev, floatingAlignment: alignment }
          : prev
      );
    },
    []
  );

  const handleColorModeChange = useCallback((selected: string[]) => {
    const nextMode = (selected[0] ?? "gradient") as ColorMode;
    setEditorState((prev) =>
      prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
        ? { ...prev, colorMode: nextMode }
        : prev
    );
  }, []);

  const handleGradientColorChange = useCallback(
    (target: "gradientStart" | "gradientEnd", color: HsbColor) => {
      const hex = hsbToHex(color);
      setEditorState((prev) =>
        prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
          ? { ...prev, [target]: hex }
          : prev
      );
    },
    []
  );

  const handleSolidColorPickerChange = useCallback((color: HsbColor) => {
    const hex = hsbToHex(color);
    setEditorState((prev) =>
      prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
        ? { ...prev, solidColor: hex }
        : prev
    );
  }, []);

  const handleTextColorPickerChange = useCallback((color: HsbColor) => {
    const hex = hsbToHex(color);
    setEditorState((prev) =>
      prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
        ? { ...prev, textColor: hex }
        : prev
    );
  }, []);

  const handleFontSizeChange = useCallback((value: string) => {
    setEditorState((prev) =>
      (prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle")
        ? { ...prev, fontSize: value as FontSizeOption }
        : prev
    );
  }, []);

  const handleBoldToggle = useCallback((checked: boolean, _id: string) => {
    setEditorState((prev) =>
      prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
        ? { ...prev, bold: checked }
        : prev
    );
  }, []);

  const handleAnimateProgressToggle = useCallback(
    (checked: boolean, _id: string) => {
      setEditorState((prev) =>
        prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
          ? { ...prev, animateProgress: checked }
          : prev
      );
    },
    []
  );

  const handleThresholdChange = useCallback((value: string) => {
    setEditorState((prev) =>
      prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
        ? { ...prev, threshold: value }
        : prev
    );
  }, []);

  const handleHideWhenUnlockedToggle = useCallback(
    (checked: boolean, _id: string) => {
      setEditorState((prev) =>
        prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
          ? { ...prev, hideWhenUnlocked: checked }
          : prev
      );
    },
    []
  );

  const handleAutoAddToggle = useCallback(
    (checked: boolean, _id: string) => {
      setEditorState((prev) => {
        if (prev.type !== "free-gift-bundle") {
          return prev;
        }

        if (!prev.giftVariantId) {
          if (checked) {
            setToastConfig({
              active: true,
              content: "Select a gift variant before enabling auto-add.",
              variant: "error",
            });
          }
          return { ...prev, autoAdd: false };
        }

        return { ...prev, autoAdd: checked };
      });
    },
    [setToastConfig]
  );

  const handleAutoRemoveToggle = useCallback(
    (checked: boolean, _id: string) => {
      setEditorState((prev) => {
        if (prev.type !== "free-gift-bundle") {
          return prev;
        }

        if (!prev.giftVariantId) {
          if (checked) {
            setToastConfig({
              active: true,
              content: "Select a gift variant before enabling auto-remove.",
              variant: "error",
            });
          }
          return { ...prev, autoRemove: false };
        }

        return { ...prev, autoRemove: checked };
      });
    },
    [setToastConfig]
  );

  const handleVisibilityModeChange = useCallback((selected: string[]) => {
    const nextMode = selected && selected[0] === "timed" ? "timed" : "always";

    setEditorState((prev) => {
      if (prev.type !== "free-shipping-bar" && prev.type !== "free-gift-bundle") {
        return prev;
      }

      if (prev.visibilityMode === nextMode) {
        return prev;
      }

      return {
        ...prev,
        visibilityMode: nextMode,
        visibilityDurationSeconds:
          nextMode === "timed" && !prev.visibilityDurationSeconds
            ? DEFAULT_VISIBILITY_DURATION_SECONDS.toString()
            : prev.visibilityDurationSeconds,
      };
    });
  }, []);

  const handleVisibilityDurationChange = useCallback((value: string) => {
    setEditorState((prev) => {
      if (prev.type !== "free-shipping-bar" && prev.type !== "free-gift-bundle") {
        return prev;
      }

      const digitsOnly = value.replace(/[^0-9]/g, "");

      if (!digitsOnly) {
        return { ...prev, visibilityDurationSeconds: "" };
      }

      const numeric = Math.min(
        Math.max(parseInt(digitsOnly, 10), MIN_VISIBILITY_DURATION_SECONDS),
        MAX_VISIBILITY_DURATION_SECONDS
      );

      return {
        ...prev,
        visibilityDurationSeconds: Number.isNaN(numeric)
          ? prev.visibilityDurationSeconds
          : numeric.toString(),
      };
    });
  }, []);

  const handleCurrencyModeToggle = useCallback(
    (checked: boolean) => {
      setEditorState((prev) => {
        if (prev.type !== "free-shipping-bar") {
          return prev;
        }

        if (checked && normalizedShopCurrency) {
          return {
            ...prev,
            currencyMode: "auto",
          };
        }

        const nextManualCurrency = isManualCurrencyCode(prev.manualCurrency)
          ? prev.manualCurrency
          : DEFAULT_MANUAL_CURRENCY;

        return {
          ...prev,
          currencyMode: "manual",
          manualCurrency: nextManualCurrency,
        };
      });
    },
    [normalizedShopCurrency]
  );

  const handleManualCurrencyChange = useCallback(
    (value: string) => {
      if (!isManualCurrencyCode(value)) {
        return;
      }

      setEditorState((prev) => {
        if (prev.type !== "free-shipping-bar") {
          return prev;
        }

        const nextState: FreeShippingBarSettings = {
          ...prev,
          manualCurrency: value,
        };

        if (prev.currencyMode === "auto" && !normalizedShopCurrency) {
          nextState.currencyMode = "manual";
        }

        return nextState;
      });
    },
    [normalizedShopCurrency]
  );

  const handlePreviewUnlockedToggle = useCallback(
    (checked: boolean, _id: string) => {
      setEditorState((prev) =>
        prev.type === "free-shipping-bar" || prev.type === "free-gift-bundle"
          ? { ...prev, previewUnlocked: checked }
          : prev
      );
    },
    []
  );

  const handleMessageTabChange = useCallback((tab: "locked" | "unlocked") => {
    setActiveMessageTab(tab);
  }, []);

  const handleLockedMessageChange = useCallback((value: string) => {
    setEditorState((prev) => {
      if (prev.type !== "free-shipping-bar" && prev.type !== "free-gift-bundle") {
        return prev;
      }

      const currencyCode =
        prev.type === "free-shipping-bar"
          ? prev.currencyMode === "manual"
            ? (isManualCurrencyCode(prev.manualCurrency)
                ? prev.manualCurrency
                : DEFAULT_MANUAL_CURRENCY)
            : normalizedShopCurrency ?? DEFAULT_MANUAL_CURRENCY
          : normalizedShopCurrency ?? DEFAULT_MANUAL_CURRENCY;

      const displayAmount = formatThresholdDisplay(prev.threshold, currencyCode);
      return {
        ...prev,
        lockedMessage: normalizeLockedTemplate(
          displayToTemplate(value, displayAmount)
        ),
      };
    });
  }, [normalizedShopCurrency]);

  const handleUnlockedMessageChange = useCallback((value: string) => {
    setEditorState((prev) => {
      if (prev.type !== "free-shipping-bar" && prev.type !== "free-gift-bundle") {
        return prev;
      }

      return {
        ...prev,
        unlockedMessage: cleanMessageSpacing(
          value.replaceAll(REMAINING_PLACEHOLDER, "")
        ),
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedBundle) {
      return;
    }

    if (
      editorState.type !== "free-shipping-bar" &&
      editorState.type !== "free-gift-bundle"
    ) {
      return;
    }

    if (isSaving) {
      return;
    }

    if (
      editorState.type === "free-gift-bundle" &&
      (editorState.autoAdd || editorState.autoRemove) &&
      !editorState.giftVariantId
    ) {
      setToastConfig({
        active: true,
        content:
          "Select a gift variant before enabling automatic gift actions.",
        variant: "error",
      });
      return;
    }

    if (editorState.type === "free-gift-bundle" && !canAccessGiftBundle) {
      setUpgradeModalOpen(true);
      return;
    }

    setIsSaving(true);

    try {
      if (editorState.type === "free-shipping-bar") {
        const { previewUnlocked, type, ...rawPersistableSettings } = editorState;
        const outboundSettings = sanitizeFreeShippingSettingsInput(
          rawPersistableSettings,
          { shopCurrency: normalizedShopCurrency }
        );

        const response = await fetch("/api/free-shipping/save", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bundle: selectedBundle.title,
            settings: outboundSettings,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          const message =
            (data && typeof data.error === "string" && data.error) ||
            "❌ Failed to save changes. Please try again.";
          throw new Error(message);
        }

        const updatedSettings = sanitizeFreeShippingSettingsInput(data.settings, {
          shopCurrency: normalizedShopCurrency,
        });

        setSavedFreeShippingSettings(updatedSettings);
        setEditorState((prev) => {
          if (prev.type !== "free-shipping-bar") {
            return prev;
          }

          return {
            ...prev,
            ...updatedSettings,
            previewUnlocked: prev.previewUnlocked,
          };
        });
      } else if (editorState.type === "free-gift-bundle") {
        const { previewUnlocked, type, ...rawPersistableSettings } = editorState;
        const outboundSettings = sanitizeFreeGiftSettingsInput(
          rawPersistableSettings,
          { shopCurrency: normalizedShopCurrency }
        );

        const response = await fetch("/api/free-gift-bundle/save", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bundle: selectedBundle.title,
            settings: outboundSettings,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          const message =
            (data && typeof data.error === "string" && data.error) ||
            "❌ Failed to save changes. Please try again.";
          throw new Error(message);
        }

        const updatedSettings = sanitizeFreeGiftSettingsInput(data.settings, {
          shopCurrency: normalizedShopCurrency,
        });

        setSavedFreeGiftSettings(updatedSettings);
        setEditorState((prev) => {
          if (prev.type !== "free-gift-bundle") {
            return prev;
          }

          return {
            ...prev,
            ...updatedSettings,
            previewUnlocked: prev.previewUnlocked,
          };
        });
      }

      setToastConfig({
        active: true,
        content: "✅ Settings saved successfully!",
        variant: "success",
      });

      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to save bundle settings", error);

      const fallbackMessage =
        error instanceof Error && error.message
          ? error.message
          : "❌ Failed to save changes. Please try again.";

      setToastConfig({
        active: true,
        content: fallbackMessage,
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    editorState,
    isSaving,
    normalizedShopCurrency,
    selectedBundle,
    setIsModalOpen,
    setSavedFreeGiftSettings,
    setSavedFreeShippingSettings,
    setToastConfig,
    canAccessGiftBundle,
  ]);
  const computedThresholdDisplay = useMemo(
    () => formatThresholdDisplay(editorState.threshold, resolvedCurrencyCode),
    [editorState.threshold, resolvedCurrencyCode]
  );

  const thresholdDisplayText = computedThresholdDisplay || defaultThresholdDisplay;

  const lockedMessagePreview = useMemo(
    () => templateToDisplay(editorState.lockedMessage, computedThresholdDisplay),
    [editorState.lockedMessage, computedThresholdDisplay]
  );

  const fallbackUnlockedMessage =
    editorState.type === "free-gift-bundle"
      ? DEFAULT_GIFT_UNLOCKED_MESSAGE
      : DEFAULT_UNLOCKED_MESSAGE;

  const unlockedPreviewMessage = useMemo(
    () =>
      formatUnlockedPreview(
        editorState.unlockedMessage,
        computedThresholdDisplay,
        fallbackUnlockedMessage
      ),
    [editorState.unlockedMessage, computedThresholdDisplay, fallbackUnlockedMessage]
  );

  const gradientStartColor = useMemo(
    () =>
      hexToHsb(
        editorState.gradientStart ||
          (editorState.type === "free-gift-bundle"
            ? DEFAULT_GIFT_GRADIENT_START
            : DEFAULT_GRADIENT_START),
        editorState.type === "free-gift-bundle"
          ? DEFAULT_GIFT_GRADIENT_START
          : DEFAULT_GRADIENT_START
      ),
    [editorState.gradientStart, editorState.type]
  );

  const gradientEndColor = useMemo(
    () =>
      hexToHsb(
        editorState.gradientEnd ||
          (editorState.type === "free-gift-bundle"
            ? DEFAULT_GIFT_GRADIENT_END
            : DEFAULT_GRADIENT_END),
        editorState.type === "free-gift-bundle"
          ? DEFAULT_GIFT_GRADIENT_END
          : DEFAULT_GRADIENT_END
      ),
    [editorState.gradientEnd, editorState.type]
  );

  const solidColorHsb = useMemo(
    () =>
      hexToHsb(
        editorState.solidColor ||
          (editorState.type === "free-gift-bundle"
            ? DEFAULT_GIFT_SOLID_COLOR
            : DEFAULT_SOLID_COLOR),
        editorState.type === "free-gift-bundle"
          ? DEFAULT_GIFT_SOLID_COLOR
          : DEFAULT_SOLID_COLOR
      ),
    [editorState.solidColor, editorState.type]
  );

  const textColorHsb = useMemo(
    () =>
      hexToHsb(
        editorState.textColor ||
          (editorState.type === "free-gift-bundle"
            ? DEFAULT_GIFT_TEXT_COLOR
            : DEFAULT_TEXT_COLOR),
        editorState.type === "free-gift-bundle"
          ? DEFAULT_GIFT_TEXT_COLOR
          : DEFAULT_TEXT_COLOR
      ),
    [editorState.textColor, editorState.type]
  );

  const previewMessage = editorState.previewUnlocked
    ? unlockedPreviewMessage
    : lockedMessagePreview;

  const previewStyle: CSSProperties = useMemo(() => {
    const base: CSSProperties = {
      color: editorState.textColor,
      padding: editorState.position === "floating" ? "14px 32px" : "16px 24px",
      borderRadius: editorState.position === "floating" ? "999px" : "12px",
      textAlign: "center",
      fontWeight: editorState.bold ? 700 : 500,
      fontSize:
        editorState.fontSize === "small"
          ? "14px"
          : editorState.fontSize === "large"
            ? "18px"
            : "16px",
      boxShadow:
        editorState.position === "floating"
          ? "0 16px 32px rgba(22, 163, 74, 0.25)"
          : "var(--p-shadow-200)",
      transition: "all 0.2s ease",
      margin: "0 auto",
      maxWidth: editorState.position === "floating" ? "540px" : "100%",
    };

    if (editorState.colorMode === "gradient") {
      base.backgroundImage = `linear-gradient(90deg, ${editorState.gradientStart}, ${editorState.gradientEnd})`;
      base.backgroundColor = "transparent";
      base.backgroundSize = editorState.animateProgress ? "200% 200%" : "100% 100%";
      base.animation = editorState.animateProgress
        ? "fsbGradientShift 6s ease infinite, fsbPreviewFade 240ms ease"
        : "fsbPreviewFade 240ms ease";
    } else {
      base.backgroundImage = "none";
      base.backgroundColor = editorState.solidColor;
      base.animation = "fsbPreviewFade 240ms ease";
    }

    if (!editorState.enabled) {
      base.opacity = 0.4;
    }

    return base;
  }, [editorState]);

  const previewContainerStyle: CSSProperties = useMemo(() => {
    if (editorState.position === "floating") {
      const alignmentMap: Record<FloatingAlignment, CSSProperties> = {
        "top-left": { justifyContent: "flex-start", alignItems: "flex-start" },
        "top-center": { justifyContent: "flex-start", alignItems: "center" },
        "top-right": { justifyContent: "flex-start", alignItems: "flex-end" },
        "bottom-left": { justifyContent: "flex-end", alignItems: "flex-start" },
        "bottom-center": { justifyContent: "flex-end", alignItems: "center" },
        "bottom-right": { justifyContent: "flex-end", alignItems: "flex-end" },
      };

      const alignmentStyles = alignmentMap[editorState.floatingAlignment];

      return {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: "220px",
        borderRadius: "16px",
        padding: "20px",
        background:
          "linear-gradient(180deg, rgba(15, 118, 110, 0.12), rgba(15, 118, 110, 0))",
        transition: "all 0.2s ease",
        ...alignmentStyles,
      };
    }

    return {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      justifyContent: editorState.position === "top" ? "flex-start" : "flex-end",
      alignItems: "stretch",
      minHeight: "180px",
      borderRadius: "16px",
      padding: "20px",
      background:
        "linear-gradient(180deg, rgba(15, 118, 110, 0.12), rgba(15, 118, 110, 0))",
      transition: "all 0.2s ease",
    };
  }, [editorState]);

  const positionDescription = useMemo(() => {
    if (editorState.position === "floating") {
      const label = FLOATING_ALIGNMENT_OPTIONS.find(
        (option) => option.value === editorState.floatingAlignment
      );
      return `Floating (${label?.label ?? "Floating"})`;
    }

    return editorState.position === "top" ? "Top of page" : "Bottom of page";
  }, [editorState.floatingAlignment, editorState.position]);

  const isFreeShippingEditor =
    selectedBundle?.title === "Free Shipping Bar" &&
    editorState.type === "free-shipping-bar";

  const isFreeGiftEditor =
    selectedBundle?.title === "Free Gift Bundle" &&
    editorState.type === "free-gift-bundle";

  const giftVariantSelectValue =
    editorState.type === "free-gift-bundle"
      ? editorState.giftVariantId ?? giftVariantOptions[0]?.id ?? ""
      : "";

  const handleToastDismiss = useCallback(() => {
    setToastConfig((prev) => ({ ...prev, active: false }));
  }, []);

  const toastMarkup = toastConfig.active ? (
    <Toast
      content={toastConfig.content}
      error={toastConfig.variant === "error"}
      onDismiss={handleToastDismiss}
    />
  ) : null;

  const bundleCards = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "24px",
        justifyContent: "center",
        transition: "filter 0.2s ease",
        filter: isModalOpen ? "blur(4px)" : "none",
      }}
    >
      {bundles.map((bundle) => {
        const isFreeShipping = bundle.title === "Free Shipping Bar";
        const previewImageSrc = isFreeShipping
          ? "/images/free-shipping-bar-preview.png"
          : "/images/free-gift-preview.png";
        const previewImageAlt = isFreeShipping
          ? "Free Shipping Bar Preview"
          : "Free Gift Bundle Preview";

        return (
          <div
            key={bundle.title}
            style={{
              borderRadius: "16px",
              background:
                "linear-gradient(135deg, rgba(0, 128, 96, 0.12), rgba(0, 128, 96, 0))",
              padding: "2px",
              transition: "transform 0.25s ease, box-shadow 0.25s ease",
              boxShadow: "var(--p-shadow-200)",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = "scale(1.03)";
              event.currentTarget.style.boxShadow = "var(--p-shadow-400)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = "scale(1)";
              event.currentTarget.style.boxShadow = "var(--p-shadow-200)";
            }}
          >
            <Card>
              <div style={{ padding: "24px", width: "320px", minHeight: "420px" }}>
                <BlockStack gap="300">
                  <div
                  style={{
                    width: "100%",
                    height: "160px",
                    overflow: "hidden",
                    borderRadius: "12px",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isFreeShipping
                      ? "linear-gradient(135deg, rgba(89, 35, 230, 0.9), rgba(6, 165, 106, 0.9))"
                      : "#F9FAFB",
                  }}
                >
                  <img
                    src={previewImageSrc}
                    alt={previewImageAlt}
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                      borderRadius: "12px",
                    }}
                    onError={(event) => {
                      const target = event.currentTarget;
                      target.style.display = "none";
                    }}
                    loading="lazy"
                  />
                </div>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingXl">
                      {bundle.title}
                    </Text>
                    <Text as="p" tone="subdued">
                      {bundle.description}
                    </Text>
                    {bundle.title === "Free Gift Bundle" && !canAccessGiftBundle ? (
                      <Text as="p" tone="subdued" variant="bodySm">
                        Included with the Full Bundle Plan.
                      </Text>
                    ) : null}
                  </BlockStack>
                  <BlockStack gap="200">
                      <Button
                        onClick={() => {
                          if (bundle.title === "Free Gift Bundle" && !canAccessGiftBundle) {
                            setUpgradeModalOpen(true);
                            return;
                          }

                          openEditor(bundle);
                        }}
                        variant="primary"
                      >
                      Manage
                    </Button>
                  </BlockStack>
                </BlockStack>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );

  const colorPickerPopoverContentStyles: CSSProperties = {
    position: "relative",
    zIndex: 30,
    padding: "16px",
    background: "var(--p-color-bg-surface)",
    borderRadius: "var(--p-border-radius-200)",
    boxShadow: "var(--p-shadow-300)",
  };

  const modalPrimaryAction = {
    content: "Save changes",
    onAction: handleSave,
    disabled: isSaving,
    loading: isSaving,
  };

  const modalSecondaryActions = [
    {
      content: "Close",
      onAction: closeEditor,
    },
  ];

  const renderGiftProductDetails = () => {
    if (!isFreeGiftEditor) {
      return null;
    }

    if (!editorState.giftProductId) {
      return (
        <Text as="span" tone="subdued" variant="bodySm">
          Select a product to automatically add as the free gift when shoppers qualify.
        </Text>
      );
    }

    return (
      <InlineStack gap="200" align="start">
        {editorState.giftProductImageUrl ? (
          <img
            src={editorState.giftProductImageUrl}
            alt={editorState.giftProductTitle ?? "Gift product"}
            style={{ width: "64px", height: "64px", borderRadius: "8px", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--p-color-bg-surface-secondary)",
              color: "var(--p-color-text-subdued)",
              fontSize: "12px",
              flexShrink: 0,
            }}
          >
            No image
          </div>
        )}
        <BlockStack gap="100">
          <Text as="p" variant="bodyMd">{editorState.giftProductTitle ?? "Selected product"}</Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {editorState.giftVariantTitle
              ? `Variant: ${editorState.giftVariantTitle}`
              : "Variant will auto-apply when shopper qualifies."}
          </Text>
        </BlockStack>
      </InlineStack>
    );
  };

  const modalContent = selectedBundle ? (
    <BlockStack gap="500">
      <Text as="h2" variant="headingLg">
        {selectedBundle.title}
      </Text>
      <BlockStack gap="400">
        <Card>
          <Box padding="300">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">
                  Position &amp; layout
                </Text>
                <Button
                  variant="plain"
                  onClick={() => toggleSection("positionLayout")}
                  accessibilityLabel="Toggle position section"
                >
                  {expandedSections.positionLayout ? "Hide" : "Show"}
                </Button>
              </InlineStack>
              <Collapsible open={expandedSections.positionLayout} id="bundle-position-layout">
                <BlockStack gap="300">
                  <Checkbox
                    label={`Enable ${selectedBundle.title}`}
                    checked={editorState.enabled}
                    onChange={handleToggleChange}
                  />
                  <ChoiceList
                    title="Display position"
                    selected={[editorState.position]}
                    onChange={handlePositionChange}
                    choices={[
                      { label: "Top of page", value: "top" },
                      { label: "Bottom of page", value: "bottom" },
                      { label: "Floating", value: "floating" },
                    ]}
                  />
                  {editorState.position === "floating" ? (
                    <BlockStack gap="150">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Floating placement
                      </Text>
                      <ButtonGroup variant="segmented">
                        {FLOATING_ALIGNMENT_OPTIONS.map((option) => (
                          <Button
                            key={option.value}
                            pressed={editorState.floatingAlignment === option.value}
                            onClick={() => handleFloatingAlignmentChange(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </ButtonGroup>
                    </BlockStack>
                  ) : null}
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="300">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">
                  Appearance
                </Text>
                <Button
                  variant="plain"
                  onClick={() => toggleSection("appearance")}
                  accessibilityLabel="Toggle appearance section"
                >
                  {expandedSections.appearance ? "Hide" : "Show"}
                </Button>
              </InlineStack>
              <Collapsible open={expandedSections.appearance} id="bundle-appearance">
                <BlockStack gap="300">
                  <BlockStack gap="150">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Background style
                    </Text>
                    <ButtonGroup variant="segmented">
                      <Button
                        pressed={editorState.colorMode === "gradient"}
                        onClick={() => handleColorModeChange(["gradient"])}
                      >
                        Gradient
                      </Button>
                      <Button
                        pressed={editorState.colorMode === "solid"}
                        onClick={() => handleColorModeChange(["solid"])}
                      >
                        Solid
                      </Button>
                    </ButtonGroup>
                  </BlockStack>

                  {editorState.colorMode === "gradient" ? (
                    <InlineStack gap="300" wrap align="start">
                      <BlockStack gap="150">
                        <Text as="h4" variant="headingSm">
                          Gradient start
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Popover
                            active={gradientStartPopoverActive}
                            activator={
                              <Button
                                disclosure
                                onClick={toggleGradientStartPopover}
                                accessibilityLabel="Pick gradient start color"
                              >
                                Choose color
                              </Button>
                            }
                            onClose={() => setGradientStartPopoverActive(false)}
                            autofocusTarget="none"
                          >
                            <div style={colorPickerPopoverContentStyles}>
                              <ColorPicker
                                onChange={(color) => handleGradientColorChange("gradientStart", color)}
                                color={gradientStartColor}
                              />
                            </div>
                          </Popover>
                          <div
                            aria-hidden
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "8px",
                              border: "1px solid rgba(0, 0, 0, 0.12)",
                              background: editorState.gradientStart,
                            }}
                          />
                        </InlineStack>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {editorState.gradientStart.toUpperCase()}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="150">
                        <Text as="h4" variant="headingSm">
                          Gradient end
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Popover
                            active={gradientEndPopoverActive}
                            activator={
                              <Button
                                disclosure
                                onClick={toggleGradientEndPopover}
                                accessibilityLabel="Pick gradient end color"
                              >
                                Choose color
                              </Button>
                            }
                            onClose={() => setGradientEndPopoverActive(false)}
                            autofocusTarget="none"
                          >
                            <div style={colorPickerPopoverContentStyles}>
                              <ColorPicker
                                onChange={(color) => handleGradientColorChange("gradientEnd", color)}
                                color={gradientEndColor}
                              />
                            </div>
                          </Popover>
                          <div
                            aria-hidden
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "8px",
                              border: "1px solid rgba(0, 0, 0, 0.12)",
                              background: editorState.gradientEnd,
                            }}
                          />
                        </InlineStack>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {editorState.gradientEnd.toUpperCase()}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  ) : (
                    <BlockStack gap="150">
                      <Text as="h4" variant="headingSm">
                        Background color
                      </Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Popover
                          active={solidColorPopoverActive}
                          activator={
                            <Button
                              disclosure
                              onClick={toggleSolidColorPopover}
                              accessibilityLabel="Pick background color"
                            >
                              Choose color
                            </Button>
                          }
                          onClose={() => setSolidColorPopoverActive(false)}
                          autofocusTarget="none"
                        >
                          <div style={colorPickerPopoverContentStyles}>
                            <ColorPicker onChange={handleSolidColorPickerChange} color={solidColorHsb} />
                          </div>
                        </Popover>
                        <div
                          aria-hidden
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "8px",
                            border: "1px solid rgba(0, 0, 0, 0.12)",
                            background: editorState.solidColor,
                          }}
                        />
                      </InlineStack>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {editorState.solidColor.toUpperCase()}
                      </Text>
                    </BlockStack>
                  )}

                  <div style={{ maxWidth: "260px" }}>
                    <BlockStack gap="150">
                      <Text as="h4" variant="headingSm">
                        Text color
                      </Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Popover
                          active={textColorPopoverActive}
                          activator={
                            <Button
                              disclosure
                              onClick={toggleTextColorPopover}
                              accessibilityLabel="Pick text color"
                            >
                              Choose color
                            </Button>
                          }
                          onClose={() => setTextColorPopoverActive(false)}
                          autofocusTarget="none"
                        >
                          <div style={colorPickerPopoverContentStyles}>
                            <ColorPicker onChange={handleTextColorPickerChange} color={textColorHsb} />
                          </div>
                        </Popover>
                        <div
                          aria-hidden
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "8px",
                            border: "1px solid rgba(0, 0, 0, 0.12)",
                            background: editorState.textColor,
                          }}
                        />
                      </InlineStack>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {editorState.textColor.toUpperCase()}
                      </Text>
                    </BlockStack>
                  </div>
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="300">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">
                  Messages
                </Text>
                <Button
                  variant="plain"
                  onClick={() => toggleSection("textSettings")}
                  accessibilityLabel="Toggle messaging section"
                >
                  {expandedSections.textSettings ? "Hide" : "Show"}
                </Button>
              </InlineStack>
              <Collapsible open={expandedSections.textSettings} id="bundle-text-settings">
                <BlockStack gap="300">
                  <ButtonGroup variant="segmented">
                    <Button
                      pressed={activeMessageTab === "locked"}
                      onClick={() => handleMessageTabChange("locked")}
                    >
                      Before unlocked
                    </Button>
                    <Button
                      pressed={activeMessageTab === "unlocked"}
                      onClick={() => handleMessageTabChange("unlocked")}
                    >
                      After unlocked
                    </Button>
                  </ButtonGroup>

                  <BlockStack gap="150">
                    <Text as="h4" variant="headingSm">
                      {activeMessageTab === "locked"
                        ? "Before unlocked message"
                        : "Unlocked message"}
                    </Text>
                    <TextField
                      labelHidden
                      label={activeMessageTab === "locked" ? "Before unlocked message" : "Unlocked message"}
                      value={activeMessageTab === "locked" ? lockedMessagePreview : editorState.unlockedMessage}
                      onChange={
                        activeMessageTab === "locked"
                          ? handleLockedMessageChange
                          : handleUnlockedMessageChange
                      }
                      autoComplete="off"
                      multiline
                    />
                    <Text as="span" tone="subdued" variant="bodySm">
                      {activeMessageTab === "locked"
                        ? `We keep ${thresholdDisplayText} in your copy so shoppers always see the current threshold.`
                        : "This unlocked message hides the amount automatically once the reward is earned."}
                    </Text>
                  </BlockStack>

                  <InlineStack gap="300" wrap>
                    <Select
                      label="Font size"
                      options={[
                        { label: "Small", value: "small" },
                        { label: "Medium", value: "medium" },
                        { label: "Large", value: "large" },
                      ]}
                      value={editorState.fontSize}
                      onChange={handleFontSizeChange}
                    />
                    <Checkbox
                      label="Bold text"
                      checked={editorState.bold}
                      onChange={handleBoldToggle}
                    />
                  </InlineStack>
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="300">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">
                  Behavior
                </Text>
                <Button
                  variant="plain"
                  onClick={() => toggleSection("behavior")}
                  accessibilityLabel="Toggle behavior section"
                >
                  {expandedSections.behavior ? "Hide" : "Show"}
                </Button>
              </InlineStack>
              <Collapsible open={expandedSections.behavior} id="bundle-behavior">
                <BlockStack gap="300">
                  <TextField
                    label={editorState.type === "free-gift-bundle" ? "Gift unlock threshold" : "Free shipping threshold"}
                    type="number"
                    min={0}
                    value={editorState.threshold}
                    onChange={handleThresholdChange}
                    prefix={currencyInputPrefix}
                    suffix={currencyInputSuffix}
                    autoComplete="off"
                  />
                  <Checkbox
                    label="Animate when amount updates"
                    checked={editorState.animateProgress}
                    onChange={handleAnimateProgressToggle}
                  />
                  <Checkbox
                    label={
                      editorState.type === "free-gift-bundle"
                        ? "Hide banner when gift unlocked"
                        : "Hide bar when free shipping unlocked"
                    }
                    checked={editorState.hideWhenUnlocked}
                    onChange={handleHideWhenUnlockedToggle}
                  />

                  {isFreeGiftEditor ? (
                    <BlockStack gap="200">
                      <BlockStack gap="150">
                        <Text as="h4" variant="headingSm">
                          Gift product
                        </Text>
                        <InlineStack gap="200">
                          <Button onClick={handleGiftProductSelect}>
                            {editorState.giftProductId ? "Change gift product" : "Select gift product"}
                          </Button>
                          {editorState.giftProductId ? (
                            <Button variant="plain" onClick={handleGiftProductClear}>
                              Remove selection
                            </Button>
                          ) : null}
                        </InlineStack>
                        {renderGiftProductDetails()}
                      </BlockStack>

                      {editorState.giftProductId && giftVariantOptions.length > 0 ? (
                        <Select
                          label="Gift variant"
                          options={giftVariantOptions.map((option) => ({
                            label: option.title,
                            value: option.id,
                          }))}
                          value={giftVariantSelectValue}
                          onChange={handleGiftVariantChange}
                          helpText="Pick the variant we should add when shoppers hit the threshold."
                        />
                      ) : null}

                      {editorState.giftProductId && giftVariantOptions.length === 0 ? (
                        <Text as="span" tone="subdued" variant="bodySm">
                          This product has no variants, so automatic gift actions stay disabled.
                        </Text>
                      ) : null}

                      <Checkbox
                        label="Auto-add gift to cart"
                        checked={editorState.autoAdd}
                        onChange={handleAutoAddToggle}
                        disabled={!editorState.giftVariantId}
                        helpText="Automatically add the selected gift when shoppers hit the threshold."
                      />
                      <Checkbox
                        label="Remove gift if threshold lost"
                        checked={editorState.autoRemove}
                        onChange={handleAutoRemoveToggle}
                        disabled={!editorState.giftVariantId}
                        helpText="Keep the gift in sync if the cart total drops below the requirement."
                      />
                    </BlockStack>
                  ) : null}

                  <BlockStack gap="150">
                    <Text as="h4" variant="headingSm">
                      Visibility
                    </Text>
                    <ChoiceList
                      title="Visibility"
                      titleHidden
                      selected={[editorState.visibilityMode]}
                      choices={[
                        { label: "Show all the time", value: "always" },
                        { label: "Hide after a timer", value: "timed" },
                      ]}
                      onChange={handleVisibilityModeChange}
                    />
                    {editorState.visibilityMode === "timed" ? (
                      <TextField
                        label="Hide after (seconds)"
                        type="number"
                        min={MIN_VISIBILITY_DURATION_SECONDS}
                        max={MAX_VISIBILITY_DURATION_SECONDS}
                        value={editorState.visibilityDurationSeconds ?? ""}
                        onChange={handleVisibilityDurationChange}
                        autoComplete="off"
                      />
                    ) : null}
                  </BlockStack>
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Box>
        </Card>

        {isFreeShippingEditor ? (
          <Card>
            <Box padding="300">
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Currency
                  </Text>
                  <Button
                    variant="plain"
                    onClick={() => toggleSection("currency")}
                    accessibilityLabel="Toggle currency section"
                  >
                    {expandedSections.currency ? "Hide" : "Show"}
                  </Button>
                </InlineStack>
                <Collapsible open={expandedSections.currency} id="bundle-currency">
                  <BlockStack gap="200">
                    <Checkbox
                      label="Automatically detect store currency"
                      checked={isCurrencyAuto}
                      onChange={handleCurrencyModeToggle}
                      disabled={!normalizedShopCurrency}
                    />
                    {shouldShowManualCurrencySelect ? (
                      <Select
                        label="Manual currency"
                        options={MANUAL_CURRENCY_OPTIONS.map((option) => ({
                          label: option.label,
                          value: option.value,
                        }))}
                        value={manualCurrencyValue}
                        onChange={handleManualCurrencyChange}
                      />
                    ) : null}
                    {!normalizedShopCurrency ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        We couldn’t detect your store currency, so we defaulted to {DEFAULT_MANUAL_CURRENCY}.
                        Choose a different option above if needed.
                      </Text>
                    ) : null}
                  </BlockStack>
                </Collapsible>
              </BlockStack>
            </Box>
          </Card>
        ) : null}

        <Card>
          <Box padding="300">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">
                  Live preview
                </Text>
                <Button
                  variant="plain"
                  onClick={() => toggleSection("livePreview")}
                  accessibilityLabel="Toggle live preview section"
                >
                  {expandedSections.livePreview ? "Hide" : "Show"}
                </Button>
              </InlineStack>
              <Collapsible open={expandedSections.livePreview} id="bundle-preview">
                <BlockStack gap="300">
                  <Checkbox
                    label="Preview unlocked state"
                    checked={editorState.previewUnlocked}
                    onChange={handlePreviewUnlockedToggle}
                  />
                  <Text as="span" tone="subdued" variant="bodySm">
                    Currently showing the {editorState.previewUnlocked ? "unlocked" : "locked"} message.
                  </Text>
                  <div style={previewContainerStyle}>
                    <div style={previewStyle}>{previewMessage}</div>
                  </div>
                  <InlineStack gap="300" wrap>
                    <Text as="span" tone="subdued" variant="bodySm">
                      Position: {positionDescription}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      Threshold: {thresholdDisplayText || "Not set"}
                    </Text>
                    {isFreeGiftEditor ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        Auto-add: {editorState.autoAdd ? "On" : "Off"}
                      </Text>
                    ) : null}
                  </InlineStack>
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </BlockStack>
  ) : null;

  return (
    <Frame>
      {toastMarkup}
      <style>{GLOBAL_STYLE_BLOCK + POLARIS_COLORPICKER_FIXES}</style>
      <Page>
        <TitleBar title="My Bundles" />
        <BlockStack gap="600">
          <BlockStack gap="200">
            <Text as="h1" variant="heading3xl">
              My Bundles
            </Text>
            <Text as="p" tone="subdued">
              Configure and manage the conversion bundles that keep your customers engaged.
            </Text>
            <InlineStack gap="200" wrap blockAlign="center">
              <Badge tone="info">{`Current plan: ${planDisplayName}`}</Badge>
              {subscriptionStatus !== "ACTIVE" ? (
                <Badge tone="attention">{`Status: ${subscriptionStatus}`}</Badge>
              ) : null}
              {!canAccessGiftBundle ? (
                <Badge tone="attention">Gift Bundle locked</Badge>
              ) : null}
            </InlineStack>
          </BlockStack>
          {bundleCards}
        </BlockStack>
      </Page>
      <Modal
        open={isModalOpen}
        onClose={closeEditor}
        title={selectedBundle?.title ?? ""}
        primaryAction={modalPrimaryAction}
        secondaryActions={modalSecondaryActions}
        size="large"
      >
        <Modal.Section>{modalContent}</Modal.Section>
      </Modal>
      <Modal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade required"
        primaryAction={{
          content: "Upgrade now",
          onAction: () => {
            setUpgradeModalOpen(false);
            navigate("/app/pricing");
          },
        }}
        secondaryActions={[
          {
            content: "Maybe later",
            onAction: () => setUpgradeModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              Upgrade to the Full Bundle Plan to unlock the Free Gift Bundle and delight shoppers with automatic gift incentives.
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              The Shipping Plan includes the Free Shipping Bar only. Switch plans to enable and customize gift bundles.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Frame>
  );
}

export default MyBundles;
