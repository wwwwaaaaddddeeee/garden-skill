# Garden Skill

> An Otto skill. Turn any folder of images into a searchable, design-focused reference library — usable from Claude Code, Cursor, Claude Desktop, or any MCP-compatible AI agent.

## What it does

Garden gives your AI agent the ability to:

- **Scan** a folder of images and register them in a local SQLite library
- **Extract** color palettes (hex + OKLCH) deterministically — no LLM, no API key
- **Tag** each image (via the agent's own vision capability) with structured design metadata: components, sections, layout, typography, color scheme, use cases
- **Search** by text, filter, color, or visual similarity
- Read **gallery-dl JSON sidecars**, so a Pinterest dump just works

The library lives entirely on the user's machine. No SaaS, no account, no shared compute. The agent does the vision work using whatever model it already has.

## Install

### Claude Desktop / Claude Code

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop) or `~/.claude/mcp.json` (Claude Code):

```json
{
  "mcpServers": {
    "garden": {
      "command": "npx",
      "args": ["-y", "@useotto/garden"],
      "env": {
        "GARDEN_DB": "/absolute/path/to/garden.sqlite3",
        "GARDEN_ROOT": "/absolute/path/to/your/images"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "garden": {
      "command": "npx",
      "args": ["-y", "@useotto/garden"],
      "env": { "GARDEN_DB": "...", "GARDEN_ROOT": "..." }
    }
  }
}
```

Restart your client. The agent now has Garden's tools.

## Usage

Once installed, just talk to your agent:

> "Garden, scan my references folder."
>
> "Tag the next 20 unprocessed images."
>
> "Find me dark dashboards with a lime accent."
>
> "What pricing pages do I have that use serif headlines?"
>
> "Show me visually similar things to image 482."

The agent picks the right tools and looping behavior automatically, guided by the bundled `SKILL.md`.

## Configuration

| Env var       | Purpose                                                          |
| ------------- | ---------------------------------------------------------------- |
| `GARDEN_DB`   | Path to the SQLite file. Default: `~/.garden/garden.sqlite3`     |
| `GARDEN_ROOT` | Default folder for `garden_scan` if no path is provided          |

## Tools

| Tool                    | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `garden_scan`           | Walk a folder, register images, extract palettes         |
| `garden_stats`          | Counts: total / enriched / pending                       |
| `garden_list_pending`   | Get untagged images (optionally with base64 data URLs)   |
| `garden_save_tags`      | Save structured tags after a vision pass                 |
| `garden_search`         | FTS + filter search                                      |
| `garden_find_similar`   | Perceptual-hash nearest neighbors                        |
| `garden_get`            | Full record for one image                                |

See [SKILL.md](./SKILL.md) for the full tag schema and agent guidance.

## Tag schema

Garden stores rich, structured metadata per image:

- `classification` — `ui_screenshot`, `photography`, `branding_identity`, `non_ui`, etc.
- `ui_type` — `mobile_app`, `web_app`, `dashboard`, …
- `components[]` — `{type, variant, notes}` per UI element
- `sections[]` — `hero`, `pricing-table`, `testimonial-carousel`, …
- `layout{}` — `pattern`, `density`, `hierarchy`
- `typography{}` — characteristics for headline / body / mono, plus pairing
- `color_scheme` — `light`, `dark`, `high-contrast`, `duotone`, …
- `effects[]` — `gradient-mesh`, `noise-grain`, `frosted-glass`, …
- `use_cases[]` — `pricing-page`, `onboarding-step`, `checkout`, …
- `search_keywords[]` — agent-generated phrases the user might actually type
- `palette[]` — extracted automatically; agent can assign `roles` (background/accent/text/…)

## Local development

```bash
pnpm install        # or npm i
pnpm build
pnpm start          # runs the MCP server over stdio (for testing)
```

To use the locally-built version in your MCP client, point `command` at `node` and `args` at the absolute path to `dist/server.js`.

## Status

Early. Schema is stable; extraction quality and search ergonomics will keep improving. Contributions welcome.
