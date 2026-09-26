import { SHOPS, productDetails, searchShop } from "./shops.js";

const shopsEnum = SHOPS.map((s) => s.id);

export const tools = [
  {
    name: "list_shops",
    description: "The four shops this server can read. Khanoumi is the whole catalog.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_cosmetics",
    description:
      "Search product cards across Aradokht, Mouliyan, Nazisho, and Khanoumi. Prices are in Toman. Pass shop to search one store, or brand to narrow Khanoumi.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product words, in Persian or English." },
        shop: { type: "string", enum: shopsEnum, description: "Limit the search to one shop." },
        brand: { type: "string", description: "Khanoumi brand slug, such as sheglam. Ignored by the other shops." },
        min_price: { type: "integer", description: "Minimum price in Toman." },
        max_price: { type: "integer", description: "Maximum price in Toman." },
        in_stock: { type: "boolean", description: "Only products the shop marks as in stock." },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Cards per shop. Default 5." },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "find_best_price",
    description:
      "Same search as search_cosmetics, then one list sorted by the cheapest in-stock Toman price.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        brand: { type: "string", description: "Khanoumi brand slug. Ignored by the other shops." },
        min_price: { type: "integer" },
        max_price: { type: "integer" },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "How many cheapest cards to return. Default 5." },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "product_details",
    description: "One product from one shop. Use the id returned by search.",
    inputSchema: {
      type: "object",
      properties: {
        shop: { type: "string", enum: shopsEnum },
        id: { type: "string", description: "WooCommerce product id, or the Khanoumi product slug." },
      },
      required: ["shop", "id"],
    },
    annotations: { readOnlyHint: true },
  },
];

function searchOpts(args) {
  const minPrice = args.min_price == null ? null : Number(args.min_price);
  const maxPrice = args.max_price == null ? null : Number(args.max_price);
  return {
    brand: args.brand ? String(args.brand).trim() : "",
    inStock: args.in_stock === true,
    minPrice: Number.isFinite(minPrice) ? minPrice : null,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
  };
}

function textResult(data, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export async function callTool(name, args) {
  try {
    if (name === "list_shops") {
      return textResult({
        shops: SHOPS.map((s) => ({
          id: s.id,
          name: s.name,
          site: s.site,
          note: s.note,
        })),
      });
    }
    if (name === "search_cosmetics" || name === "find_best_price") {
      const query = String(args.query ?? "").trim();
      if (!query) return textResult({ error: "query is required" }, true);
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      const perShop = name === "find_best_price" ? Math.min(10, Math.max(limit, 8)) : limit;
      const opts = searchOpts(args);
      if (args.shop && !SHOPS.some((s) => s.id === args.shop)) {
        return textResult({ error: `Unknown shop: ${args.shop}` }, true);
      }
      const ids = args.shop ? [args.shop] : SHOPS.map((s) => s.id);
      const shops = [];
      for (const id of ids) {
        try {
          const products = await searchShop(id, query, perShop, opts);
          shops.push({ shop: id, count: products.length, products });
        } catch (err) {
          shops.push({ shop: id, count: 0, products: [], error: err.message });
        }
      }
      if (name === "search_cosmetics") return textResult({ query, shops });
      const ranked = shops
        .flatMap((s) => s.products)
        .filter((p) => p.in_stock && p.price_toman != null)
        .sort((a, b) => a.price_toman - b.price_toman)
        .slice(0, limit);
      return textResult({
        query,
        products: ranked,
        shop_errors: shops.filter((s) => s.error).map((s) => ({ shop: s.shop, error: s.error })),
      });
    }
    if (name === "product_details") {
      const shop = String(args.shop ?? "");
      const id = String(args.id ?? "").trim();
      if (!shop || !id) return textResult({ error: "shop and id are required" }, true);
      return textResult(await productDetails(shop, id));
    }
    return textResult({ error: `Unknown tool: ${name}` }, true);
  } catch (err) {
    return textResult({ error: err.message }, true);
  }
}
