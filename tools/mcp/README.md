# Govviz Open Data — reference MCP server

The **open agent interface** (M5) over the Govviz AI-ready open-data catalogue —
the "open *agent* standard on top of open *data* standards" layer from the
[*Agentic Open Data*](../../docs/blog-open-data-for-ai.md) essay (Phase 4).

It is a zero-dependency [Model Context Protocol](https://modelcontextprotocol.io)
server speaking newline-delimited JSON-RPC 2.0 over stdio. It serves the
**published** catalogue (no local data needed), so it demonstrates the key
property the essay argues for: because the data underneath is independently
usable via DCAT/CSVW/tidy CSV, the agent layer carries **no lock-in** — swap the
interface, keep the data.

## Tools

| Tool | Purpose |
|---|---|
| `list_series` | List every series (`id`, `title`, `periodicity`). |
| `get_series_metadata` | The full AI-ready record for an id: unit, coverage, periodicity, revision status, provenance, licence, and the **`validRange`** a consumer uses to reject a wrong-but-plausible value. |
| `get_observations` | The tidy observations for an id: `{period,value,unit,unit_multiplier,status}`. Base-unit value = `value × 10^unit_multiplier`. |

## Run

```bash
node tools/mcp/govviz-mcp.mjs
```

By default it reads `https://egly443.github.io/Govviz/data`. Point it elsewhere
(e.g. a local `vite preview` of `dist/`) with:

```bash
GOVVIZ_DATA_BASE=http://localhost:4173/Govviz/data node tools/mcp/govviz-mcp.mjs
```

## Wire into an MCP client

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "govviz": {
      "command": "node",
      "args": ["/absolute/path/to/Govviz/tools/mcp/govviz-mcp.mjs"]
    }
  }
}
```

Then ask, e.g., *"Using govviz, what were England's storm-overflow spill hours,
and is the latest value inside its published validRange?"* — the agent resolves
the series, reads the tidy data, and honours the guard, with no scraping.

> Reference interface: it runs locally against the live published data; Govviz
> is a static site and does not host the server itself. Hosting is an
> infrastructure choice, not a data-standard one — which is exactly the point.
