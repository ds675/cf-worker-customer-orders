import type { Env, OrdersQuery, CustomerOrdersResponse } from "../types";
import { getAdminToken } from "./admin-token";

const ORDERS_QUERY = `
  query CustomerOrders($id: ID!, $first: Int!, $after: String, $query: String) {
    customer(id: $id) {
      id
      orders(
        first: $first
        after: $after
        query: $query
        sortKey: PROCESSED_AT
        reverse: true
      ) {
        pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
        nodes {
          id
          name
          processedAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet { presentmentMoney { amount currencyCode } }
          shippingAddress { name }
          lineItems(first: 100) {
            nodes {
              title
              quantity
              unfulfilledQuantity
              sellingPlan { name sellingPlanId }
              product { handle onlineStoreUrl }
            }
          }
          fulfillments(first: 10) { trackingInfo { number url } }
        }
      }
    }
  }`;

// Build a Shopify order search string from the storefront filter params.
// Order search supports `processed_at:` and `name:` among others.
export function buildOrderQuery(params: OrdersQuery): string | null {
  const parts: string[] = [];

  if (params.days && params.days > 0) {
    // processed_at is ISO-8601; ">=" lower-bounds the date range.
    const since = new Date(Date.now() - params.days * 86_400_000).toISOString();
    parts.push(`processed_at:>=${since}`);
  }

  if (params.orderNumber) {
    // Order names look like "#1001". Strip a leading "#"; Shopify matches the
    // name token. Adjust here if your numbering uses prefixes/suffixes.
    const n = params.orderNumber.replace(/^#/, "").trim();
    if (n) parts.push(`name:${n}`);
  }

  return parts.length ? parts.join(" AND ") : null;
}

export async function fetchCustomerOrders(
  env: Env,
  shop: string,
  customerId: string,
  params: OrdersQuery,
): Promise<CustomerOrdersResponse> {
  if (!env.API_VERSION) {
    throw new Error("API_VERSION var is not set (URL would be malformed)");
  }

  const variables = {
    id: `gid://shopify/Customer/${customerId}`,
    first: params.limit,
    after: params.cursor,
    query: buildOrderQuery(params),
  };

  const endpoint = `https://${shop}/admin/api/${env.API_VERSION}/graphql.json`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await getAdminToken(env, shop),
    },
    body: JSON.stringify({ query: ORDERS_QUERY, variables }),
  });

  const raw = await resp.text();
  try {
    return JSON.parse(raw) as CustomerOrdersResponse;
  } catch {
    throw new Error(
      `admin_non_json ${resp.status} @ ${endpoint} :: ${raw.slice(0, 300) || "(empty body)"}`,
    );
  }
}
