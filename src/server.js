import { SHOPS, productDetails, searchShop } from "./shops.js";

const shopsEnum = SHOPS.map((s) => s.id);

export const tools = [
  {
    name: "list_shops",
    description: "The four shops this server can read. Khanoumi is Sheglam products only.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_cosmetics",
    description:
      "Search product cards across Aradokht, Mouliyan, Nazisho, and Sheglam on Khanoumi. Prices are in Toman. Pass shop to search one store.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product words, in Persian or English." },
        shop: { type: "string", enum: shopsEnum, description: "Limit the search to one shop." },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Cards per shop. Default 5." },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "product_details",
    description: "One product from one shop. Use the id returned by search_cosmetics.",
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
    if (name === "search_cosmetics") {
      const query = String(args.query ?? "").trim();
      if (!query) return textResult({ error: "query is required" }, true);
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      const ids = args.shop ? [args.shop] : SHOPS.map((s) => s.id);
      const shops = [];
      for (const id of ids) {
        try {
          const products = await searchShop(id, query, limit);
          shops.push({ shop: id, count: products.length, products });
        } catch (err) {
          shops.push({ shop: id, count: 0, products: [], error: err.message });
        }
      }
      return textResult({ query, shops });
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
