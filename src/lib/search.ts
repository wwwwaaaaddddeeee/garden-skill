import type { DB } from "../db/client.js";
import { phashDistance } from "./phash.js";

export interface SearchFilters {
  classification?: string | string[];
  ui_type?: string | string[];
  color_scheme?: string | string[];
  use_case?: string | string[];
  has_palette_hex?: string;     // match if any palette color is within tolerance
  hex_tolerance?: number;        // default 28 (RGB euclidean)
  min_width?: number;
  min_height?: number;
  enriched_only?: boolean;
  pending_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchHit {
  id: number;
  path: string;
  width: number;
  height: number;
  classification: string | null;
  ui_type: string | null;
  color_scheme: string | null;
  source_url: string | null;
  source_alt: string | null;
  palette: { hex: string; oklch: string; population: number; role: string | null }[];
  rank?: number;
}

export function search(
  db: DB,
  query: string | undefined,
  filters: SearchFilters = {}
): SearchHit[] {
  const {
    limit = 30,
    offset = 0,
    enriched_only = false,
    pending_only = false,
    min_width,
    min_height,
  } = filters;

  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (enriched_only) where.push("i.enriched_at IS NOT NULL");
  if (pending_only) where.push("i.enriched_at IS NULL");
  if (min_width) { where.push("i.width >= @min_width"); params.min_width = min_width; }
  if (min_height) { where.push("i.height >= @min_height"); params.min_height = min_height; }

  pushIn(where, params, "t.classification", filters.classification, "classification");
  pushIn(where, params, "t.ui_type", filters.ui_type, "ui_type");
  pushIn(where, params, "t.color_scheme", filters.color_scheme, "color_scheme");
  // use_case is JSON array — naive LIKE match per value
  if (filters.use_case) {
    const arr = Array.isArray(filters.use_case) ? filters.use_case : [filters.use_case];
    arr.forEach((v, idx) => {
      where.push(`t.use_cases LIKE @uc${idx}`);
      params[`uc${idx}`] = `%"${v}"%`;
    });
  }

  let rows: any[];

  if (query && query.trim()) {
    params.q = query.trim();
    where.push(`i.id IN (SELECT rowid FROM images_fts WHERE images_fts MATCH @q)`);
    const sql = `
      SELECT i.id, i.path, i.width, i.height,
             t.classification, t.ui_type, t.color_scheme,
             s.source_url, s.source_alt,
             bm25(images_fts) AS rank
      FROM images i
      LEFT JOIN image_tags t ON t.image_id = i.id
      LEFT JOIN image_source s ON s.image_id = i.id
      LEFT JOIN images_fts ON images_fts.rowid = i.id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY rank
      LIMIT @limit OFFSET @offset
    `;
    params.limit = limit;
    params.offset = offset;
    rows = db.prepare(sql).all(params);
  } else {
    const sql = `
      SELECT i.id, i.path, i.width, i.height,
             t.classification, t.ui_type, t.color_scheme,
             s.source_url, s.source_alt
      FROM images i
      LEFT JOIN image_tags t ON t.image_id = i.id
      LEFT JOIN image_source s ON s.image_id = i.id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY i.scanned_at DESC
      LIMIT @limit OFFSET @offset
    `;
    params.limit = limit;
    params.offset = offset;
    rows = db.prepare(sql).all(params);
  }

  // Optional palette-hex filter (post-query)
  let hits = rows;
  if (filters.has_palette_hex) {
    const target = hexToRgb(filters.has_palette_hex);
    const tol = filters.hex_tolerance ?? 28;
    if (target) {
      const matchPalette = db.prepare(`SELECT hex FROM image_palette WHERE image_id = ?`);
      hits = rows.filter((r) => {
        const palette = matchPalette.all(r.id) as { hex: string }[];
        return palette.some((p) => {
          const c = hexToRgb(p.hex);
          return c && rgbDist(c, target) <= tol;
        });
      });
    }
  }

  const palStmt = db.prepare(`
    SELECT hex, oklch, population, role
    FROM image_palette
    WHERE image_id = ?
    ORDER BY position
  `);

  return hits.map((r) => ({
    id: r.id,
    path: r.path,
    width: r.width,
    height: r.height,
    classification: r.classification,
    ui_type: r.ui_type,
    color_scheme: r.color_scheme,
    source_url: r.source_url,
    source_alt: r.source_alt,
    palette: palStmt.all(r.id) as SearchHit["palette"],
    rank: r.rank,
  }));
}

export interface SimilarHit extends SearchHit {
  distance: number;
}

export function findSimilar(db: DB, imageId: number, limit = 12): SimilarHit[] {
  const target = db.prepare(`SELECT phash FROM images WHERE id = ?`).get(imageId) as
    | { phash: string | null }
    | undefined;
  if (!target?.phash) return [];

  const all = db.prepare(`SELECT id, phash FROM images WHERE phash IS NOT NULL AND id != ?`).all(imageId) as
    { id: number; phash: string }[];

  const scored = all
    .map((r) => ({ id: r.id, distance: phashDistance(target.phash!, r.phash) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  if (!scored.length) return [];

  const placeholders = scored.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
        SELECT i.id, i.path, i.width, i.height,
               t.classification, t.ui_type, t.color_scheme,
               s.source_url, s.source_alt
        FROM images i
        LEFT JOIN image_tags t ON t.image_id = i.id
        LEFT JOIN image_source s ON s.image_id = i.id
        WHERE i.id IN (${placeholders})
      `
    )
    .all(...scored.map((s) => s.id)) as any[];

  const palStmt = db.prepare(
    `SELECT hex, oklch, population, role FROM image_palette WHERE image_id = ? ORDER BY position`
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  return scored.map(({ id, distance }) => {
    const r = byId.get(id);
    return {
      id,
      distance,
      path: r?.path ?? "",
      width: r?.width ?? 0,
      height: r?.height ?? 0,
      classification: r?.classification ?? null,
      ui_type: r?.ui_type ?? null,
      color_scheme: r?.color_scheme ?? null,
      source_url: r?.source_url ?? null,
      source_alt: r?.source_alt ?? null,
      palette: palStmt.all(id) as SearchHit["palette"],
    };
  });
}

function pushIn(
  where: string[],
  params: Record<string, unknown>,
  col: string,
  val: string | string[] | undefined,
  paramName: string
) {
  if (val == null) return;
  const arr = Array.isArray(val) ? val : [val];
  if (!arr.length) return;
  const placeholders = arr.map((_, i) => `@${paramName}_${i}`);
  arr.forEach((v, i) => (params[`${paramName}_${i}`] = v));
  where.push(`${col} IN (${placeholders.join(",")})`);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
