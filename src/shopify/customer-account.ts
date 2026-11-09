import type { Env } from "../types";
import { numericId } from "../lib/params";

/* Customer Account API token -> customer id (new customer accounts).
 * Only needed when logged_in_customer_id is empty. The browser obtains `token`
 * via the Customer Account API OAuth/PKCE flow and POSTs it here. The token is
 * scoped to one customer, so the id it returns is trustworthy.
 * Requires SHOP_ID + CA_API_VERSION. Confirm the endpoint against current docs.
 */
export async function resolveCustomerFromToken(
  env: Env,
  token: string,
): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://shopify.com/${env.SHOP_ID}/account/customer/api/${env.CA_API_VERSION}/graphql`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token, // Customer Account API access token
        },
        body: JSON.stringify({ query: `{ customer { id } }` }),
      },
    );
    const data = (await resp.json()) as {
      data?: { customer?: { id?: string } };
    };
    const gid = data?.data?.customer?.id; // gid://shopify/Customer/123
    return gid ? numericId(gid.split("/").pop() ?? null) : null;
  } catch {
    return null;
  }
}
