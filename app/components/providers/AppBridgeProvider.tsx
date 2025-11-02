import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ClientApplication } from "@shopify/app-bridge";
import { useLocation } from "@remix-run/react";

const HOST_STORAGE_KEY = "shopify-app-host";

declare global {
  interface Window {
    shopify?: any;
  }
}

interface AppBridgeProviderProps {
  apiKey: string;
  host?: string | null;
  children: ReactNode;
}

export function AppBridgeProvider({
  apiKey,
  host: initialHost,
  children,
}: AppBridgeProviderProps) {
  const location = useLocation();
  const [host, setHost] = useState<string | null>(() => {
    if (initialHost && initialHost.trim()) {
      return initialHost;
    }

    if (typeof window === "undefined") {
      return null;
    }

    const stored = window.sessionStorage.getItem(HOST_STORAGE_KEY);
    return stored && stored.trim() ? stored : null;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(location.search);
    const hostParam = params.get("host");

    if (hostParam && hostParam.trim()) {
      window.sessionStorage.setItem(HOST_STORAGE_KEY, hostParam);
      setHost(hostParam);
      return;
    }

    if (!host) {
      const stored = window.sessionStorage.getItem(HOST_STORAGE_KEY);
      if (stored && stored.trim()) {
        setHost(stored);
      }
    }
  }, [host, location.search]);

  useEffect(() => {
    if (typeof window === "undefined" || !host) {
      return;
    }

    let cancelled = false;
    let createdApp: ClientApplication | undefined;

    const bootstrapAppBridge = async () => {
      try {
        const shopifyGlobal = (window.shopify = window.shopify ?? {});

        const hasAppWithSameConfig =
          shopifyGlobal.app &&
          shopifyGlobal.config &&
          shopifyGlobal.config.apiKey === apiKey &&
          shopifyGlobal.config.host === host;

        if (hasAppWithSameConfig) {
          return;
        }

        const { createApp } = await import("@shopify/app-bridge");

        if (cancelled) {
          return;
        }

        createdApp = createApp({
          apiKey,
          host,
          forceRedirect: true,
        });

        if (cancelled) {
          createdApp?.destroy?.();
          return;
        }

        shopifyGlobal.createApp = createApp;
        shopifyGlobal.app?.destroy?.();
        shopifyGlobal.app = createdApp;
        shopifyGlobal.config = {
          apiKey,
          host,
        };
      } catch (error) {
        console.warn("Failed to initialize Shopify App Bridge", error);
      }
    };

    bootstrapAppBridge();

    return () => {
      cancelled = true;
      createdApp?.destroy?.();
    };
  }, [apiKey, host]);

  if (!host) {
    return null;
  }

  return <>{children}</>;
}