// Param parsing / validation helpers.

export function numericId(v: string | null): string | null {
  if (!v) return null;
  const n = String(v).trim();
  return /^\d+$/.test(n) ? n : null;
}

// Extract the numeric id from a Shopify GID.
// e.g. "gid://shopify/Order/123" -> "123"
export function idFromGid(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// The proxy includes `shop` in its (verified) params. Validate the format as
// defense-in-depth before using it to build outbound Admin API URLs.
export function normalizeShop(v: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

// PRD allows 30/60/90; accept any positive int but bound it defensively.
export function parseDays(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n <= 0 ? null : Math.min(n, 3650);
}
