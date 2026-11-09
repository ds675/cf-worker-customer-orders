import type { Env, OrdersQuery } from "./types";
import { json } from "./lib/http";
import { clamp, numericId, normalizeShop, parseDays } from "./lib/params";
import { verifyProxySignature } from "./shopify/proxy";
import { fetchCustomerOrders } from "./shopify/orders";
import { toClientOrder, toClientPageInfo } from "./shopify/transform";
import { resolveCustomerFromToken } from "./shopify/customer-account";

// Returns a paginated list of the logged-in customer's orders as JSON.
// Storefront -> Shopify App Proxy (attaches shop + logged_in_customer_id +
// signature) -> this worker -> Admin GraphQL API.
export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // 1) Prove the request actually came through Shopify's proxy (not forged).
  if (!(await verifyProxySignature(url, env.CLIENT_SECRET))) {
    return json({ error: "invalid_signature" }, 401);
  }

  // 1b) Which store is this request for? The app runs on many stores, so the
  //     shop is dynamic. It's part of the verified proxy params (trustworthy);
  //     we still validate the format before building outbound URLs.
  const shop = normalizeShop(url.searchParams.get("shop"));
  if (!shop) return json({ error: "invalid_shop" }, 400);

  // 2) Resolve the customer identity.
  //    Primary: proxy param (CLASSIC accounts; flaky with NEW accounts).
  let customerId = numericId(url.searchParams.get("logged_in_customer_id"));

  //    Fallback for NEW customer accounts: a Customer Account API token in POST.
  if (!customerId && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      customerAccessToken?: string;
    };
    if (body.customerAccessToken) {
      customerId = await resolveCustomerFromToken(env, body.customerAccessToken);
    }
  }

  if (!customerId) {
    // Not logged in / identity unresolved. Empty (not 401) so the section can
    // render a "please sign in" state gracefully.
    return json({ orders: [], pageInfo: null, loggedIn: false });
  }

  // 3) Parse pagination + filter params from the storefront.
  const params: OrdersQuery = {
    cursor: url.searchParams.get("cursor") || null,
    limit: clamp(parseInt(url.searchParams.get("limit") || "10", 10), 1, 50),
    days: parseDays(url.searchParams.get("days")),
    orderNumber: url.searchParams.get("q"),
  };

  // 4) Fetch from the Admin API.
  const result = await fetchCustomerOrders(env, shop, customerId, params);
  const conn = result?.data?.customer?.orders;

  if (result?.errors || !conn) {
    // Log the error SHAPE only — GraphQL errors or a "no connection" marker.
    // Never JSON.stringify the full payload: it contains order PII (names,
    // addresses, line items) which must not be persisted to the log stream.
    console.error(
      "admin_api_error:",
      JSON.stringify(result?.errors ?? { reason: "no_orders_connection" }),
    );
    // Expose GraphQL error details to the client only when DEBUG is enabled
    // (dev/staging). Production returns a generic error — no internal leakage.
    return json(
      env.DEBUG === "true"
        ? { error: "admin_api_error", details: result?.errors ?? null }
        : { error: "admin_api_error" },
      502,
    );
  }

  // 5) Sanitize into the flat client shape before returning.
  return json(
    {
      loggedIn: true,
      orders: conn.nodes.map(toClientOrder),
      pageInfo: toClientPageInfo(conn.pageInfo),
    },
    200,
    { "Cache-Control": "no-store, private" }, // never CDN-cache per-customer data
  );
}
