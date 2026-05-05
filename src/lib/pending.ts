import { readFile } from "node:fs/promises";
import type { DB } from "../db/client.js";

export interface PendingImage {
  id: number;
  path: string;
  width: number;
  height: number;
  format: string;
  source_url: string | null;
  source_alt: string | null;
  palette: { hex: string; oklch: string; population: number }[];
  data_url?: string;
}

/**
 * Returns up to `limit` images that haven't been tagged yet.
 * If `withImageData` is true, also returns a base64 data URL for vision input.
 */
export async function listPending(
  db: DB,
  limit = 5,
  opts: { withImageData?: boolean; classificationFilter?: string } = {}
): Promise<PendingImage[]> {
  const rows = db
    .prepare(
      `
        SELECT i.id, i.path, i.width, i.height, i.format,
               s.source_url, s.source_alt
        FROM images i
        LEFT JOIN image_source s ON s.image_id = i.id
        LEFT JOIN image_tags t ON t.image_id = i.id
        WHERE i.enriched_at IS NULL
        ORDER BY i.scanned_at ASC
        LIMIT ?
      `
    )
    .all(limit) as any[];

  const palStmt = db.prepare(
    `SELECT hex, oklch, population FROM image_palette WHERE image_id = ? ORDER BY position`
  );

  const out: PendingImage[] = [];
  for (const r of rows) {
    const item: PendingImage = {
      id: r.id,
      path: r.path,
      width: r.width,
      height: r.height,
      format: r.format,
      source_url: r.source_url,
      source_alt: r.source_alt,
      palette: palStmt.all(r.id) as PendingImage["palette"],
    };
    if (opts.withImageData) {
      try {
        const buf = await readFile(r.path);
        const mime = formatToMime(r.format);
        item.data_url = `data:${mime};base64,${buf.toString("base64")}`;
      } catch {
        // skip if file went missing
      }
    }
    out.push(item);
  }
  return out;
}

function formatToMime(format: string): string {
  switch (format) {
    case "jpeg": return "image/jpeg";
    case "png":  return "image/png";
    case "webp": return "image/webp";
    case "gif":  return "image/gif";
    case "heic": return "image/heic";
    case "avif": return "image/avif";
    default:     return "application/octet-stream";
  }
}

export function getStats(db: DB): { total: number; enriched: number; pending: number; with_palette: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM images`).get() as any).n;
  const enriched = (db.prepare(`SELECT COUNT(*) AS n FROM images WHERE enriched_at IS NOT NULL`).get() as any).n;
  const with_palette = (db.prepare(`SELECT COUNT(DISTINCT image_id) AS n FROM image_palette`).get() as any).n;
  return { total, enriched, pending: total - enriched, with_palette };
}
