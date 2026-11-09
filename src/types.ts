// Shared types for the customer-orders worker.

// Bindings injected by Cloudflare (wrangler.toml [vars] + dashboard secrets).
export interface Env {
  // Secrets — set via `wrangler secret put` or the CF dashboard. Never committed.
  CLIENT_ID: string;
  CLIENT_SECRET: string;

  // Vars — wrangler.toml [vars]. Safe to commit.
  API_VERSION: string;

  // Optional — only used by the New Customer Accounts token fallback.
  SHOP_ID?: string;
  CA_API_VERSION?: string;

  // Optional — when "true", error responses include the raw message/stack.
  // Set ONLY in dev/staging. Leave unset in production so clients get a
  // generic error and internals stay in the log stream.
  DEBUG?: string;
}

// Parsed storefront query params that drive the Admin query.
export interface OrdersQuery {
  cursor: string | null; // pagination (endCursor from a previous page)
  limit: number; // page size
  days: number | null; // date-range filter, e.g. 30 / 60 / 90
  orderNumber: string | null; // search by order name/number
}

export interface OrderNode {
  id: string;
  name: string;
  processedAt: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
  shippingAddress: { name: string | null } | null;
  lineItems: {
    nodes: Array<{
      title: string;
      quantity: number;
      unfulfilledQuantity: number;
      sellingPlan: { name: string; sellingPlanId: string | null } | null;
      product: { handle: string; onlineStoreUrl: string | null } | null;
    }>;
  };
  fulfillments: Array<{
    trackingInfo: Array<{ number: string | null; url: string | null }>;
  }>;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
  startCursor: string | null;
}

export interface CustomerOrdersResponse {
  data?: {
    customer?: {
      id: string;
      orders: { pageInfo: PageInfo; nodes: OrderNode[] } | null;
    } | null;
  };
  errors?: unknown;
}

/* ---------- Client-facing (sanitized) shapes ----------
 * Flat, predictable JSON for the storefront. No GID strings, no `nodes`
 * wrappers, no nested presentment money — just what the order card needs.
 */
export interface ClientLineItem {
  title: string;
  quantity: number;
  fulfillmentStatus: "FULFILLED" | "UNFULFILLED" | "PARTIALLY_FULFILLED";
  productUrl: string | null; // canonical store URL, or /products/<handle> fallback
  // Present when the line was bought on a subscription (selling plan). The plan
  // name/id capture which frequency was selected. Rich contract details (next
  // date, manage URL) would need read_own_subscription_contracts — not used.
  subscription: { planName: string; sellingPlanId: string | null } | null;
}

export interface ClientOrder {
  id: string; // numeric id, extracted from the GID
  name: string; // e.g. "#1001"
  processedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  total: { amount: string; currencyCode: string };
  shipToName: string | null;
  lineItems: ClientLineItem[];
  tracking: Array<{ number: string | null; url: string | null }>;
}

export interface ClientPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
  startCursor: string | null;
}

export interface ClientResponse {
  loggedIn: boolean;
  orders: ClientOrder[];
  pageInfo: ClientPageInfo | null;
}
