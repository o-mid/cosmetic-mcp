# Cosmetic MCP

Read-only MCP server for four Iranian cosmetics shops. One search asks each shop and returns product cards with the price in Toman and a link to the product page. No API key. Nothing is written back to any shop.

This project is not affiliated with آرا دخت, مولیان, نازی شو, or خانومی.

## Shops

| Id | Shop | What is searched |
|---|---|---|
| `aradokht` | [آرا دخت](https://aradokht.net/) | The shop catalog |
| `mouliyan` | [مولیان](https://mouliyan.com/) | The shop catalog |
| `nazisho` | [نازی شو](https://nazisho.com/) | The shop catalog |
| `khanoumi` | [خانومی](https://www.khanoumi.com/) | The whole catalog. `brand` narrows it, for example `sheglam` |

آرا دخت, مولیان, and نازی شو are WooCommerce stores. Their public Store API is what this server reads. خانومی is a different site. A search there covers the whole catalog. Pass `brand: "sheglam"` when you only want that brand.

## Use it

The server is already running. Add this URL in your agent. No API key, no install.

```
https://cosmetic-mcp-production.up.railway.app/mcp
```

`GET https://cosmetic-mcp-production.up.railway.app/health` returns the version.

### Cursor

Open Cursor Settings, then MCP, and add a new server. Or put this in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cosmetics": {
      "url": "https://cosmetic-mcp-production.up.railway.app/mcp"
    }
  }
}
```

Save and reload. Cosmetics should show up under MCP tools.

### Claude

On claude.ai or Claude Desktop: Customize, then Connectors, then Add custom connector. Paste the URL. Leave OAuth empty. This server has no login.

In Claude Code:

```bash
claude mcp add --transport http cosmetics https://cosmetic-mcp-production.up.railway.app/mcp
```

### ChatGPT

Open Settings, then Apps (or Connectors). Turn on Developer mode under Advanced. Create a connector, name it Cosmetics, paste the URL, and choose no authentication. In a new chat, enable that connector before you ask.

### Run it yourself

Node.js 18 or newer.

```bash
npm start
```

That listens on `PORT` (default 8787). MCP clients post JSON-RPC to `/mcp`.

For a desktop client that starts a process, set the working directory to this repo:

```json
{
  "mcpServers": {
    "cosmetics": {
      "command": "node",
      "args": ["src/index.js"]
    }
  }
}
```

Then ask in normal language. "Sheglam blush under 2 million toman" is enough. The agent picks the shop and the tool.

## Tools

| Tool | What it answers |
|---|---|
| `list_shops` | The four shops and what each one covers |
| `search_cosmetics` | Cards from every shop, or one shop if you pass `shop`. Optional `brand` (Khanoumi), `min_price`, `max_price`, `in_stock`. `limit` is per shop, max 10 |
| `find_best_price` | The same search, in-stock cards only, cheapest Toman price first |
| `product_details` | One product. `id` is the WooCommerce id, or the Khanoumi slug from search |

A card has `shop`, `title`, `price_toman`, `regular_price_toman`, `on_sale`, `in_stock`, and `url`. Prices are the numbers the shop is showing, in Toman. If one shop fails, the others still come back, and that shop has an `error` field.

Nothing is stored as a product database. A response stays in memory for 3 minutes. Calls to the shops are spaced 400ms apart. This server does not walk a whole catalog on a schedule.

## Check

```bash
npm start
node scripts/verify.mjs
```
