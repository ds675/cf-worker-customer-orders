# customer-orders — project guide for Claude Code

## What this is

A **Shopify App Proxy → Cloudflare Worker** that returns the logged-in customer's
order history as JSON for a storefront Order History page.

The Shopify app itself holds **no code** — it only provides scopes, the App Proxy
rule, and client credentials. **All logic lives in this Worker.**

## Architecture

```
storefront  fetch('/apps/customer-orders?...')
   → Shopify App Proxy  (adds shop, logged_in_customer_id, signature)
   → this Worker  (verify HMAC → resolve shop + customer → Admin GraphQL)
   → sanitized orders JSON
```

## Project structure

```
src/index.ts                 entry: export default { fetch } + error guard
src/handler.ts               request flow: verify → identify → fetch → respond
src/shopify/proxy.ts         HMAC proxy-signature verification
src/shopify/admin-token.ts   per-shop Admin token cache (client_credentials)
src/shopify/orders.ts        GraphQL query + buildOrderQuery (date/search filters)
src/shopify/transform.ts     raw GraphQL → flat client shape (the client contract)
src/shopify/customer-account.ts  New Customer Accounts token fallback
src/lib/{crypto,http,params}.ts  HMAC, json(), param helpers
src/types.ts                 Env bindings + raw + client types
```

## Commands

- `npm install`
- `npm run dev` — wrangler dev (local; note: Shopify HMAC can't be replayed locally — see README)
- `npm run typecheck` — `tsc --noEmit`. **Run before every push.**
- `npm run deploy` — manual deploy (normally unnecessary; see below)

## Deploy

GitHub repo is connected to **Cloudflare Workers Builds**. **Push to `main` →
auto build + deploy.** Secrets (`CLIENT_ID`, `CLIENT_SECRET`) live in the CF
dashboard and are untouched by deploys. Non-secret config (`API_VERSION`) is in
`wrangler.toml [vars]` and overrides the dashboard on deploy.

## Scopes — read this before adding GraphQL fields

App scopes: `read_customers, read_orders, read_all_orders, read_products`.

- `read_all_orders` — required for orders older than 60 days.
- `read_products` — required for the line-item `product` field.
- **A field that needs a scope the token lacks makes the WHOLE query 502** (access
  denied is query-wide, even for unrelated orders). So:
  1. Validate any new field's required scopes first (Shopify MCP
     `validate_graphql_codeblocks`).
  2. If it needs a new scope: add it in the app → Release → **re-grant on the
     store** → only then deploy the code. Redeploy flushes the per-isolate token
     cache so fresh tokens carry the new scope.

## Response contract

Flat, sanitized JSON — no GIDs, no `nodes` wrappers, no nested presentment money.
The mapping lives in `src/shopify/transform.ts`; keep the raw GraphQL shape
decoupled from the client shape there. See README for a full example.

## Gotchas

- **Multi-store:** `shop` is read per-request from the verified proxy params, so
  one deploy serves every store in the org; the token cache is keyed per shop.
  Relies on all stores being in the **same Dev Dashboard org** (client_credentials).
- **New Customer Accounts:** `logged_in_customer_id` can be empty → token fallback
  (`resolveCustomerFromToken`, needs `SHOP_ID` + `CA_API_VERSION`). Classic
  accounts pass the id directly.
- **Errors:** generic to clients in prod; full detail only in logs. `DEBUG="true"`
  var enables verbose error bodies — dev/staging only.
- **Never log order PII** (no `JSON.stringify` of full order payloads).
- **Pagination is prev/next only** (cursor-based) — no total page count.

## Conventions

- TypeScript, strict mode. Run `npm run typecheck` before pushing.
- Commit messages: plain and descriptive, **no AI attribution / co-author lines**.
- Verify new Shopify GraphQL fields against the live schema **and** their required
  scopes before adding them.

## Current behavior

Implemented filters: date range (`days`) and order-number search (`q`).
Subscription line items expose the selling plan name and id.
