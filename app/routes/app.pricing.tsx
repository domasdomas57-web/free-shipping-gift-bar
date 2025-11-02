import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useCallback, useMemo, useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Frame,
  InlineStack,
  Layout,
  Page,
  Text,
  Toast,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  BILLING_PLANS,
  PLAN_TRIAL_DAYS,
  type PlanDefinition,
  type PlanFeature,
  type PlanKey,
} from "../lib/billingPlans";

interface PricingLoaderData {
  currentPlan: PlanKey | null;
  subscriptionStatus: string;
  activeFeatures: PlanFeature[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopSettingsClient = (prisma as any).shopSettings;
  let currentPlan: PlanKey | null = null;
  let subscriptionStatus = "inactive";
  let activeFeatures: PlanFeature[] = [];

  if (shopSettingsClient) {
    const record = await shopSettingsClient.findUnique({
      where: { shop: session.shop },
    });

    if (record) {
      const planKey = typeof record.plan === "string" ? record.plan : null;
      if (planKey && (planKey === "shipping" || planKey === "bundle")) {
        currentPlan = planKey;
      }
      subscriptionStatus = typeof record.subscriptionStatus === "string"
        ? record.subscriptionStatus
        : "inactive";
      if (Array.isArray(record.activeFeatures)) {
        activeFeatures = record.activeFeatures.filter((feature: unknown): feature is PlanFeature =>
          feature === "shipping" || feature === "gift"
        );
      }
    }
  }

  return json<PricingLoaderData>({ currentPlan, subscriptionStatus, activeFeatures });
};

function planCards(): PlanDefinition[] {
  return [BILLING_PLANS.shipping, BILLING_PLANS.bundle];
}

const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  shipping: "Free Shipping Bar",
  gift: "Free Gift Bundle",
};

export default function PricingPage() {
  const { currentPlan, subscriptionStatus, activeFeatures } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [toastState, setToastState] = useState<{ active: boolean; content: string; error?: boolean }>(
    { active: false, content: "", error: false }
  );

  const handleToastDismiss = useCallback(() => {
    setToastState({ active: false, content: "", error: false });
  }, []);

  const handleSelectPlan = useCallback(
    async (planKey: PlanKey) => {
      setLoadingPlan(planKey);
      setToastState({ active: false, content: "", error: false });

      try {
        const response = await fetch("/billing/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey }),
        });

        const payload = await response.json();

        if (payload?.success && typeof payload.confirmationUrl === "string") {
          window.location.href = payload.confirmationUrl;
          return;
        }

        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn’t start the subscription. Please try again.";

        setToastState({ active: true, content: message, error: true });
      } catch (error) {
        console.error("Failed to create subscription", error);
        setToastState({
          active: true,
          content: "Network error. Check your connection and retry.",
          error: true,
        });
      } finally {
        setLoadingPlan(null);
      }
    },
    []
  );

  const toastMarkup = toastState.active ? (
    <Toast content={toastState.content} error={toastState.error} onDismiss={handleToastDismiss} />
  ) : null;

  const cards = useMemo(() => planCards(), []);

  return (
    <Frame>
      {toastMarkup}
      <Box background="bg-surface-secondary" paddingBlock="600" minHeight="100vh">
        <Page>
          <TitleBar title="Pricing" />
          <BlockStack gap="400" align="center">
            <BlockStack gap="100" align="center">
              <Text as="h1" variant="heading2xl">
                Choose your plan
              </Text>
              <Text as="p" tone="subdued">
                Start a {PLAN_TRIAL_DAYS}-day free trial. You can upgrade or cancel anytime.
              </Text>
            </BlockStack>

            {subscriptionStatus !== "ACTIVE" && currentPlan ? (
              <Badge tone="attention">{`Subscription status: ${subscriptionStatus}`}</Badge>
            ) : null}

            <Box width="100%" maxWidth="880px">
              <Layout>
                <Layout.Section>
                  <InlineStack gap="400" wrap align="center">
                    {cards.map((plan) => {
                      const isCurrentPlan = currentPlan === plan.key && subscriptionStatus === "ACTIVE";
                      const isLoading = loadingPlan === plan.key;
                      const isUpgradeTarget = plan.key === "bundle" && currentPlan === "shipping";

                      const buttonLabel = isCurrentPlan
                        ? "Current plan"
                        : isUpgradeTarget
                          ? "Upgrade – start 7-day free trial"
                          : "Start 7-day free trial";

                      return (
                        <Card key={plan.key}>
                          <div
                            style={{
                              padding: "32px",
                              width: "340px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "24px",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                              {plan.mostPopular ? (
                                <div
                                  style={{
                                    alignSelf: "flex-start",
                                    padding: "4px 14px",
                                    borderRadius: "999px",
                                    border: "1px solid #008060",
                                    boxShadow: "0 0 0 1px rgba(0,128,96,0.12)",
                                    background: "rgba(0,128,96,0.06)",
                                  }}
                                >
                                  <span style={{ color: "#008060", fontWeight: 600, fontSize: "0.75rem" }}>
                                    Most Popular
                                  </span>
                                </div>
                              ) : null}

                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <Text as="h2" variant="headingLg">
                                    {plan.displayName}
                                  </Text>
                                  <Text as="p" tone="subdued">
                                    {plan.subtitle}
                                  </Text>
                                </div>
                                {isCurrentPlan ? <Badge tone="success">Active</Badge> : null}
                              </div>
                            </div>

                            <div>
                              <Text as="p" variant="heading3xl" fontWeight="bold">
                                €{plan.price.toFixed(2)}
                              </Text>
                              <Text as="span" tone="subdued">
                                per month
                              </Text>
                            </div>

                            <Text as="p" tone="subdued">
                              {plan.description}
                            </Text>

                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                              {plan.features.map((feature) => (
                                <li key={feature} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                  <span aria-hidden>✓</span>
                                  <Text as="span">{PLAN_FEATURE_LABELS[feature]}</Text>
                                </li>
                              ))}
                            </ul>

                            <Button
                              variant="primary"
                              size="large"
                              fullWidth
                              onClick={() => handleSelectPlan(plan.key)}
                              disabled={isCurrentPlan}
                              loading={isLoading}
                            >
                              {buttonLabel}
                            </Button>

                            {isUpgradeTarget ? (
                              <Button variant="plain" onClick={() => navigate("/app/bundles")}>Continue configuring Free Shipping Bar</Button>
                            ) : null}
                          </div>
                        </Card>
                      );
                    })}
                  </InlineStack>
                </Layout.Section>
              </Layout>
            </Box>
          </BlockStack>
        </Page>
      </Box>
    </Frame>
  );
}
