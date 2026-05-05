import type { DB } from "../db/client.js";
import { z } from "zod";

const ComponentSchema = z.object({
  type: z.string(),
  variant: z.string().optional(),
  notes: z.string().optional(),
});

const TypographyRoleSchema = z.object({
  family_guess: z.string().optional(),
  characteristics: z.string().optional(),
  weight: z.string().optional(),
  style: z.string().optional(),
});

export const TagsInputSchema = z.object({
  classification: z.string(),
  ui_type: z.string().nullable().optional(),
  components: z.array(ComponentSchema).optional(),
  sections: z.array(z.string()).optional(),
  layout: z
    .object({
      pattern: z.string().optional(),
      density: z.string().optional(),
      hierarchy: z.string().optional(),
    })
    .optional(),
  typography: z
    .object({
      headline: TypographyRoleSchema.optional(),
      body: TypographyRoleSchema.optional(),
      mono: TypographyRoleSchema.optional(),
      pairing: z.string().optional(),
    })
    .optional(),
  color_scheme: z.string().nullable().optional(),
  effects: z.array(z.string()).optional(),
  use_cases: z.array(z.string()).optional(),
  search_keywords: z.array(z.string()).optional(),
  notes: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  // optional palette role assignment (matches positions in image_palette)
  palette_roles: z.record(z.string(), z.string()).optional(),
  enriched_by: z.string().optional(),
});

export type TagsInput = z.infer<typeof TagsInputSchema>;

export function saveTags(db: DB, imageId: number, input: TagsInput) {
  const parsed = TagsInputSchema.parse(input);

  const upsert = db.prepare(`
    INSERT INTO image_tags (
      image_id, classification, ui_type, components, sections, layout,
      typography, color_scheme, effects, use_cases, search_keywords, notes,
      confidence, raw_json
    )
    VALUES (
      @image_id, @classification, @ui_type, @components, @sections, @layout,
      @typography, @color_scheme, @effects, @use_cases, @search_keywords, @notes,
      @confidence, @raw_json
    )
    ON CONFLICT(image_id) DO UPDATE SET
      classification = excluded.classification,
      ui_type = excluded.ui_type,
      components = excluded.components,
      sections = excluded.sections,
      layout = excluded.layout,
      typography = excluded.typography,
      color_scheme = excluded.color_scheme,
      effects = excluded.effects,
      use_cases = excluded.use_cases,
      search_keywords = excluded.search_keywords,
      notes = excluded.notes,
      confidence = excluded.confidence,
      raw_json = excluded.raw_json
  `);

  const j = (v: unknown) => (v == null ? null : JSON.stringify(v));

  upsert.run({
    image_id: imageId,
    classification: parsed.classification,
    ui_type: parsed.ui_type ?? null,
    components: j(parsed.components),
    sections: j(parsed.sections),
    layout: j(parsed.layout),
    typography: j(parsed.typography),
    color_scheme: parsed.color_scheme ?? null,
    effects: j(parsed.effects),
    use_cases: j(parsed.use_cases),
    search_keywords: j(parsed.search_keywords),
    notes: parsed.notes ?? null,
    confidence: parsed.confidence ?? null,
    raw_json: JSON.stringify(parsed),
  });

  // Update FTS
  db.prepare(`DELETE FROM images_fts WHERE rowid = ?`).run(imageId);
  const altRow = db
    .prepare(`SELECT source_alt FROM image_source WHERE image_id = ?`)
    .get(imageId) as { source_alt: string | null } | undefined;
  db.prepare(
    `INSERT INTO images_fts (rowid, classification, ui_type, components, sections, layout, typography, use_cases, search_keywords, notes, source_alt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    imageId,
    parsed.classification ?? "",
    parsed.ui_type ?? "",
    flat(parsed.components?.map((c) => `${c.type} ${c.variant ?? ""} ${c.notes ?? ""}`)),
    flat(parsed.sections),
    flat(Object.values(parsed.layout ?? {})),
    typographyText(parsed.typography),
    flat(parsed.use_cases),
    flat(parsed.search_keywords),
    parsed.notes ?? "",
    altRow?.source_alt ?? ""
  );

  // Mark enriched
  db.prepare(`UPDATE images SET enriched_at = ?, enriched_by = ? WHERE id = ?`).run(
    Date.now(),
    parsed.enriched_by ?? "agent",
    imageId
  );

  // Optional: update palette roles
  if (parsed.palette_roles) {
    const update = db.prepare(`UPDATE image_palette SET role = ? WHERE image_id = ? AND position = ?`);
    for (const [pos, role] of Object.entries(parsed.palette_roles)) {
      update.run(role, imageId, Number(pos));
    }
  }
}

function flat(v: (string | undefined)[] | undefined): string {
  if (!v) return "";
  return v.filter(Boolean).join(" ");
}

function typographyText(t: TagsInput["typography"]): string {
  if (!t) return "";
  const parts: string[] = [];
  for (const role of ["headline", "body", "mono"] as const) {
    const r = t[role];
    if (r) parts.push(r.family_guess ?? "", r.characteristics ?? "", r.weight ?? "", r.style ?? "");
  }
  if (t.pairing) parts.push(t.pairing);
  return parts.filter(Boolean).join(" ");
}
