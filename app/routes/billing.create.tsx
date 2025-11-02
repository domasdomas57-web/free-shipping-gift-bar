import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  BILLING_PLANS,
  PLAN_TRIAL_DAYS,
  getPlanByKey,
  getPlanKeyFromSubscriptionName,
} from "../lib/billingPlans";

interface BillingRequest {
  planKey?: string;
  planName?: string;
  price?: string;
  returnUrl?: string;
}

const BILLING_TEST_MODE =
  process.env.SHOPIFY_BILLING_TEST === "true" || process.env.NODE_ENV !== "production";

const APP_SUBSCRIPTION_CREATE_MUTATION = `
  mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean, $trialDays: Int, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, trialDays: $trialDays, lineItems: $lineItems) {
      appSubscription {
        id
        name
        status
        test
        trialDays
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body: BillingRequest = await request.json();
    const planKeyCandidate = body.planKey ?? getPlanKeyFromSubscriptionName(body.planName ?? null);
    const planDefinition = getPlanByKey(planKeyCandidate) ?? null;

    if (!planDefinition) {
      return json(
        {
          error: "Unsupported plan selection",
        },
        { status: 400 }
      );
    }

    const requestUrl = new URL(request.url);
    const normalizedReturnUrl = `${requestUrl.origin}/billing/callback`;

    const sanitizedAmount = planDefinition.price;

    console.log(
      `Creating subscription for shop: ${session.shop}, plan: ${planDefinition.displayName}, price: ${sanitizedAmount}`
    );
    console.log(`Using billing returnUrl: ${normalizedReturnUrl}`);

    const variables = {
      name: `Free Shipping Bundle - ${planDefinition.displayName}`,
      returnUrl: normalizedReturnUrl,
      test: BILLING_TEST_MODE,
      trialDays: PLAN_TRIAL_DAYS,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: sanitizedAmount,
                currencyCode: planDefinition.currencyCode,
              },
              interval: "EVERY_30_DAYS"
            }
          }
        }
      ]
    };

    console.log("Calling appSubscriptionCreate with variables:", JSON.stringify(variables, null, 2));

    const response = await admin.graphql(APP_SUBSCRIPTION_CREATE_MUTATION, {
      variables
    });

    const responseJson = await response.json();
    console.log("AppSubscriptionCreate response:", JSON.stringify(responseJson, null, 2));

    if ("errors" in responseJson && Array.isArray(responseJson.errors) && responseJson.errors.length > 0) {
      const msg = responseJson.errors.map((err: { message: string }) => err.message).join(", ");
      console.error(`❌ Subscription creation failed: ${msg}`);
      return json({ error: msg, details: responseJson.errors }, { status: 502 });
    }

    if (responseJson.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errors = responseJson.data.appSubscriptionCreate.userErrors;
      const message = errors.map((error: { message: string }) => error.message).join(", ");
      console.error("AppSubscriptionCreate userErrors:", errors);
      console.error(`❌ Subscription creation failed: ${message}`);
      return json({ 
        error: message || "Subscription creation failed", 
        userErrors: errors 
      }, { status: 400 });
    }

    const { appSubscription, confirmationUrl } = responseJson.data?.appSubscriptionCreate || {};

    if (!confirmationUrl) {
      const message = "Failed to create subscription - no confirmation URL";
      console.error("No confirmationUrl received from Shopify");
      console.error(`❌ Subscription creation failed: ${message}`);
      return json({ 
        error: message 
      }, { status: 500 });
    }

    console.log(`Subscription created successfully. ID: ${appSubscription?.id}, confirmationUrl: ${confirmationUrl}`);
    console.log("✅ Subscription created successfully");

    return json({
      success: true,
      subscriptionId: appSubscription?.id,
      planKey: planDefinition.key,
      confirmationUrl,
      subscription: appSubscription
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating subscription:", error);
    console.error(`❌ Subscription creation failed: ${message}`);
    return json({ 
      error: "Internal server error", 
      details: message 
    }, { status: 500 });
  }
};