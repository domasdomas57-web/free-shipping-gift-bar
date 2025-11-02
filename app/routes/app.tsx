import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { AppBridgeProvider } from "../components/providers/AppBridgeProvider";
import { QueryProvider } from "../components/providers/QueryProvider";
import { authenticate } from "../shopify.server";

// Import Polaris translations
import enTranslations from "@shopify/polaris/locales/en.json";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host,
  };
};

export default function App() {
  const { apiKey, host } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <AppBridgeProvider apiKey={apiKey} host={host}>
          <QueryProvider>
            <NavMenu>
              <Link to="/app" rel="home">
                free-shipping-bundle
              </Link>
              <Link to="/app/bundles">My Bundles</Link>
              <Link to="/app/pricing">Pricing</Link>
            </NavMenu>
            <Outlet />
          </QueryProvider>
        </AppBridgeProvider>
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
