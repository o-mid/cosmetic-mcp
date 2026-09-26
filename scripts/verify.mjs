const url = process.env.COSMETIC_MCP_URL ?? "http://127.0.0.1:8787/mcp";

async function rpc(method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  if (!line) throw new Error(`No data line: ${text.slice(0, 180)}`);
  return JSON.parse(line.slice(5));
}

function toolJson(msg) {
  const text = msg.result?.content?.[0]?.text;
  if (!text) throw new Error(JSON.stringify(msg).slice(0, 300));
  return JSON.parse(text);
}

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "verify", version: "0" },
});
if (init.result?.serverInfo?.name !== "cosmetic-mcp") throw new Error("handshake failed");

const listed = await rpc("tools/list", {});
const names = listed.result.tools.map((t) => t.name);
for (const name of ["list_shops", "search_cosmetics", "find_best_price", "product_details"]) {
  if (!names.includes(name)) throw new Error(`missing tool ${name}`);
}

const shops = toolJson(await rpc("tools/call", { name: "list_shops", arguments: {} }));
if (shops.shops.length !== 4) throw new Error("expected 4 shops");

const search = toolJson(
  await rpc("tools/call", { name: "search_cosmetics", arguments: { query: "سرم", limit: 2 } }),
);
const withHits = search.shops.filter((s) => s.count > 0);
if (withHits.length < 3) {
  throw new Error(`expected hits from at least 3 shops, got ${JSON.stringify(search.shops.map((s) => [s.shop, s.count, s.error]))}`);
}
for (const shop of withHits) {
  const card = shop.products[0];
  if (!card.price_toman || !card.url) throw new Error(`bad card from ${shop.shop}`);
}

const one = withHits[0].products[0];
const details = toolJson(
  await rpc("tools/call", {
    name: "product_details",
    arguments: { shop: one.shop, id: one.id },
  }),
);
if (details.shop !== one.shop || !details.title) throw new Error("details mismatch");

const khanoumi = toolJson(
  await rpc("tools/call", {
    name: "search_cosmetics",
    arguments: { query: "کرم", shop: "khanoumi", limit: 5 },
  }),
);
const khCards = khanoumi.shops[0].products;
if (!khCards.length) throw new Error(`khanoumi empty: ${khanoumi.shops[0].error ?? ""}`);
const brands = new Set(khCards.map((c) => c.brand).filter(Boolean));
if (brands.size < 1) throw new Error("khanoumi cards missing brand");

const priced = toolJson(
  await rpc("tools/call", {
    name: "search_cosmetics",
    arguments: { query: "سرم", shop: one.shop, max_price: 2000000, in_stock: true, limit: 5 },
  }),
);
for (const card of priced.shops[0].products) {
  if (card.price_toman > 2000000) throw new Error(`price filter leaked ${card.price_toman}`);
  if (!card.in_stock) throw new Error("in_stock filter leaked");
}

const best = toolJson(
  await rpc("tools/call", { name: "find_best_price", arguments: { query: "سرم", limit: 5 } }),
);
const prices = best.products.map((p) => p.price_toman);
if (prices.length < 2) throw new Error("find_best_price too short");
if (prices.some((p, i) => i > 0 && p < prices[i - 1])) throw new Error("find_best_price not sorted");

const bad = toolJson(
  await rpc("tools/call", { name: "search_cosmetics", arguments: { query: "سرم", shop: "nope" } }),
);
if (!bad.error) throw new Error("unknown shop should error");

console.log(`ok shops=${withHits.map((s) => s.shop).join(",")} khanoumi_brands=${[...brands].join("|")} best=${prices[0]}`);
