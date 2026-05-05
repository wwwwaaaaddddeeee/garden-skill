---
name: garden
description: Turn any folder of images into a searchable, design-focused reference library. Scan, tag with vision, and search by component, color, typography, or use case.
version: 0.1.0
---

# Garden Skill

You can use the Garden Skill MCP server to build and query a personal design reference library. The user has (or will have) a folder of images on disk; your job is to scan it, tag each image with structured metadata via your vision capability, and answer search queries.

## Tools

- `garden_scan(path?, recursive?, extract_colors?)` — register images from a folder
- `garden_stats()` — counts: total / enriched / pending
- `garden_list_pending(limit?, with_image_data?)` — fetch untagged images for the enrichment loop
- `garden_save_tags(image_id, tags)` — write structured tags after a vision pass
- `garden_search(query?, filters)` — search the library
- `garden_find_similar(image_id, limit?)` — perceptual-hash nearest neighbors
- `garden_get(image_id)` — one full record

## When to use this skill

- The user asks you to **build, scan, or update** their reference library: call `garden_scan`, then loop `garden_list_pending` → vision → `garden_save_tags` until pending hits zero.
- The user asks for **design references** ("find me dark dashboards with a lime accent", "what do I have for pricing pages", "show me serif headlines"): call `garden_search` with the most relevant filters and a freeform query.
- The user shows you an image and asks for **similar things**: scan that image with `garden_scan`, get its id from the result or via `garden_get`, then call `garden_find_similar`.

## Tag schema

When calling `garden_save_tags`, build the `tags` object using these fields. **Only `classification` is required.** Skip any field you can't determine confidently — better to leave blank than guess.

```json
{
  "classification": "ui_screenshot | ui_concept | design_system_doc | typography_specimen | editorial_print | poster_graphic | branding_identity | illustration | photography | motion_still | 3d_render | data_viz | ux_diagram | physical_product | meme_misc | non_ui",
  "ui_type": "mobile_app | web_app | website | landing | dashboard | email | other",
  "components": [
    { "type": "button", "variant": "ghost", "notes": "rounded-full, mono label" }
  ],
  "sections": ["hero", "feature-grid", "pricing-table"],
  "layout": {
    "pattern": "asymmetric-split | bento | sidebar-list | full-bleed-hero",
    "density": "dense | airy | whitespace-heavy",
    "hierarchy": "dominant-headline | equal-weight | progressive-disclosure"
  },
  "typography": {
    "headline": {
      "family_guess": "leave blank if not obvious",
      "characteristics": "geometric-sans, tight-tracking, heavy weight",
      "weight": "800",
      "style": "all-caps"
    },
    "body": { "characteristics": "humanist-sans, large-leading" },
    "pairing": "serif-display + sans-body"
  },
  "color_scheme": "light | dark | high-contrast | muted | monochrome | duotone",
  "effects": ["gradient-mesh", "noise-grain", "frosted-glass"],
  "use_cases": ["pricing-page", "settings-modal", "onboarding-step"],
  "search_keywords": ["dark dashboard", "lime accent", "data-table"],
  "notes": "freeform; useful when something interesting doesn't fit the schema",
  "confidence": "high | medium | low",
  "palette_roles": { "0": "background", "1": "accent", "2": "text" },
  "enriched_by": "claude-haiku-4-5"
}
```

## Important guidance

- **Use the `non_ui` classification** for photos, illustrations, posters, etc. — most pin libraries are mixed. Don't force UI schemas onto non-UI images. Just set `classification: "non_ui"`, optionally `notes`, and move on.
- **Don't guess font families.** Identifying fonts from images is hard and you will be wrong. Describe characteristics instead. Only fill `family_guess` if a wordmark / specimen sheet makes it unambiguous.
- **Palette is already extracted** before you see the image. Use the included `palette` field to ground color descriptions and assign roles via `palette_roles` (keys are positions 0–N, values are role names).
- **Be terse in `notes`.** This is searchable text, not an essay.
- **`search_keywords` are gold** — populate them with phrases the user might actually type ("dark dashboard, lime accent, data-table"). They drive search relevance.

## Typical enrichment loop

```
loop:
  pending = garden_list_pending(limit=5, with_image_data=true)
  if pending is empty: break
  for image in pending:
    look at image (vision)
    tags = build_tags(image)
    garden_save_tags(image.id, tags)
  show progress; continue
```

## Configuration

Set `GARDEN_DB` (path to SQLite file) and optionally `GARDEN_ROOT` (default folder for `garden_scan`). Defaults: `~/.garden/garden.sqlite3`.
