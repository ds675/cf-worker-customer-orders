import type {
  OrderNode,
  PageInfo,
  ClientOrder,
  ClientLineItem,
  ClientPageInfo,
} from "../types";
import { idFromGid } from "../lib/params";

type RawLineItem = OrderNode["lineItems"]["nodes"][number];

// Derive a per-line fulfillment status from the unfulfilled count.
function lineFulfillmentStatus(
  quantity: number,
  unfulfilled: number,
): ClientLineItem["fulfillmentStatus"] {
  if (unfulfilled <= 0) return "FULFILLED";
  if (unfulfilled >= quantity) return "UNFULFILLED";
  return "PARTIALLY_FULFILLED";
}

// Prefer the canonical published URL; fall back to a storefront-relative path.
// null when there's no product (e.g. deleted/custom line item).
function productUrl(product: RawLineItem["product"]): string | null {
  if (!product) return null;
  return product.onlineStoreUrl ?? `/products/${product.handle}`;
}

function toClientLineItem(li: RawLineItem): ClientLineItem {
  return {
    title: li.title,
    quantity: li.quantity,
    fulfillmentStatus: lineFulfillmentStatus(li.quantity, li.unfulfilledQuantity),
    productUrl: productUrl(li.product),
    subscription: li.sellingPlan
      ? {
          planName: li.sellingPlan.name,
          sellingPlanId: li.sellingPlan.sellingPlanId
            ? idFromGid(li.sellingPlan.sellingPlanId)
            : null,
        }
      : null,
  };
}

// Map a raw Admin API order node into the flat, client-friendly shape.
export function toClientOrder(node: OrderNode): ClientOrder {
  return {
    id: idFromGid(node.id),
    name: node.name,
    processedAt: node.processedAt,
    financialStatus: node.displayFinancialStatus,
    fulfillmentStatus: node.displayFulfillmentStatus,
    total: {
      amount: node.totalPriceSet.presentmentMoney.amount,
      currencyCode: node.totalPriceSet.presentmentMoney.currencyCode,
    },
    shipToName: node.shippingAddress?.name ?? null,
    lineItems: node.lineItems.nodes.map(toClientLineItem),
    // Flatten fulfillments[].trackingInfo[] into a single tracking list.
    tracking: node.fulfillments
      .flatMap((f) => f.trackingInfo)
      .map((t) => ({ number: t.number, url: t.url })),
  };
}

// Pass through the cursor-based pageInfo. Pagination is prev/next only — no
// total count (cursor pagination doesn't expose one), so the client drives
// next/prev off hasNextPage / hasPreviousPage + the cursors.
export function toClientPageInfo(pageInfo: PageInfo): ClientPageInfo {
  return {
    hasNextPage: pageInfo.hasNextPage,
    hasPreviousPage: pageInfo.hasPreviousPage,
    endCursor: pageInfo.endCursor,
    startCursor: pageInfo.startCursor,
  };
}
