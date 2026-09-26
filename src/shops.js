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
  note: "The whole Khanoumi catalog. Pass brand, for example sheglam, to narrow it.",
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

function brandName(brand) {
  if (!brand) return null;
  if (typeof brand === "string") return brand;
  return brand.nameFa || brand.nameEn || brand.slug || null;
}

function fold(value) {
  return String(value)
    .toLowerCase()
    .replace(/[يی]/g, "ی")
    .replace(/[كک]/g, "ک")
    .replace(/\u200c/g, " ");
}

function khanoumiCard(item) {
  const price = item.effectivePrice ?? item.salesPrice;
  const regular = item.basePrice;
  return {
    shop: KHANOUMI.id,
    shop_name: KHANOUMI.name,
    id: item.slug,
    title: item.nameFa || item.nameEn || null,
    title_en: item.nameEn || null,
    brand: brandName(item.brand),
    price_toman: toman(price),
    regular_price_toman: toman(regular),
    on_sale: Number(item.discountPercent) > 0 || (toman(price) != null && toman(regular) != null && Number(price) < Number(regular)),
    in_stock: item.hasStock === true || (item.hasStock == null && item.isSalable === true),
    url: item.slug ? `${KHANOUMI.site}/products/${item.slug}` : null,
  };
}

function khanoumiKeeps(item, query, brand) {
  if (brand) {
    const needle = fold(brand);
    const names = [item.brand?.slug, item.brand?.nameEn, item.brand?.nameFa].filter(Boolean).map(fold);
    if (!names.includes(needle)) return false;
  }
  const tokens = fold(query).split(/\s+/).filter((token) => token.length >= 2);
  if (!tokens.length) return true;
  const hay = fold([item.nameFa, item.nameEn, item.brand?.nameFa, item.brand?.nameEn].filter(Boolean).join(" "));
  return tokens.every((token) => hay.includes(token));
}

function withinBudget(card, minPrice, maxPrice) {
  if (card.price_toman == null) return false;
  if (minPrice != null && card.price_toman < minPrice) return false;
  if (maxPrice != null && card.price_toman > maxPrice) return false;
  return true;
}

async function searchWoo(shop, query, limit, opts) {
  const url = new URL("/wp-json/wc/store/v1/products", shop.site);
  if (query) url.searchParams.set("search", query);
  url.searchParams.set("per_page", String(limit));
  if (opts.minPrice != null) url.searchParams.set("min_price", String(opts.minPrice));
  if (opts.maxPrice != null) url.searchParams.set("max_price", String(opts.maxPrice));
  const items = await getJson(url);
  if (!Array.isArray(items)) throw new Error("Unexpected product list");
  return items.map((item) => wooCard(shop, item)).filter(Boolean);
}

async function searchKhanoumi(query, limit, opts) {
  const url = new URL("/api/ntl/v1/products", KHANOUMI.site);
  url.searchParams.set("page_number", "1");
  url.searchParams.set("page_size", String(limit));
  if (query) url.searchParams.set("query", query);
  if (opts.brand) url.searchParams.set("brand", opts.brand);
  if (opts.inStock) url.searchParams.set("has_stock", "true");
  if (opts.minPrice != null) url.searchParams.set("from_price", String(opts.minPrice));
  if (opts.maxPrice != null) url.searchParams.set("to_price", String(opts.maxPrice));
  const json = await getJson(url);
  const items = json?.data?.products?.items;
  if (!Array.isArray(items)) throw new Error("Unexpected Khanoumi product list");
  return items.filter((item) => khanoumiKeeps(item, query, opts.brand)).map(khanoumiCard);
}

export async function searchShop(shopId, query, limit, opts = {}) {
  const shop = SHOPS.find((s) => s.id === shopId);
  if (!shop) throw new Error(`Unknown shop: ${shopId}`);
  const narrowed = opts.inStock || opts.brand || opts.minPrice != null || opts.maxPrice != null;
  const fetchLimit = shop.id === "khanoumi" || narrowed ? Math.min(20, Math.max(limit, limit * 4)) : limit;
  const cards = shop.id === "khanoumi"
    ? await searchKhanoumi(query, fetchLimit, opts)
    : await searchWoo(shop, query, fetchLimit, opts);
  return cards.filter((card) => {
    if (opts.inStock && !card.in_stock) return false;
    if (opts.minPrice != null || opts.maxPrice != null) return withinBudget(card, opts.minPrice, opts.maxPrice);
    return true;
  }).slice(0, limit);
}

export async function productDetails(shopId, id) {
  const shop = SHOPS.find((s) => s.id === shopId);
  if (!shop) throw new Error(`Unknown shop: ${shopId}`);
  if (shop.id === "khanoumi") {
    const url = new URL(`/api/ntl/v1/products/slug/${encodeURIComponent(id)}`, shop.site);
    const json = await getJson(url);
    const item = json?.data;
    if (!item?.slug) throw new Error("Product not found");
    return khanoumiCard(item);
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
