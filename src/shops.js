const UA = "cosmetic-mcp/0.1 (+read-only product search)";
const GAP_MS = 400;
const CACHE_MS = 3 * 60 * 1000;

const cache = new Map();
let lastCall = 0;

const WOO = [
  {
    id: "aradokht",
    name: "آرا دخت",
    site: "https://aradokht.net",
    note: "Korean skincare shop",
  },
  {
    id: "mouliyan",
    name: "مولیان",
    site: "https://mouliyan.com",
    note: "Skincare shop",
  },
  {
    id: "nazisho",
    name: "نازی شو",
    site: "https://nazisho.com",
    note: "Skincare shop",
  },
];

const KHANOUMI = {
  id: "khanoumi",
  name: "خانومی",
  site: "https://www.khanoumi.com",
  note: "Sheglam only. The source page is /brands/sheglam, not the whole Khanoumi catalog.",
  brand: "sheglam",
};

export const SHOPS = [...WOO, KHANOUMI];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

async function getJson(url) {
  const cached = cacheGet(url);
  if (cached) return cached;
  const wait = GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
  }
  const json = await res.json();
  cache.set(url, { exp: Date.now() + CACHE_MS, value: json });
  return json;
}

function toman(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function wooCard(shop, item) {
  const prices = item.prices ?? {};
  return {
    shop: shop.id,
    shop_name: shop.name,
    id: String(item.id),
    title: item.name ?? null,
    price_toman: toman(prices.price),
    regular_price_toman: toman(prices.regular_price),
    on_sale: item.on_sale === true,
    in_stock: item.is_in_stock === true,
    url: item.permalink ?? null,
  };
}

function khanoumiCard(item) {
  return {
    shop: KHANOUMI.id,
    shop_name: KHANOUMI.name,
    id: item.slug,
    title: item.nameFa || item.nameEn || null,
    title_en: item.nameEn || null,
    price_toman: toman(item.effectivePrice),
    regular_price_toman: toman(item.basePrice),
    on_sale: Number(item.discountPercent) > 0,
    in_stock: item.hasStock === true,
    url: item.slug ? `${KHANOUMI.site}/products/${item.slug}` : null,
  };
}

async function searchWoo(shop, query, limit) {
  const url = new URL("/wp-json/wc/store/v1/products", shop.site);
  if (query) url.searchParams.set("search", query);
  url.searchParams.set("per_page", String(limit));
  const items = await getJson(url);
  if (!Array.isArray(items)) throw new Error("Unexpected product list");
  return items.map((item) => wooCard(shop, item)).filter(Boolean);
}

async function searchKhanoumi(query, limit) {
  const url = new URL("/api/ntl/v1/products", KHANOUMI.site);
  url.searchParams.set("brand", KHANOUMI.brand);
  url.searchParams.set("page_number", "1");
  url.searchParams.set("page_size", String(limit));
  if (query) url.searchParams.set("query", query);
  const json = await getJson(url);
  const items = json?.data?.products?.items;
  if (!Array.isArray(items)) throw new Error("Unexpected Khanoumi product list");
  return items.map(khanoumiCard);
}

export async function searchShop(shopId, query, limit) {
  const shop = SHOPS.find((s) => s.id === shopId);
  if (!shop) throw new Error(`Unknown shop: ${shopId}`);
  if (shop.id === "khanoumi") return searchKhanoumi(query, limit);
  return searchWoo(shop, query, limit);
}

export async function productDetails(shopId, id) {
  const shop = SHOPS.find((s) => s.id === shopId);
  if (!shop) throw new Error(`Unknown shop: ${shopId}`);
  if (shop.id === "khanoumi") {
    const url = new URL(`/api/ntl/v1/products/slug/${encodeURIComponent(id)}`, shop.site);
    const json = await getJson(url);
    const item = json?.data;
    if (!item?.slug) throw new Error("Product not found");
    return {
      ...khanoumiCard(item),
      brand: "Sheglam",
    };
  }
  const url = new URL(`/wp-json/wc/store/v1/products/${encodeURIComponent(id)}`, shop.site);
  const item = await getJson(url);
  if (!item?.id) throw new Error("Product not found");
  const card = wooCard(shop, item);
  return {
    ...card,
    sku: item.sku || null,
    categories: Array.isArray(item.categories) ? item.categories.map((c) => c.name).filter(Boolean) : [],
  };
}
