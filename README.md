# customer-orders

Shopify App Proxy → Cloudflare Worker that returns the logged-in customer's
orders as JSON for a storefront Order History page.

```
Storefront  fetch('/apps/customer-orders?...')
   │
   ▼  Shopify App Proxy  (attaches shop, logged_in_customer_id, signature)
   ▼
Cloudflare Worker  (verify HMAC → resolve shop+customer → Admin GraphQL)
   ▼
Shopify Admin API → orders JSON
```

The Shopify app itself holds no code — it provides scopes, the App Proxy rule,
and the client credentials. All logic lives here.

## Project layout

```
src/
  index.ts                 entry: export default { fetch }, top-level error guard
  handler.ts               request flow: verify → identify → fetch → respond
  shopify/
    proxy.ts               verifyProxySignature (HMAC of proxy params)
    admin-token.ts         getAdminToken — per-shop client_credentials cache
    orders.ts              fetchCustomerOrders + GraphQL + buildOrderQuery
    customer-account.ts    resolveCustomerFromToken (new-accounts fallback)
  lib/
    crypto.ts              hmacHex, timingSafeEqualHex
    http.ts                json()
    params.ts              numericId, clamp, normalizeShop, parseDays
  types.ts                 Env bindings + response types
```

## Configuration

Non-secret vars live in `wrangler.toml`:

- `API_VERSION` — Shopify Admin API version (e.g. `2026-04`)

Secrets are set out-of-band (never committed):

```bash
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET
```

The `shop` is read per-request from the verified proxy params. The
client-credentials grant requires the app and each store to be in the same Dev
Dashboard organization.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in CLIENT_ID / CLIENT_SECRET
npm run dev                      # wrangler dev
npm run typecheck                # tsc --noEmit
```

Note: proxy requests are HMAC-signed by Shopify, so end-to-end testing happens
against the deployed worker via the storefront, not raw localhost calls.

## Deploy (Cloudflare Workers Builds)

Pushing to the connected branch auto-builds and deploys. One-time setup:

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → this worker → Settings → Builds →
   Connect to Git → select the repo + branch (`main`).
3. Build command: `npm run deploy` (or leave default if it detects wrangler).
4. Ensure `CLIENT_ID` / `CLIENT_SECRET` secrets exist on the worker.

Manual deploy fallback: `npm run deploy`.

## Endpoint

```
GET /apps/customer-orders?cursor=<endCursor>&limit=10&days=90&q=1001
```

| Param    | Meaning                                  |
| -------- | ---------------------------------------- |
| `cursor` | pagination cursor (`pageInfo.endCursor`) |
| `limit`  | page size (1–50, default 10)             |
| `days`   | date-range filter, e.g. 30 / 60 / 90     |
| `q`      | search by order number/name              |

Response is a flat, sanitized shape (no GIDs, no `nodes` wrappers):

```json
{
  "loggedIn": true,
  "orders": [
    {
      "id": "123456789",
      "name": "#1001",
      "processedAt": "2026-06-01T12:00:00Z",
      "financialStatus": "PAID",
      "fulfillmentStatus": "FULFILLED",
      "total": { "amount": "42.00", "currencyCode": "USD" },
      "shipToName": "Jane Doe",
      "lineItems": [{ "title": "Widget", "quantity": 2 }],
      "tracking": [{ "number": "1Z...", "url": "https://..." }]
    }
  ],
  "pageInfo": {
    "hasNextPage": true,
    "hasPreviousPage": false,
    "endCursor": "...",
    "startCursor": "..."
  }
}
```

Pagination is prev/next only — cursor-based, no total page count. The client
enables/disables the prev/next controls from `hasPreviousPage`/`hasNextPage` and
passes `endCursor` (next) or `startCursor` (prev) back as the `cursor` param.

## Current behavior

Implemented filters are date range (`days`) and order-number search (`q`).
Subscription line items expose the selling plan name and id. Total page count
is not available with cursor pagination (`hasNextPage`/`endCursor` only).
