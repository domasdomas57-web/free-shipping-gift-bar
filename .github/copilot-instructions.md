# Free Shipping Bundle - Shopify App Development Guide

This is a Shopify app built with Remix, targeting embedded app deployment. The codebase follows Shopify's modern app template patterns with specific conventions for authentication, data management, and UI components.

## Architecture Overview

**Core Components:**
- `app/shopify.server.ts` - Central Shopify app configuration with Prisma session storage
- `app/db.server.ts` - Prisma client singleton with dev/prod environment handling  
- `app/routes/app.tsx` - Main app layout with AppProvider and NavMenu navigation
- `prisma/schema.prisma` - Session storage schema (currently SQLite, production-ready for single instance)

**Authentication Flow:** Uses `@shopify/shopify-app-remix` with embedded app strategy. All admin routes require `authenticate.admin(request)` in loaders. Webhooks use `authenticate.webhook(request)` for validation.

## Development Workflow

**Essential Commands:**
```bash
shopify app dev          # Start development server with tunnel
shopify app deploy       # Deploy app configuration and webhooks
pnpm setup              # Run Prisma generate + migrate (for fresh installs)
```

**Key Environment Variables:** Set in Shopify CLI or `.env`:
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` - App credentials from Partners dashboard
- `SCOPES` - Comma-separated OAuth scopes (currently: `write_products`)
- `SHOPIFY_APP_URL` - Auto-managed by CLI during development

## Code Patterns & Conventions

**Route Structure:** Uses flat routing (`@remix-run/fs-routes`). App pages go in `app/routes/app.*` and auto-appear in embedded iframe. Webhooks in `app/routes/webhooks.*`.

**GraphQL Usage:**
```tsx
// In loader/action functions
const { admin } = await authenticate.admin(request);
const response = await admin.graphql(`query { ... }`);
```

**UI Components:** Exclusively use `@shopify/polaris` components. Import `polarisStyles` in layouts. Navigation uses App Bridge's `NavMenu` component.

**Error Boundaries:** All app routes must export Shopify's boundary handlers:
```tsx
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
```

**Database Patterns:** Prisma client accessed via `db.server.ts`. Session cleanup handled automatically in uninstall webhook. For production, migrate to persistent database (PostgreSQL, MySQL) by updating `datasource` in schema.

## Integration Points

**Webhook Configuration:** Declared in `shopify.app.toml` under `[[webhooks.subscriptions]]`. Automatically deployed with `shopify app deploy`. Handle in matching route files (e.g., `webhooks.app.uninstalled.tsx`).

**App Bridge Integration:** Embedded app uses `@shopify/app-bridge-react` components (`TitleBar`, `NavMenu`). Avoid regular HTML navigation - use Remix `Link` components to maintain session context.

**Extensions Support:** Workspace configured for Shopify app extensions in `extensions/` directory (currently empty). Extensions are managed separately via `shopify app generate extension`.

## Critical Development Notes

- **Navigation:** Never use `<a>` tags or browser redirects - breaks embedded context
- **Database:** SQLite works for development; requires migration planning for production scale
- **API Versioning:** Currently on `ApiVersion.January25` - verify compatibility when updating
- **Tunneling:** Development uses Cloudflare tunnels by default; use ngrok for streaming responses (`defer/await`)
- **Scopes:** Changes require `shopify app deploy` to update OAuth flow

**Common Gotchas:** Session loops on scope changes (redeploy fixes), HMAC validation fails for admin-created webhooks (use app-specific webhooks instead), MongoDB requires replica set configuration for Prisma transactions.