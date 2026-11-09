import { hmacHex, timingSafeEqualHex } from "../lib/crypto";

// App proxy signature verification.
// Shopify: drop `signature`, sort remaining params by key, join multi-values
// with ",", concatenate as `key=value` with NO separator, HMAC-SHA256 hex.
export async function verifyProxySignature(
  url: URL,
  secret: string,
): Promise<boolean> {
  const signature = url.searchParams.get("signature");
  if (!signature) return false;

  const grouped: Record<string, string[]> = {};
  for (const [key, value] of url.searchParams) {
    if (key === "signature") continue;
    (grouped[key] ||= []).push(value);
  }
  const message = Object.keys(grouped)
    .sort()
    .map((k) => `${k}=${grouped[k].join(",")}`)
    .join("");

  const computed = await hmacHex(secret, message);
  return timingSafeEqualHex(computed, signature);
}
