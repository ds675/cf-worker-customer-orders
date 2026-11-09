import type { Env } from "../types";

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Best-effort in-isolate cache, KEYED BY SHOP. The app is installed on many
// stores, so each store gets its own token. Workers spin up many isolates, so a
// few token requests per day per shop is normal. For a single shared cache
// across isolates, back this with Workers KV instead.
const tokenCache = new Map<string, CachedToken>();

// Exchange CLIENT_ID + CLIENT_SECRET for a ~24h Admin API token for `shop`.
// This client_credentials grant works when the app and store are in the SAME
// Dev Dashboard org.
export async function getAdminToken(env: Env, shop: string): Promise<string> {
  const cached = tokenCache.get(shop);
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
    }),
  });

  const raw = await resp.text();
  if (!resp.ok) {
    // 400 shop_not_permitted usually means app + store aren't in the same org.
    throw new Error(`token_request_failed ${resp.status}: ${raw}`);
  }

  let parsed: { access_token: string; expires_in: number };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `token_non_json ${resp.status}: ${raw.slice(0, 300) || "(empty body)"}`,
    );
  }

  tokenCache.set(shop, {
    token: parsed.access_token,
    expiresAt: Date.now() + parsed.expires_in * 1000,
  });
  return parsed.access_token;
}
