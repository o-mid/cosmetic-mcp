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
for (const name of ["list_shops", "search_cosmetics", "product_details"]) {
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

console.log(`ok shops=${withHits.map((s) => s.shop).join(",")} sample=${one.shop} ${one.price_toman}`);
