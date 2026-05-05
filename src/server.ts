#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/client.js";
import { scanFolder } from "./lib/scan.js";
import { search, findSimilar } from "./lib/search.js";
import { saveTags, TagsInputSchema } from "./lib/tags.js";
import { listPending, getStats } from "./lib/pending.js";
import { printHelp, renderBanner } from "./banner.js";

const VERSION = "0.1.4";

// CLI flags. If matched, print and exit before starting the MCP server
// (printing to stdout would corrupt the MCP stdio protocol).
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  printHelp(VERSION);
  process.exit(0);
}
if (argv.includes("--version") || argv.includes("-v")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}
if (argv.includes("--banner")) {
  process.stdout.write(renderBanner(VERSION));
  process.exit(0);
}

const config = loadConfig();
const db = openDb(config.dbPath);

const server = new Server(
  { name: "garden-skill", version: VERSION },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "garden_scan",
    description:
      "Scan a folder of images and register them in the Garden library. " +
      "Extracts dimensions, perceptual hash, and color palette for each image. " +
      "Reads gallery-dl JSON sidecars if present. Idempotent — re-run anytime.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the folder to scan. Defaults to GARDEN_ROOT env var if set.",
        },
        recursive: { type: "boolean", description: "Recurse into subdirectories. Default true." },
        extract_colors: { type: "boolean", description: "Extract color palettes. Default true." },
      },
    },
  },
  {
    name: "garden_stats",
    description: "Return library counts: total images, enriched, pending, with palette.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "garden_list_pending",
    description:
      "Return images that have not yet been tagged. Use this to drive the enrichment loop: " +
      "call this, look at each image with vision, then call garden_save_tags. " +
      "Set with_image_data=true to receive base64 data URLs ready for vision input.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max images to return. Default 5." },
        with_image_data: {
          type: "boolean",
          description: "Include base64 data URL of each image (for direct vision use). Default false.",
        },
      },
    },
  },
  {
    name: "garden_save_tags",
    description:
      "Save structured tags for an image after a vision pass. " +
      "Marks image as enriched. See SKILL.md for the full tag schema.",
    inputSchema: {
      type: "object",
      required: ["image_id", "tags"],
      properties: {
        image_id: { type: "number" },
        tags: {
          type: "object",
          description:
            "Structured tags. Required: classification (e.g. 'ui_screenshot', 'photography', 'non_ui'). " +
            "Optional: ui_type, components[], sections[], layout{}, typography{}, color_scheme, " +
            "effects[], use_cases[], search_keywords[], notes, confidence, palette_roles{}.",
        },
      },
    },
  },
  {
    name: "garden_search",
    description:
      "Search the library with optional text query (FTS over tags & captions) and structured filters. " +
      "Use this to answer questions like 'find dark dashboards with lime accents'.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional FTS query. Supports MATCH syntax." },
        classification: { type: ["string", "array"], description: "Filter by top-level classification(s)." },
        ui_type: { type: ["string", "array"], description: "Filter by ui_type." },
        color_scheme: { type: ["string", "array"], description: "e.g. 'dark', 'light'." },
        use_case: { type: ["string", "array"], description: "Filter by use_cases tag." },
        has_palette_hex: { type: "string", description: "Hex color the image's palette must contain." },
        hex_tolerance: { type: "number", description: "RGB euclidean tolerance for has_palette_hex. Default 28." },
        min_width: { type: "number" },
        min_height: { type: "number" },
        enriched_only: { type: "boolean" },
        pending_only: { type: "boolean" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "garden_find_similar",
    description:
      "Find visually similar images by perceptual hash. Returns nearest neighbors by hamming distance.",
    inputSchema: {
      type: "object",
      required: ["image_id"],
      properties: {
        image_id: { type: "number" },
        limit: { type: "number", description: "Default 12." },
      },
    },
  },
  {
    name: "garden_get",
    description: "Return the full record for one image by id.",
    inputSchema: {
      type: "object",
      required: ["image_id"],
      properties: { image_id: { type: "number" } },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      case "garden_scan": {
        const path = (args.path as string) || config.defaultRoot;
        if (!path) throw new Error("No path provided and GARDEN_ROOT is not set.");
        const result = await scanFolder(db, path, {
          recursive: args.recursive !== false,
          extractColors: args.extract_colors !== false,
        });
        return jsonResult(result);
      }
      case "garden_stats":
        return jsonResult(getStats(db));
      case "garden_list_pending": {
        const items = await listPending(db, (args.limit as number) ?? 5, {
          withImageData: args.with_image_data === true,
        });
        return jsonResult(items);
      }
      case "garden_save_tags": {
        const id = args.image_id as number;
        const tags = TagsInputSchema.parse(args.tags);
        saveTags(db, id, tags);
        return jsonResult({ ok: true, image_id: id });
      }
      case "garden_search":
        return jsonResult(search(db, args.query as string | undefined, args as any));
      case "garden_find_similar":
        return jsonResult(findSimilar(db, args.image_id as number, (args.limit as number) ?? 12));
      case "garden_get": {
        const id = args.image_id as number;
        const row = db.prepare(`SELECT * FROM v_images WHERE id = ?`).get(id);
        if (!row) throw new Error(`No image with id ${id}`);
        const palette = db
          .prepare(`SELECT hex, oklch, population, role FROM image_palette WHERE image_id = ? ORDER BY position`)
          .all(id);
        return jsonResult({ ...row, palette });
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

function jsonResult(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);
