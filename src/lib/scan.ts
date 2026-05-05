import { readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { DB } from "../db/client.js";
import { extractPalette } from "./colors.js";
import { computePhash } from "./phash.js";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif"]);

export interface ScanResult {
  scanned: number;
  added: number;
  skipped: number;
  errors: { path: string; error: string }[];
}

export interface ScanOptions {
  recursive?: boolean;
  extractColors?: boolean;
  loadSidecar?: boolean;   // gallery-dl style: <image>.json next to or in metadata/
}

export async function scanFolder(
  db: DB,
  root: string,
  opts: ScanOptions = {}
): Promise<ScanResult> {
  const { recursive = true, extractColors = true, loadSidecar = true } = opts;

  const result: ScanResult = { scanned: 0, added: 0, skipped: 0, errors: [] };

  const files = await collectImages(root, recursive);

  const insertImage = db.prepare(`
    INSERT INTO images (path, sha256, width, height, format, file_size, phash, scanned_at)
    VALUES (@path, @sha256, @width, @height, @format, @file_size, @phash, @scanned_at)
    ON CONFLICT(path) DO NOTHING
    RETURNING id
  `);

  const insertSource = db.prepare(`
    INSERT INTO image_source (image_id, source, source_id, source_url, source_alt, source_json)
    VALUES (@image_id, @source, @source_id, @source_url, @source_alt, @source_json)
    ON CONFLICT(image_id) DO UPDATE SET
      source=excluded.source,
      source_id=excluded.source_id,
      source_url=excluded.source_url,
      source_alt=excluded.source_alt,
      source_json=excluded.source_json
  `);

  const insertPaletteRow = db.prepare(`
    INSERT INTO image_palette (image_id, position, hex, oklch, population)
    VALUES (?, ?, ?, ?, ?)
  `);

  const clearPalette = db.prepare(`DELETE FROM image_palette WHERE image_id = ?`);

  for (const file of files) {
    result.scanned++;
    try {
      const buf = await readFile(file);
      const sha256 = createHash("sha256").update(buf).digest("hex");
      const meta = await sharp(buf, { failOn: "none" }).metadata();
      if (!meta.width || !meta.height || !meta.format) {
        result.skipped++;
        continue;
      }
      const phash = await computePhash(buf).catch(() => null);
      const stats = await stat(file);

      const inserted = insertImage.get({
        path: file,
        sha256,
        width: meta.width,
        height: meta.height,
        format: meta.format,
        file_size: stats.size,
        phash,
        scanned_at: Date.now(),
      }) as { id: number } | undefined;

      if (!inserted) {
        result.skipped++;
        continue;
      }
      result.added++;

      if (loadSidecar) {
        const sidecar = await tryLoadSidecar(file);
        if (sidecar) {
          insertSource.run({
            image_id: inserted.id,
            source: sidecar.source ?? null,
            source_id: sidecar.source_id ?? null,
            source_url: sidecar.source_url ?? null,
            source_alt: sidecar.source_alt ?? null,
            source_json: sidecar.raw ?? null,
          });
        }
      }

      if (extractColors) {
        const palette = await extractPalette(buf).catch(() => null);
        if (palette && palette.length) {
          clearPalette.run(inserted.id);
          for (let i = 0; i < palette.length; i++) {
            const c = palette[i];
            insertPaletteRow.run(inserted.id, i, c.hex, c.oklch, c.population);
          }
        }
      }
    } catch (err) {
      result.errors.push({ path: file, error: (err as Error).message });
    }
  }

  return result;
}

async function collectImages(root: string, recursive: boolean): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        // Skip common noise / our own metadata folder
        if (e.name === "metadata" || e.name.startsWith(".")) continue;
        if (recursive) await walk(full);
      } else if (e.isFile()) {
        if (e.name.startsWith("._")) continue; // macOS resource forks
        if (IMAGE_EXTS.has(extname(e.name).toLowerCase())) out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

interface SidecarFields {
  source?: string;
  source_id?: string;
  source_url?: string;
  source_alt?: string;
  raw?: string;
}

// Looks for gallery-dl style metadata: either <image>.json next to file, or
// in a sibling `metadata/` directory.
async function tryLoadSidecar(imagePath: string): Promise<SidecarFields | null> {
  const candidates = [
    `${imagePath}.json`,
    join(dirname(imagePath), "metadata", `${basename(imagePath)}.json`),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const raw = await readFile(c, "utf8");
        const j = JSON.parse(raw);
        return {
          source: detectSource(j),
          source_id: stringField(j, ["id", "pin_id", "source_id"]),
          source_url: stringField(j, ["link", "source_url", "url"])
            ?? (j.seo_url ? `https://www.pinterest.com${j.seo_url}` : undefined),
          source_alt: stringField(j, ["auto_alt_text", "alt_text", "description", "grid_title", "title"]),
          raw,
        };
      } catch {
        return null;
      }
    }
  }
  return null;
}

function detectSource(j: any): string | undefined {
  if (j?.category === "pinterest" || j?.pinner) return "pinterest";
  if (j?.subcategory) return String(j.subcategory);
  if (j?.category) return String(j.category);
  return undefined;
}

function stringField(j: any, keys: string[]): string | undefined {
  for (const k of keys) {
    if (j && typeof j[k] === "string" && j[k].length > 0) return j[k];
  }
  return undefined;
}
