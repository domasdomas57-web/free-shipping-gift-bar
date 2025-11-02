import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, BlockStack, Banner, Badge, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { TitleBar } from "@shopify/app-bridge-react";
import db from "../db.server";
import {
  PLAN_TRIAL_DAYS,
  PlanDefinition,
  PlanKey,
  resolvePlanFromBilling,
} from "../lib/billingPlans";

interface BillingCallbackData {
  success: boolean;
  error?: string;
  details?: string;
  message?: string;
  subscription?: {
    subscriptionId: string;
    planKey: PlanKey;
    planName: string;
    status: string;
    test: boolean;
    trialDays: number;
    currentPeriodEnd: string | null;
    price: number;
    currency: string;
    interval: string;
    activeFeatures: string[];
  };
}

const APP_SUBSCRIPTION_QUERY = `
  query getAppSubscription($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        id
        name
        status
        test
        trialDays
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const charge_id = url.searchParams.get("charge_id");
  
  if (!charge_id) {
    console.error("No charge_id parameter found in callback URL");
    return json({
      success: false,
      error: "Missing charge_id parameter"
    });
  }

  try {
    console.log(`Processing billing callback for shop: ${session.shop}, charge_id: ${charge_id}`);

    // Query the subscription status from Shopify
    const subscriptionId = `gid://shopify/AppSubscription/${charge_id}`;
    
    const response = await admin.graphql(APP_SUBSCRIPTION_QUERY, {
      variables: { id: subscriptionId }
    });

    const responseJson = await response.json();
    console.log("Subscription query response:", JSON.stringify(responseJson, null, 2));

    const subscription = responseJson.data?.node;
    
    if (!subscription) {
      console.error("Subscription not found");
      return json({
        success: false,
        error: "Subscription not found"
      });
    }

    // Check subscription status
    const lineItem = subscription.lineItems?.[0];
    const pricing = lineItem?.plan?.pricingDetails;
    const amount = pricing?.price?.amount || 0;
    const currencyCode = pricing?.price?.currencyCode || "EUR";

    const resolvedPlan: PlanDefinition | null = resolvePlanFromBilling(
      subscription.name,
      amount,
      currencyCode
    );

    if (!resolvedPlan) {
      console.error("Unable to match subscription to a known plan");
      return json({
        success: false,
        error: "Unable to determine plan for subscription",
        subscription,
      });
    }

    const isActive = subscription.status === "ACTIVE";
    const activeFeatures = isActive ? [...resolvedPlan.features] : [];
    const trialEndDate = subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null;

    const subscriptionData = {
      shop: session.shop,
      subscriptionId: subscription.id,
      planName: resolvedPlan.displayName,
      planKey: resolvedPlan.key,
      status: subscription.status,
      test: subscription.test,
      trialDays: subscription.trialDays ?? PLAN_TRIAL_DAYS,
      currentPeriodEnd: trialEndDate,
      price: amount,
      currency: currencyCode,
      interval: pricing?.interval || "EVERY_30_DAYS",
      trialEndsAt: trialEndDate,
    };

    console.log(`Subscription ${subscription.status} for shop ${session.shop}:`, subscriptionData);

    try {
      const storedSubscription = await db.subscription.upsert({
        where: { shop: session.shop },
        update: subscriptionData,
        create: subscriptionData,
      });

      const shopSettingsClient = (db as any).shopSettings;
      if (!shopSettingsClient) {
        console.error("ShopSettings model missing on Prisma client");
      } else {
        await shopSettingsClient.upsert({
          where: { shop: session.shop },
          update: {
            plan: resolvedPlan.key,
            activeFeatures,
            subscriptionStatus: subscription.status,
            subscriptionId: subscription.id,
            trialEndsAt: trialEndDate,
          },
          create: {
            shop: session.shop,
            plan: resolvedPlan.key,
            activeFeatures,
            subscriptionStatus: subscription.status,
            subscriptionId: subscription.id,
            trialEndsAt: trialEndDate,
          },
        });
      }

      console.log("Subscription stored in database:", storedSubscription);

      return json({
        success: isActive,
        message: isActive
          ? "Subscription activated successfully!"
          : `Subscription status: ${subscription.status}`,
        subscription: {
          subscriptionId: subscription.id,
          planKey: resolvedPlan.key,
          planName: resolvedPlan.displayName,
          status: subscription.status,
          test: subscription.test,
          trialDays: subscription.trialDays ?? PLAN_TRIAL_DAYS,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          price: amount,
          currency: currencyCode,
          interval: pricing?.interval || "EVERY_30_DAYS",
          activeFeatures,
        },
      });
    } catch (dbError) {
      console.error("Error storing subscription in database:", dbError);
      return json({
        success: false,
        error: "Subscription processed but failed to store in database",
        details: dbError instanceof Error ? dbError.message : "Database error",
      });
    }

  } catch (error) {
    console.error("Error processing billing callback:", error);
    return json({
      success: false,
      error: "Failed to process billing callback",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export default function BillingCallback() {
  const data = useLoaderData<typeof loader>() as BillingCallbackData;

  return (
    <Page>
      <TitleBar title="Billing Status" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              {data.success ? (
                <>
                  <Banner tone="success">
                    <Text as="h2" variant="headingMd">
                      Subscription Updated
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {data.message}
                    </Text>
                  </Banner>

                  {data.subscription && (
                    <Card>
                      <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <Text as="h3" variant="headingMd">
                              {data.subscription.planName}
                            </Text>
                            <Text as="p" tone="subdued">
                              Status: {data.subscription.status}
                            </Text>
                          </BlockStack>
                          <Badge tone="success">{`€${data.subscription.price.toFixed(2)} / month`}</Badge>
                        </InlineStack>

                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd">
                            Trial days: {data.subscription.trialDays}
                          </Text>
                          {data.subscription.activeFeatures.length > 0 ? (
                            <Text as="p" variant="bodyMd">
                              Features unlocked: {data.subscription.activeFeatures.join(", ")}
                            </Text>
                          ) : (
                            <Text as="p" tone="subdued">
                              No features currently unlocked for this status.
                            </Text>
                          )}
                          {data.subscription.test && (
                            <Text as="p" tone="subdued">⚠️ Test Mode</Text>
                          )}
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  )}
                </>
              ) : (
                <>
                  <Banner tone="critical">
                    <Text as="h2" variant="headingMd">
                      Subscription Error
                    </Text>
                  </Banner>

                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      {data.error}
                    </Text>

                    {data.details && (
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Details: {data.details}
                      </Text>
                    )}
                  </BlockStack>
                </>
              )}

              <Button variant="primary" onClick={() => (window.location.href = "/app")}>Return to App</Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}