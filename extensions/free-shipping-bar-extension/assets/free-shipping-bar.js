(function () {
  var scriptElement = typeof document !== "undefined" ? document.currentScript : null;
  var runtimeConfig = null;

  if (scriptElement && scriptElement.dataset) {
    var dataset = scriptElement.dataset;
    var datasetBundle = dataset.bundleType || dataset.bundle || "";
    var datasetRoot = dataset.rootId || dataset.root || "";

    if (datasetBundle || datasetRoot) {
      runtimeConfig = {};
      if (datasetBundle) {
        runtimeConfig.bundleType = datasetBundle;
      }
      if (datasetRoot) {
        runtimeConfig.rootId = datasetRoot;
      }
    }
  }

  if (!runtimeConfig && typeof window !== "undefined") {
    var candidate = window.__FSB_BUNDLE_CONFIG__;
    if (candidate && typeof candidate === "object") {
      runtimeConfig = Object.assign({}, candidate);
    }
    if (window.__FSB_BUNDLE_CONFIG__ !== undefined) {
      try {
        delete window.__FSB_BUNDLE_CONFIG__;
      } catch (_error) {
        window.__FSB_BUNDLE_CONFIG__ = undefined;
      }
    }
  }

  var resolvedBundleType = runtimeConfig && typeof runtimeConfig.bundleType === "string"
    ? runtimeConfig.bundleType.trim().toLowerCase()
    : "";

  var BUNDLE_TYPE = resolvedBundleType === "free-gift" ? "free-gift" : "free-shipping";
  var ROOT_ID = runtimeConfig && typeof runtimeConfig.rootId === "string" && runtimeConfig.rootId.trim()
    ? runtimeConfig.rootId.trim()
    : "free-shipping-bar-root";
  var SETTINGS_ENDPOINT_ATTR = "data-settings-endpoint";
  var SHOP_DOMAIN_ATTR = "data-shop-domain";
  var SHOP_CURRENCY_ATTR = "data-shop-currency";
  var LOCALE_ATTR = "data-locale";
  var CART_ADD_ENDPOINT = "/cart/add.js";
  var CART_CHANGE_ENDPOINT = "/cart/change.js";
  var CART_ENDPOINT = "/cart.js";
  var CART_REFRESH_EVENTS = [
    "shopify:cart:refresh",
    "shopify:cart:update",
    "shopify:cart:add",
    "shopify:cart:change",
    "ajaxCart:afterCartLoad",
    "cart:refresh",
    "cart:updated",
    "cart:update",
    "cart:change",
    "cart:clear",
    "cart:item-added",
    "cart:item-removed"
  ];
  var CART_MUTATION_PATH_PATTERN = /\/cart\/(add|update|change|clear)(\.js)?/i;
  var THEME_EDITOR_EVENTS = [
    "shopify:section:load",
    "shopify:section:select",
    "shopify:section:deselect",
    "shopify:block:select",
    "shopify:block:deselect"
  ];
  var CART_POLL_INTERVAL = 30000;
  var VISIBILITY_DURATION_MIN = 1;
  var VISIBILITY_DURATION_MAX = 30;
  var VISIBILITY_HIDE_ANIMATION_MS = 320;
  var GIFT_PROPERTY_NAME = "_fsb_free_gift";
  var POSITION_VALUES = ["top", "bottom", "floating", "inline"];

  var FONT_SIZE_MAP = {
    small: "14px",
    medium: "16px",
    large: "18px",
  };

  var FLOATING_ALIGNMENTS = [
    "top-left",
    "top-center",
    "top-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];

  var CART_INDICATOR_SELECTOR_CANDIDATES = [
    "[data-cart-count]",
    ".cart-count",
    ".cart__count",
    ".header__cart-count",
    ".header__icon--cart .count",
    ".site-header__cart-count",
    "[data-header-cart-count]",
    "[data-cart-bubble]",
    ".cart-bubble"
  ];

  var PLACEHOLDER_PATTERN = /{{\s*(?:amount|remaining|threshold)\s*}}|\[\s*(?:amount|remaining|threshold)\s*\]/gi;
  var PLACEHOLDER_SENTINEL = "__FSB_REMAINING__";
  var THRESHOLD_PLACEHOLDER_SENTINEL = "__FSB_THRESHOLD__";

  var DEFAULT_CONFIGS = {
    "free-shipping": {
      enabled: true,
      position: "top",
      floatingAlignment: "top-center",
      colorMode: "gradient",
      solidColor: "#16A34A",
      gradientStart: "#4ADE80",
      gradientEnd: "#16A34A",
      textColor: "#FFFFFF",
      fontSize: "medium",
      bold: true,
      animateProgress: true,
      threshold: 20,
      hideWhenUnlocked: false,
      lockedMessage: "Spend {{remaining}} more to unlock Free Shipping!",
      unlockedMessage: "Congratulations! You unlocked Free Shipping!",
      currencyMode: "auto",
      manualCurrency: "EUR",
      visibilityMode: "always",
      visibilityDurationSeconds: 10
    },
    "free-gift": {
      enabled: false,
      position: "top",
      floatingAlignment: "top-center",
      colorMode: "gradient",
      solidColor: "#F97316",
      gradientStart: "#9333EA",
      gradientEnd: "#F97316",
      textColor: "#FFFFFF",
      fontSize: "medium",
      bold: true,
      animateProgress: true,
      threshold: 75,
      hideWhenUnlocked: false,
      lockedMessage: "Add {{remaining}} more to unlock your free gift!",
      unlockedMessage: "You've unlocked your free gift!",
      currencyMode: "auto",
      manualCurrency: "EUR",
      visibilityMode: "always",
      visibilityDurationSeconds: 10,
      autoAdd: true,
      autoRemove: true,
      giftProductId: null,
      giftProductTitle: null,
      giftVariantId: null,
      giftVariantTitle: null,
      giftProductImageUrl: null,
      giftVariantNumericId: null
    }
  };

  var DEFAULT_CONFIG = DEFAULT_CONFIGS[BUNDLE_TYPE] || DEFAULT_CONFIGS["free-shipping"];

  var state = {
    root: null,
    bundleType: BUNDLE_TYPE,
    config: Object.assign({}, DEFAULT_CONFIG),
    settingsEndpoint: null,
    shopDomain: null,
    shopCurrency: null,
    locale: null,
    cart: null,
    host: null,
    bar: null,
    text: null,
    pollTimer: null,
    loadingSettings: false,
    cartEventsBound: false,
    cartEventHandler: null,
    fetchPatched: false,
    xhrPatched: false,
    formListenerBound: false,
    cartIndicatorObserver: null,
    cartIndicatorObserverTimer: null,
    scheduledRefresh: null,
    cartMonitoringInitialized: false,
    cartRequestInFlight: false,
    pendingCartRefresh: false,
    themeEventsBound: false,
    configReady: false,
    visibilityTimer: null,
    visibilityHideAnimationTimer: null,
    visibilitySuppressed: false,
    lastCartSignature: null,
    giftAddInFlight: false,
    giftRemoveInFlight: false,
    giftPendingConfirmation: false,
    giftLastAttemptSignature: null,
    giftLastAddedVariantId: null,
    originalParent: null,
    originalPlaceholder: null,
  };

  function coerceBoolean(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      var normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") {
        return true;
      }
      if (normalized === "false" || normalized === "0") {
        return false;
      }
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }

    return fallback;
  }

  function sanitizeNumber(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      var parsed = parseFlexibleNumber(value.trim());
      if (parsed !== null) {
        return parsed;
      }
    }
    return fallback;
  }

  function parseFlexibleNumber(value) {
    if (typeof value !== "string") {
      return null;
    }

    var trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    var cleaned = trimmed.replace(/[^0-9.,-]/g, "").replace(/\s+/g, "");
    if (!cleaned) {
      return null;
    }

    var lastComma = cleaned.lastIndexOf(",");
    var lastDot = cleaned.lastIndexOf(".");
    var normalized = cleaned;

    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
      } else {
        normalized = cleaned.replace(/,/g, "");
      }
    } else if (lastComma > -1) {
      var commaFraction = cleaned.length - lastComma - 1;
      if (commaFraction > 0 && commaFraction <= 3) {
        normalized = cleaned.replace(/,/g, ".");
      } else {
        normalized = cleaned.replace(/,/g, "");
      }
    } else if (lastDot > -1) {
      var dotFraction = cleaned.length - lastDot - 1;
      if (dotFraction === 0) {
        normalized = cleaned.replace(/\./g, "");
      } else if (dotFraction > 3) {
        normalized = cleaned.replace(/\./g, "");
      }
    }

    var parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function sanitizeText(value, fallback) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return fallback;
  }

  function sanitizeColor(value, fallback) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return fallback;
  }

  function sanitizeSelect(value, allowedValues, fallback) {
    if (typeof value === "string") {
      var normalized = value.trim().toLowerCase();
      if (allowedValues.indexOf(normalized) >= 0) {
        return normalized;
      }
    }
    return fallback;
  }

  function sanitizeOptionalString(value) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  function sanitizeNullableText(value) {
    if (typeof value === "string" && value.trim()) {
      return cleanMessageSpacing(value.trim());
    }
    return null;
  }

  function extractVariantNumericId(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }

    if (typeof value !== "string") {
      return null;
    }

    var trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    var gidMatch = trimmed.match(/ProductVariant\/(\d+)/i);
    if (gidMatch && gidMatch[1]) {
      return gidMatch[1];
    }

    var numericMatch = trimmed.match(/(\d+)(?!.*\d)/);
    if (numericMatch && numericMatch[1]) {
      return numericMatch[1];
    }

    return null;
  }

  function cartSignature(cart) {
    if (!cart || typeof cart !== "object") {
      return "empty";
    }

    var total = typeof cart.total_price === "number" ? cart.total_price : 0;
    var itemCount = 0;

    if (Array.isArray(cart.items)) {
      for (var i = 0; i < cart.items.length; i += 1) {
        var item = cart.items[i];
        if (item && typeof item.quantity === "number") {
          itemCount += item.quantity;
        } else {
          itemCount += 1;
        }
      }
    }

    return total + ":" + itemCount;
  }

  function cancelVisibilityCountdown() {
    if (state.visibilityTimer) {
      clearTimeout(state.visibilityTimer);
      state.visibilityTimer = null;
    }
  }

  function clearHideAnimationTimer() {
    if (state.visibilityHideAnimationTimer) {
      clearTimeout(state.visibilityHideAnimationTimer);
      state.visibilityHideAnimationTimer = null;
    }
  }

  function hideBarForTimer() {
    if (!state.config || state.config.visibilityMode !== "timed") {
      cancelVisibilityCountdown();
      state.visibilitySuppressed = false;
      return;
    }

    if (state.visibilitySuppressed) {
      return;
    }

    cancelVisibilityCountdown();
    state.visibilitySuppressed = true;

    if (state.bar) {
      state.bar.classList.add("fsb-bar--hidden");
      state.bar.setAttribute("aria-hidden", "true");
      state.bar.style.display = "";
    }

    if (state.host) {
      state.host.style.display = "flex";
    }

    clearHideAnimationTimer();
    state.visibilityHideAnimationTimer = setTimeout(function () {
      if (!state.visibilitySuppressed) {
        return;
      }

      if (state.bar) {
        state.bar.style.display = "none";
      }

      if (state.host) {
        state.host.style.display = "none";
      }

      state.visibilityHideAnimationTimer = null;
    }, VISIBILITY_HIDE_ANIMATION_MS);
  }

  function scheduleVisibilityTimer() {
    cancelVisibilityCountdown();

    if (!state.config || state.config.visibilityMode !== "timed") {
      return;
    }

    if (state.visibilitySuppressed) {
      return;
    }

    var duration = state.config.visibilityDurationSeconds;
    if (!Number.isFinite(duration)) {
      duration = DEFAULT_CONFIG.visibilityDurationSeconds;
    }

    var bounded = Math.min(
      Math.max(Math.round(duration), VISIBILITY_DURATION_MIN),
      VISIBILITY_DURATION_MAX
    );

    state.visibilityTimer = setTimeout(function () {
      hideBarForTimer();
    }, bounded * 1000);
  }

  function cleanMessageSpacing(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value
      .replace(/\s+/g, " ")
      .replace(/\s([,.!?])/g, "$1")
      .trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function finalizeDisplayText(value, amountFormatted) {
    if (!value) {
      return "";
    }

    var working = value.replace(/[()\[\]{}]/g, " ");

    if (amountFormatted) {
      var amountPattern = new RegExp(escapeRegExp(amountFormatted), "g");
      var amountSeen = false;
      working = working.replace(amountPattern, function (match) {
        if (amountSeen) {
          return "";
        }
        amountSeen = true;
        return match;
      });
    }

    working = working.replace(/\s{2,}/g, " ");

    return cleanMessageSpacing(working);
  }

  function normalizeLockedMessage(value) {
    var text = cleanMessageSpacing(
      sanitizeText(value, DEFAULT_CONFIG.lockedMessage)
    );

    if (!text) {
      return DEFAULT_CONFIG.lockedMessage;
    }

    var normalized = text
      .replace(PLACEHOLDER_PATTERN, "{{remaining}}")
      .replace(new RegExp(PLACEHOLDER_SENTINEL, "g"), "{{remaining}}")
      .replace(/\bremaining\s*(?=\{\{)/gi, "");

    normalized = normalized.replace(
      /({{remaining}})(\s*\1)+/gi,
      "{{remaining}}"
    );
    normalized = cleanMessageSpacing(normalized);

    if (normalized.indexOf("{{remaining}}") === -1) {
      normalized = (normalized ? normalized + " {{remaining}}" : "{{remaining}}").trim();
    }

    return normalized;
  }

  function normalizeConfig(raw) {
    var data = raw && typeof raw === "object" ? raw : {};
    var config = Object.assign({}, DEFAULT_CONFIG);

    config.enabled = coerceBoolean(data.enabled, DEFAULT_CONFIG.enabled);
    config.position = sanitizeSelect(
      data.position,
      POSITION_VALUES,
      DEFAULT_CONFIG.position
    );
    config.floatingAlignment = sanitizeSelect(
      data.floatingAlignment,
      FLOATING_ALIGNMENTS,
      DEFAULT_CONFIG.floatingAlignment
    );
    config.colorMode = sanitizeSelect(
      data.colorMode,
      ["solid", "gradient"],
      DEFAULT_CONFIG.colorMode
    );
    config.solidColor = sanitizeColor(data.solidColor, DEFAULT_CONFIG.solidColor);
    config.gradientStart = sanitizeColor(
      data.gradientStart,
      DEFAULT_CONFIG.gradientStart
    );
    config.gradientEnd = sanitizeColor(
      data.gradientEnd,
      DEFAULT_CONFIG.gradientEnd
    );
    config.textColor = sanitizeColor(data.textColor, DEFAULT_CONFIG.textColor);
    config.fontSize = sanitizeSelect(
      data.fontSize,
      ["small", "medium", "large"],
      DEFAULT_CONFIG.fontSize
    );
    config.bold = coerceBoolean(data.bold, DEFAULT_CONFIG.bold);
    config.animateProgress = coerceBoolean(
      data.animateProgress,
      DEFAULT_CONFIG.animateProgress
    );
    var resolvedThreshold = sanitizeNumber(
      data.threshold,
      DEFAULT_CONFIG.threshold
    );
    config.threshold = Math.max(
      Number.isFinite(resolvedThreshold) ? resolvedThreshold : DEFAULT_CONFIG.threshold,
      0
    );
    config.hideWhenUnlocked = coerceBoolean(
      data.hideWhenUnlocked,
      DEFAULT_CONFIG.hideWhenUnlocked
    );
    config.visibilityMode = sanitizeSelect(
      data.visibilityMode,
      ["always", "timed"],
      DEFAULT_CONFIG.visibilityMode
    );
    var resolvedVisibilityDuration = sanitizeNumber(
      data.visibilityDurationSeconds,
      DEFAULT_CONFIG.visibilityDurationSeconds
    );
    if (!Number.isFinite(resolvedVisibilityDuration)) {
      resolvedVisibilityDuration = DEFAULT_CONFIG.visibilityDurationSeconds;
    }
    config.visibilityDurationSeconds = Math.min(
      Math.max(Math.round(resolvedVisibilityDuration), VISIBILITY_DURATION_MIN),
      VISIBILITY_DURATION_MAX
    );
    config.lockedMessage = normalizeLockedMessage(data.lockedMessage);
    config.unlockedMessage = cleanMessageSpacing(
      sanitizeText(
        data.unlockedMessage,
        DEFAULT_CONFIG.unlockedMessage
      )
    );
    config.currencyMode = sanitizeSelect(
      data.currencyMode,
      ["auto", "manual"],
      DEFAULT_CONFIG.currencyMode
    );

    if (typeof data.manualCurrency === "string" && data.manualCurrency.trim()) {
      config.manualCurrency = data.manualCurrency.trim().toUpperCase();
    } else {
      config.manualCurrency = DEFAULT_CONFIG.manualCurrency;
    }

    if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, "autoAdd")) {
      config.autoAdd = coerceBoolean(
        data.autoAdd,
        DEFAULT_CONFIG.autoAdd
      );
      config.autoRemove = coerceBoolean(
        data.autoRemove,
        DEFAULT_CONFIG.autoRemove
      );

      var normalizedProductId = sanitizeOptionalString(data.giftProductId);
      config.giftProductId = normalizedProductId;

      var normalizedProductTitle = sanitizeNullableText(data.giftProductTitle);
      config.giftProductTitle = normalizedProductTitle;

      var normalizedVariantId = sanitizeOptionalString(data.giftVariantId);
      config.giftVariantId = normalizedVariantId;
      config.giftVariantNumericId = extractVariantNumericId(normalizedVariantId);

      var normalizedVariantTitle = sanitizeNullableText(data.giftVariantTitle);
      config.giftVariantTitle = normalizedVariantTitle;

      var normalizedImageUrl = sanitizeOptionalString(data.giftProductImageUrl);
      config.giftProductImageUrl = normalizedImageUrl;
    }

    return config;
  }

  function repositionRootForAnchored(position) {
    if (!state.root || typeof document === "undefined") {
      return;
    }

    var body = document.body;
    if (!body) {
      return;
    }

    if (position === "top") {
      if (state.root.parentElement !== body || body.firstElementChild !== state.root) {
        body.insertAdjacentElement("afterbegin", state.root);
      }
      state.root.classList.add("fsb-root--anchored-top");
      state.root.classList.remove("fsb-root--anchored-bottom");
    } else if (position === "bottom") {
      if (state.root.parentElement !== body || body.lastElementChild !== state.root) {
        body.insertAdjacentElement("beforeend", state.root);
      }
      state.root.classList.add("fsb-root--anchored-bottom");
      state.root.classList.remove("fsb-root--anchored-top");
    }
  }

  function restoreRootToOriginalPosition() {
    if (!state.root) {
      return;
    }

    var placeholder = state.originalPlaceholder;
    var parent = state.originalParent;

    if (!parent) {
      return;
    }

    if (!placeholder) {
      if (state.root.parentNode !== parent) {
        try {
          parent.appendChild(state.root);
        } catch (_error) {
          return;
        }
      }
      state.root.classList.remove("fsb-root--anchored-top", "fsb-root--anchored-bottom");
      return;
    }

    var placeholderParent = placeholder.parentNode;
    if (!placeholderParent && parent.insertBefore) {
      parent.insertBefore(placeholder, null);
    }

    var effectiveParent = placeholder.parentNode || parent;

    if (state.root.parentNode !== effectiveParent || state.root.nextSibling !== placeholder) {
      try {
        effectiveParent.insertBefore(state.root, placeholder);
      } catch (_error) {
        try {
          parent.appendChild(state.root);
        } catch (_ignored) {
          return;
        }
      }
    }

    state.root.classList.remove("fsb-root--anchored-top", "fsb-root--anchored-bottom");
  }

  function ensureStructure(root) {
    if (state.host && state.bar && state.text) {
      return;
    }

    root.innerHTML = "";

    var host = document.createElement("div");
    host.className = "fsb-bar-host";
  host.setAttribute("data-fsb-bundle", state.bundleType);

    var bar = document.createElement("div");
    bar.className = "fsb-bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
  bar.setAttribute("data-fsb-bundle", state.bundleType);

    var text = document.createElement("span");
    text.className = "fsb-bar__text";

    bar.appendChild(text);
    host.appendChild(bar);
    root.appendChild(host);

    state.host = host;
    state.bar = bar;
    state.text = text;
  }

  function resolveLocale() {
    if (state.locale) {
      return state.locale;
    }
    if (state.root) {
      var attr = state.root.getAttribute(LOCALE_ATTR);
      if (attr && attr.trim()) {
        state.locale = attr.trim();
        return state.locale;
      }
    }
    state.locale = navigator.language || "en";
    return state.locale;
  }

  function resolveCurrency(cart) {
    if (state.config.currencyMode === "manual" && state.config.manualCurrency) {
      return state.config.manualCurrency;
    }

    if (cart && typeof cart.currency === "string" && cart.currency.trim()) {
      return cart.currency.trim().toUpperCase();
    }

    if (state.shopCurrency) {
      return state.shopCurrency;
    }

    if (state.root) {
      var attr = state.root.getAttribute(SHOP_CURRENCY_ATTR);
      if (attr && attr.trim()) {
        state.shopCurrency = attr.trim().toUpperCase();
        return state.shopCurrency;
      }
    }

    return "USD";
  }

  function formatCurrency(amount, currency, locale) {
    var numeric = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(locale || undefined, {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch (_error) {
      return (currency || "USD") + " " + numeric.toFixed(2);
    }
  }

  function computeMessage(config, cart, currency, locale) {
    var threshold = Math.max(Number(config.threshold) || 0, 0);
    var cartTotal = 0;

    if (cart && typeof cart.total_price === "number") {
      cartTotal = cart.total_price / 100;
    }

    var amountRemaining = Math.max(threshold - cartTotal, 0);
    var unlocked = amountRemaining <= 0.0001;
    var amountFormatted = formatCurrency(amountRemaining, currency, locale);
    var thresholdFormatted = formatCurrency(threshold, currency, locale);

    var template = "";

    if (unlocked) {
      if (config.hideWhenUnlocked) {
        template = "";
      } else {
        template = config.unlockedMessage || DEFAULT_CONFIG.unlockedMessage;
      }
    } else {
      template = config.lockedMessage || DEFAULT_CONFIG.lockedMessage;
    }

   var templWithSentinels = template
  ? template
      // Normalize all possible placeholder styles
      .replace(/\[\s*(amount|remaining)\s*\]/gi, PLACEHOLDER_SENTINEL)
      .replace(/{{\s*(amount|remaining)\s*}}/gi, PLACEHOLDER_SENTINEL)
      .replace(/\b(amount|remaining)\b/gi, PLACEHOLDER_SENTINEL) // handle bare words
      .replace(/\[\s*threshold\s*\]/gi, THRESHOLD_PLACEHOLDER_SENTINEL)
      .replace(/{{\s*threshold\s*}}/gi, THRESHOLD_PLACEHOLDER_SENTINEL)
  : "";

// After formatting, remove extra placeholders and stray text
templWithSentinels = templWithSentinels
  .replace(/\(\s*€?.*?\)/g, "") // removes parentheses like (€75.05)
  .replace(/\s{2,}/g, " ") // collapse double spaces
  .trim();

    if (templWithSentinels) {
      templWithSentinels = templWithSentinels
        .replace(/\(\s*__FSB_REMAINING__\s*\)/gi, PLACEHOLDER_SENTINEL)
        .replace(/\[\s*__FSB_REMAINING__\s*\]/gi, PLACEHOLDER_SENTINEL)
        .replace(/\(\s*__FSB_THRESHOLD__\s*\)/gi, THRESHOLD_PLACEHOLDER_SENTINEL)
        .replace(/\[\s*__FSB_THRESHOLD__\s*\]/gi, THRESHOLD_PLACEHOLDER_SENTINEL);
    }

    var output = templWithSentinels
      ? templWithSentinels
          .replace(new RegExp(THRESHOLD_PLACEHOLDER_SENTINEL, "g"), thresholdFormatted)
          .replace(new RegExp(PLACEHOLDER_SENTINEL, "g"), amountFormatted)
      : "";

    var finalOutput = cleanMessageSpacing(output)
      .replace(/\bremaining\b(?=[\s\u00A0]*[,.;:!?]*[\s\u00A0]*(?:[$£€¥]|USD|CAD|AUD|EUR|GBP|SEK|NOK|DKK|CHF|JPY|CNY|\d))/gi, "")
      .replace(/\b(?:undefined|null)\b/gi, "");

    finalOutput = finalizeDisplayText(finalOutput, amountFormatted);

    return {
      text: finalOutput,
      unlocked: unlocked,
      amountRemaining: amountRemaining,
      hasMessage: Boolean(finalOutput),
    };
  }

  function normalizeCartVariantId(candidate) {
    if (candidate === null || candidate === void 0) {
      return null;
    }

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(Math.trunc(candidate));
    }

    if (typeof candidate === "string") {
      return extractVariantNumericId(candidate);
    }

    return null;
  }

  function isTruthyValue(value) {
    if (value === true) {
      return true;
    }
    if (typeof value === "string") {
      var normalized = value.trim().toLowerCase();
      return normalized === "true" || normalized === "1" || normalized === "yes";
    }
    if (typeof value === "number") {
      return value === 1;
    }
    return false;
  }

  function findGiftLine(cart, variantId) {
    if (!cart || !Array.isArray(cart.items) || !variantId) {
      return null;
    }

    var normalizedVariantId = String(variantId);
    var fallbackMatch = null;

    for (var index = 0; index < cart.items.length; index += 1) {
      var item = cart.items[index];
      if (!item) {
        continue;
      }

      var candidate = normalizeCartVariantId(
        item.id !== undefined && item.id !== null
          ? item.id
          : item.variant_id !== undefined && item.variant_id !== null
            ? item.variant_id
            : item.key || item.handle || null
      );

      if (!candidate || candidate !== normalizedVariantId) {
        continue;
      }

      var properties = item.properties && typeof item.properties === "object"
        ? item.properties
        : null;
      var isGiftLine = properties && isTruthyValue(properties[GIFT_PROPERTY_NAME]);

      if (isGiftLine) {
        return {
          item: item,
          index: index + 1,
          isGift: true,
        };
      }

      if (!fallbackMatch) {
        fallbackMatch = {
          item: item,
          index: index + 1,
          isGift: false,
        };
      }
    }

    return fallbackMatch;
  }

  function addGiftItemToCart(variantId) {
    var numericVariant = Number(variantId);
    var payload = {
      items: [
        {
          id: Number.isFinite(numericVariant) ? numericVariant : variantId,
          quantity: 1,
          properties: {},
        },
      ],
    };

    payload.items[0].properties[GIFT_PROPERTY_NAME] = "true";

    return fetch(CART_ADD_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to add free gift to cart");
      }
      return response.json().catch(function () {
        return null;
      });
    });
  }

  function removeGiftItemFromCart(lineIndex) {
    if (!lineIndex) {
      return Promise.resolve(null);
    }

    return fetch(CART_CHANGE_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ line: lineIndex, quantity: 0 }),
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to remove free gift from cart");
      }
      return response.json().catch(function () {
        return null;
      });
    });
  }

  function handleGiftBundleAutomation(message, signature) {
    if (state.bundleType !== "free-gift") {
      state.giftPendingConfirmation = false;
      state.giftLastAttemptSignature = null;
      state.giftLastAddedVariantId = null;
      return;
    }

    if (!state.config || !state.config.enabled) {
      state.giftPendingConfirmation = false;
      state.giftLastAttemptSignature = null;
      state.giftLastAddedVariantId = null;
      return;
    }

    var config = state.config;

    if (!config.autoAdd) {
      if (!message.unlocked && config.autoRemove) {
        var variantIdForRemoval = config.giftVariantNumericId || extractVariantNumericId(config.giftVariantId);
        if (variantIdForRemoval && !state.giftRemoveInFlight) {
          var existingLine = findGiftLine(state.cart, variantIdForRemoval);
          if (
            existingLine &&
            (existingLine.isGift || state.giftLastAddedVariantId === variantIdForRemoval)
          ) {
            state.giftRemoveInFlight = true;
            removeGiftItemFromCart(existingLine.index)
              .then(function () {
                state.giftLastAddedVariantId = null;
                scheduleCartRefresh(120);
              })
              .catch(function (error) {
                console.error("Free gift auto-remove failed", error);
              })
              .finally(function () {
                state.giftRemoveInFlight = false;
              });
          }
        }
      }

      state.giftPendingConfirmation = false;
      state.giftLastAttemptSignature = null;
      state.giftLastAddedVariantId = null;
      return;
    }

    var variantId = config.giftVariantNumericId;
    if (!variantId && config.giftVariantId) {
      variantId = extractVariantNumericId(config.giftVariantId);
      config.giftVariantNumericId = variantId;
    }

    if (!variantId) {
      state.giftPendingConfirmation = false;
      state.giftLastAttemptSignature = null;
      state.giftLastAddedVariantId = null;
      return;
    }

    var giftLine = findGiftLine(state.cart, variantId);

    if (!message.unlocked) {
      state.giftPendingConfirmation = false;
      state.giftLastAttemptSignature = null;
      if (
        config.autoRemove &&
        giftLine &&
        (giftLine.isGift || state.giftLastAddedVariantId === variantId) &&
        !state.giftRemoveInFlight
      ) {
        state.giftRemoveInFlight = true;
        removeGiftItemFromCart(giftLine.index)
          .then(function () {
            state.giftLastAddedVariantId = null;
            scheduleCartRefresh(120);
          })
          .catch(function (error) {
            console.error("Free gift auto-remove failed", error);
          })
          .finally(function () {
            state.giftRemoveInFlight = false;
          });
      } else {
        state.giftLastAddedVariantId = null;
      }
      return;
    }

    if (giftLine) {
      if (giftLine.isGift || state.giftLastAddedVariantId === variantId) {
        state.giftPendingConfirmation = false;
        state.giftLastAttemptSignature = null;
        state.giftLastAddedVariantId = variantId;
        return;
      }

      state.giftPendingConfirmation = false;
      state.giftLastAttemptSignature = null;
      state.giftLastAddedVariantId = null;
      return;
    }

    if (state.giftAddInFlight || state.giftRemoveInFlight || state.giftPendingConfirmation) {
      return;
    }

    if (state.giftLastAttemptSignature && state.giftLastAttemptSignature === signature) {
      return;
    }

    state.giftAddInFlight = true;
    state.giftLastAttemptSignature = signature;

    addGiftItemToCart(variantId)
      .then(function () {
        state.giftPendingConfirmation = true;
        state.giftLastAddedVariantId = variantId;
        scheduleCartRefresh(120);
      })
      .catch(function (error) {
        console.error("Free gift auto-add failed", error);
        state.giftPendingConfirmation = false;
        state.giftLastAttemptSignature = signature;
        state.giftLastAddedVariantId = null;
      })
      .finally(function () {
        state.giftAddInFlight = false;
      });
  }

  function applyLayout(config) {
    if (!state.host || !state.bar) {
      return;
    }

    var host = state.host;
    var bar = state.bar;

    host.className = "fsb-bar-host";
    bar.className = "fsb-bar";
    host.style.display = "";
    bar.style.width = "";
    bar.style.maxWidth = "";
    bar.style.borderRadius = "";

    var requestedPosition = typeof config.position === "string"
      ? config.position.trim().toLowerCase()
      : DEFAULT_CONFIG.position;

    if (typeof requestedPosition !== "string" || !requestedPosition) {
      requestedPosition = DEFAULT_CONFIG.position || "top";
    }

    if (POSITION_VALUES.indexOf(requestedPosition) === -1) {
      requestedPosition = DEFAULT_CONFIG.position || "top";
    }

    var isGiftBundle = state.bundleType === "free-gift";

    if (!config.enabled) {
      host.style.display = "none";
      restoreRootToOriginalPosition();
      if (state.root) {
        state.root.classList.remove("fsb-root--anchored-top", "fsb-root--anchored-bottom");
      }
      return;
    }

    host.style.display = "flex";

    if (requestedPosition === "floating") {
      var alignment = config.floatingAlignment || (isGiftBundle ? "bottom-center" : DEFAULT_CONFIG.floatingAlignment);
      restoreRootToOriginalPosition();
      host.classList.add("fsb-bar-host--floating");
      host.classList.add("fsb-bar-host--floating-" + alignment);
      bar.classList.add("fsb-bar--floating");
      bar.style.maxWidth = "min(960px, 100%)";
      bar.style.borderRadius = "999px";
      if (state.root) {
        state.root.classList.remove("fsb-root--anchored-top", "fsb-root--anchored-bottom");
      }
    } else if (requestedPosition === "inline") {
      restoreRootToOriginalPosition();
      host.classList.add("fsb-bar-host--inline");
      host.classList.add("fsb-bar-host--align-center");
      bar.classList.add("fsb-bar--inline");
      bar.style.width = "100%";
      bar.style.maxWidth = "100%";
      bar.style.borderRadius = "16px";
      if (state.root) {
        state.root.classList.remove("fsb-root--anchored-top", "fsb-root--anchored-bottom");
      }
    } else {
      var anchoredPosition = requestedPosition === "bottom" ? "bottom" : "top";
      host.classList.add("fsb-bar-host--anchored");
      host.classList.add("fsb-bar-host--anchored-" + anchoredPosition);
      host.classList.add("fsb-bar-host--align-center");
      bar.classList.add("fsb-bar--anchored");
      bar.style.width = "100%";
      bar.style.maxWidth = "100%";
      bar.style.borderRadius = "0";
      repositionRootForAnchored(anchoredPosition);
    }

    var fontSize = FONT_SIZE_MAP[config.fontSize] || FONT_SIZE_MAP.medium;
    bar.style.fontSize = fontSize;
    bar.style.fontWeight = config.bold ? "700" : "500";

    bar.style.color = config.textColor || DEFAULT_CONFIG.textColor;

    if (config.colorMode === "gradient") {
      var gradient = "linear-gradient(135deg, " +
        (config.gradientStart || DEFAULT_CONFIG.gradientStart) +
        ", " +
        (config.gradientEnd || DEFAULT_CONFIG.gradientEnd) +
        ")";
      bar.style.background = gradient;
      if (config.animateProgress) {
        bar.classList.add("fsb-bar--animate");
      } else {
        bar.classList.remove("fsb-bar--animate");
      }
    } else {
      bar.style.background = config.solidColor || DEFAULT_CONFIG.solidColor;
      bar.classList.remove("fsb-bar--animate");
    }
  }

  function render() {
    if (!state.root) {
      return;
    }

    ensureStructure(state.root);
    if (!state.configReady) {
      cancelVisibilityCountdown();
      clearHideAnimationTimer();
      state.visibilitySuppressed = false;
      if (state.host) {
        state.host.style.display = "none";
      }
      return;
    }

    applyLayout(state.config);

    if (!state.config.enabled) {
      cancelVisibilityCountdown();
      clearHideAnimationTimer();
      state.visibilitySuppressed = false;
      if (state.host) {
        state.host.style.display = "none";
      }
      return;
    }

    var locale = resolveLocale();
    var currency = resolveCurrency(state.cart);
    var message = computeMessage(state.config, state.cart, currency, locale);

    if (state.text) {
      state.text.textContent = message.text || "";
    }

    var shouldHideBar = !message.hasMessage;
    var timedMode = state.config.visibilityMode === "timed";

    if (!timedMode && state.visibilitySuppressed) {
      state.visibilitySuppressed = false;
      clearHideAnimationTimer();
    }

    var suppressedByTimer = timedMode && state.visibilitySuppressed;

    if (state.host) {
      if (shouldHideBar) {
        state.host.style.display = "none";
      } else if (!suppressedByTimer) {
        state.host.style.display = "flex";
      }
    }

    if (state.bar) {
      if (shouldHideBar) {
        state.visibilitySuppressed = false;
        cancelVisibilityCountdown();
        clearHideAnimationTimer();
        state.bar.classList.add("fsb-bar--hidden");
        state.bar.style.display = "none";
        state.bar.setAttribute("aria-hidden", "true");
      } else if (suppressedByTimer) {
        cancelVisibilityCountdown();
        state.bar.classList.add("fsb-bar--hidden");
        state.bar.setAttribute("aria-hidden", "true");
      } else {
        state.visibilitySuppressed = false;
        clearHideAnimationTimer();
        state.bar.classList.remove("fsb-bar--hidden");
        state.bar.style.display = "";
        state.bar.setAttribute(
          "aria-hidden",
          message.hasMessage ? "false" : "true"
        );

        if (timedMode) {
          scheduleVisibilityTimer();
        } else {
          cancelVisibilityCountdown();
        }
      }
      state.bar.dataset.state = message.unlocked ? "unlocked" : "locked";
    }

    var signature = cartSignature(state.cart);
    state.lastCartSignature = signature;
    handleGiftBundleAutomation(message, signature);
  }

  function fetchCart() {
    return fetch(CART_ENDPOINT, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Failed to load cart");
        }
        return response.json();
      })
      .catch(function () {
        return null;
      });
  }

  function cartMutationUrlMatches(candidate) {
    if (!candidate) {
      return false;
    }

    var value = "";

    if (typeof candidate === "string") {
      value = candidate;
    } else if (typeof candidate === "object") {
      if (typeof candidate.url === "string") {
        value = candidate.url;
      } else if (candidate.href) {
        value = candidate.href;
      }
    }

    if (!value) {
      return false;
    }

    try {
      var parsed = new URL(value, window.location.origin);
      return CART_MUTATION_PATH_PATTERN.test(parsed.pathname);
    } catch (_error) {
      try {
        return CART_MUTATION_PATH_PATTERN.test(String(value));
      } catch (_ignore) {
        return false;
      }
    }
  }

  function scheduleCartRefresh(delay) {
    if (delay === void 0) {
      delay = 50;
    }

    if (state.scheduledRefresh) {
      clearTimeout(state.scheduledRefresh);
    }

    state.scheduledRefresh = setTimeout(function () {
      state.scheduledRefresh = null;
      refreshCart();
    }, Math.max(delay, 0));
  }

  function patchFetchForCartMutations() {
    if (state.fetchPatched || typeof window === "undefined") {
      return;
    }

    if (typeof window.fetch !== "function") {
      state.fetchPatched = true;
      return;
    }

    var originalFetch = window.fetch;
    window.fetch = function () {
      var args = Array.prototype.slice.call(arguments);
      var requestInfo = args[0];
      var tracked = cartMutationUrlMatches(requestInfo);

      var promise = originalFetch.apply(this, args);

      if (tracked) {
        return promise.then(
          function (response) {
            scheduleCartRefresh(75);
            return response;
          },
          function (error) {
            scheduleCartRefresh(75);
            throw error;
          }
        );
      }

      return promise;
    };

    state.fetchPatched = true;
  }

  function patchXHRForCartMutations() {
    if (state.xhrPatched || typeof window === "undefined") {
      return;
    }

    if (typeof XMLHttpRequest === "undefined") {
      state.xhrPatched = true;
      return;
    }

    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__fsbCartMutationUrl = typeof url === "string" ? url : (url ? String(url) : "");
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      if (cartMutationUrlMatches(this.__fsbCartMutationUrl)) {
        this.addEventListener("loadend", function () {
          scheduleCartRefresh(75);
        });
      }
      return originalSend.apply(this, arguments);
    };

    state.xhrPatched = true;
  }

  function bindCartMutationForms() {
    if (state.formListenerBound || typeof document === "undefined") {
      return;
    }

    var handleSubmit = function (event) {
      var target = event.target;
      if (!target || typeof target.getAttribute !== "function") {
        return;
      }

      var action = target.getAttribute("action");
      if (cartMutationUrlMatches(action)) {
        scheduleCartRefresh(150);
      }
    };

    document.addEventListener("submit", handleSubmit, true);
    state.formListenerBound = true;
  }

  function attachCartIndicatorObserver(retryCount) {
    if (typeof document === "undefined") {
      return;
    }

    if (state.cartIndicatorObserver) {
      try {
        state.cartIndicatorObserver.disconnect();
      } catch (_error) {
        // no-op
      }
      state.cartIndicatorObserver = null;
    }

    var nodes = [];
    for (var i = 0; i < CART_INDICATOR_SELECTOR_CANDIDATES.length; i += 1) {
      var selector = CART_INDICATOR_SELECTOR_CANDIDATES[i];
      var found = document.querySelectorAll(selector);
      if (found && found.length) {
        for (var j = 0; j < found.length; j += 1) {
          if (nodes.indexOf(found[j]) === -1) {
            nodes.push(found[j]);
          }
        }
      }
    }

    if (!nodes.length) {
      var attempts = typeof retryCount === "number" ? retryCount : 0;
      if (attempts < 5) {
        if (state.cartIndicatorObserverTimer) {
          clearTimeout(state.cartIndicatorObserverTimer);
        }
        state.cartIndicatorObserverTimer = setTimeout(function () {
          state.cartIndicatorObserverTimer = null;
          attachCartIndicatorObserver(attempts + 1);
        }, 4000);
      }
      return;
    }

    var observer = new MutationObserver(function () {
      scheduleCartRefresh(0);
    });

    for (var n = 0; n < nodes.length; n += 1) {
      observer.observe(nodes[n], {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    state.cartIndicatorObserver = observer;
    if (state.cartIndicatorObserverTimer) {
      clearTimeout(state.cartIndicatorObserverTimer);
      state.cartIndicatorObserverTimer = null;
    }
  }

  function refreshCart() {
    if (state.cartRequestInFlight) {
      state.pendingCartRefresh = true;
      return;
    }

    var previousSignature = state.lastCartSignature;
    state.cartRequestInFlight = true;

    fetchCart()
      .then(function (cart) {
        var nextSignature = cartSignature(cart);
        if (nextSignature !== previousSignature) {
          state.visibilitySuppressed = false;
          cancelVisibilityCountdown();
          clearHideAnimationTimer();
        }

        state.cart = cart;
        state.lastCartSignature = nextSignature;
        render();
      })
      .finally(function () {
        state.cartRequestInFlight = false;
        if (state.pendingCartRefresh) {
          state.pendingCartRefresh = false;
          scheduleCartRefresh(75);
        }
      });
  }

  function subscribeToCartEvents() {
    if (state.cartEventsBound) {
      return;
    }

    var handler = function () {
      scheduleCartRefresh(0);
    };

    state.cartEventHandler = handler;

    for (var i = 0; i < CART_REFRESH_EVENTS.length; i += 1) {
      document.addEventListener(CART_REFRESH_EVENTS[i], handler);
    }

    state.cartEventsBound = true;
  }

  function startCartPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
    }

    state.pollTimer = setInterval(function () {
      scheduleCartRefresh(0);
    }, CART_POLL_INTERVAL);
  }

  function setupCartMonitoring() {
    if (state.cartMonitoringInitialized) {
      attachCartIndicatorObserver();
      return;
    }

    state.cartMonitoringInitialized = true;
    subscribeToCartEvents();
    startCartPolling();
    patchFetchForCartMutations();
    patchXHRForCartMutations();
    bindCartMutationForms();
    attachCartIndicatorObserver();
  }

  function buildSettingsUrl() {
    if (!state.root) {
      return null;
    }

    var endpoint = state.settingsEndpoint || state.root.getAttribute(SETTINGS_ENDPOINT_ATTR);
    if (!endpoint) {
      return null;
    }

    try {
      var url = new URL(endpoint, window.location.origin);
      if (!url.searchParams.has("shop")) {
        var shop = state.shopDomain || state.root.getAttribute(SHOP_DOMAIN_ATTR);
        if (shop) {
          url.searchParams.set("shop", shop);
        }
      }
      var bundleKey = state.bundleType || BUNDLE_TYPE;
      if (bundleKey) {
        url.searchParams.set("bundle", bundleKey);
      }
      return url.toString();
    } catch (_error) {
      return null;
    }
  }

  function loadSettings() {
    var url = buildSettingsUrl();
    if (!url) {
      state.config = normalizeConfig(null);
      state.configReady = true;
      state.visibilitySuppressed = false;
      cancelVisibilityCountdown();
      clearHideAnimationTimer();
      render();
      return Promise.resolve(false);
    }

    state.loadingSettings = true;

    return fetch(url, {
      credentials: "include",
      cache: "no-store",
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Failed to load settings");
        }
        return response.json();
      })
      .then(function (payload) {
        var incoming = payload && typeof payload === "object" ? payload.settings || payload : null;
        if (payload && typeof payload.shopCurrency === "string" && payload.shopCurrency.trim()) {
          state.shopCurrency = payload.shopCurrency.trim().toUpperCase();
        }
        state.config = normalizeConfig(incoming);
        state.visibilitySuppressed = false;
        cancelVisibilityCountdown();
        clearHideAnimationTimer();
        state.configReady = true;
        render();
        return true;
      })
      .catch(function () {
        state.config = normalizeConfig(null);
        state.visibilitySuppressed = false;
        cancelVisibilityCountdown();
        clearHideAnimationTimer();
        state.configReady = true;
        render();
        return false;
      })
      .finally(function () {
        state.loadingSettings = false;
        attachCartIndicatorObserver();
      });
  }

  function subscribeToThemeEditorEvents() {
    if (typeof window === "undefined") {
      return;
    }

    if (state.themeEventsBound) {
      return;
    }

    if (!document.documentElement.hasAttribute("data-shopify-design-mode")) {
      return;
    }

    var handler = function () {
      loadSettings();
    };

    THEME_EDITOR_EVENTS.forEach(function (eventName) {
      document.addEventListener(eventName, handler);
    });

    state.themeEventsBound = true;
  }

  function initialize() {
    if (state.root) {
      return;
    }

    var root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    if (!root.classList.contains("fsb-root")) {
      root.classList.add("fsb-root");
    }

    state.root = root;
    if (!state.originalParent) {
      var parentNode = root.parentNode;
      if (parentNode && parentNode.insertBefore) {
        state.originalParent = parentNode;
        var placeholder = document.createComment("fsb-root-placeholder");
        state.originalPlaceholder = placeholder;
        try {
          parentNode.insertBefore(placeholder, root.nextSibling);
        } catch (_error) {
          try {
            if (parentNode.appendChild) {
              parentNode.appendChild(placeholder);
            } else {
              state.originalPlaceholder = null;
            }
          } catch (_ignored) {
            state.originalPlaceholder = null;
          }
        }
      }
    }
    state.settingsEndpoint = root.getAttribute(SETTINGS_ENDPOINT_ATTR);
    state.shopDomain = root.getAttribute(SHOP_DOMAIN_ATTR);
    state.shopCurrency = root.getAttribute(SHOP_CURRENCY_ATTR);
    state.locale = root.getAttribute(LOCALE_ATTR);

    try {
      root.setAttribute("data-fsb-bundle", state.bundleType);
    } catch (_error) {
      /* no-op */
    }

    ensureStructure(root);
    render();

    setupCartMonitoring();
    subscribeToThemeEditorEvents();
    refreshCart();

    loadSettings().finally(function () {
      scheduleCartRefresh(0);
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    initialize();
  } else {
    document.addEventListener("DOMContentLoaded", initialize);
  }
})();
