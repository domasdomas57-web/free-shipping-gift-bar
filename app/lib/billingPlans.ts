export type PlanKey = "shipping" | "bundle";

export interface PlanDefinition {
  key: PlanKey;
  displayName: string;
  subtitle: string;
  description: string;
  price: number;
  currencyCode: "EUR";
  features: readonly PlanFeature[];
  mostPopular?: boolean;
}

export type PlanFeature = "shipping" | "gift";

export interface StoredPlanSnapshot {
  plan: PlanKey;
  activeFeatures: PlanFeature[];
}

export const PLAN_TRIAL_DAYS = 7;

export const BILLING_PLANS: Record<PlanKey, PlanDefinition> = {
  shipping: {
    key: "shipping",
    displayName: "Shipping Plan",
    subtitle: "Includes Free Shipping Bar",
    description: "Unlock the Free Shipping Bar to boost average order value with clear progress messaging.",
    price: 7.99,
    currencyCode: "EUR",
    features: ["shipping"],
  },
  bundle: {
    key: "bundle",
    displayName: "Full Bundle Plan",
    subtitle: "Includes Shipping + Gift Bundle",
    description: "Everything in Shipping plus automated Free Gift bundles to delight shoppers at checkout.",
    price: 15.99,
    currencyCode: "EUR",
    features: ["shipping", "gift"],
    mostPopular: true,
  },
};

export function getPlanByKey(key: string | null | undefined): PlanDefinition | null {
  if (!key) {
    return null;
  }
  const normalized = key.trim().toLowerCase();
  if (normalized === "shipping") {
    return BILLING_PLANS.shipping;
  }
  if (normalized === "bundle") {
    return BILLING_PLANS.bundle;
  }
  return null;
}

export function getPlanKeyFromSubscriptionName(name: string | null | undefined): PlanKey | null {
  if (!name) {
    return null;
  }
  const normalized = name.toLowerCase();
  if (normalized.includes(BILLING_PLANS.bundle.displayName.toLowerCase())) {
    return "bundle";
  }
  if (normalized.includes(BILLING_PLANS.shipping.displayName.toLowerCase())) {
    return "shipping";
  }
  return null;
}

export function resolvePlanFromBilling(
  subscriptionName: string | null | undefined,
  amount: number | null | undefined,
  currencyCode: string | null | undefined
): PlanDefinition | null {
  const nameMatch = getPlanKeyFromSubscriptionName(subscriptionName);
  if (nameMatch) {
    return BILLING_PLANS[nameMatch];
  }

  if (typeof amount === "number" && Number.isFinite(amount) && currencyCode) {
    const normalizedCurrency = currencyCode.toUpperCase();
    const candidate = Object.values(BILLING_PLANS).find(
      (plan) =>
        plan.currencyCode === normalizedCurrency &&
        Math.abs(plan.price - amount) < 0.01
    );
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function defaultFeaturesForPlan(plan: PlanKey | null | undefined): PlanFeature[] {
  const planDef = getPlanByKey(plan ?? undefined);
  return planDef ? [...planDef.features] : [];
}
