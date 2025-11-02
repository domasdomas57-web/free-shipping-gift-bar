import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Test GraphQL query for debugging
const TEST_QUERY = `
  query {
    shop {
      id
      name
      myshopifyDomain
      plan {
        displayName
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    
    console.log(`Testing GraphQL connection for shop: ${session.shop}`);

    const response = await admin.graphql(TEST_QUERY);
    const data = await response.json();

    console.log("Shop info response:", JSON.stringify(data, null, 2));

    return json({
      success: true,
      shopInfo: data,
      session: {
        shop: session.shop,
        accessToken: session.accessToken ? "present" : "missing"
      }
    });

  } catch (error) {
    console.error("Error testing GraphQL:", error);
    return json({ 
      error: "GraphQL test failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
};