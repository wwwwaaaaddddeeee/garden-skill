import gradient from 'gradient-string'

// ASCII art is rendered with `0` glyphs to preserve grid spacing.
// Lines are kept verbatim from the source file.
const ART = String.raw`          000000000000000
       000000000000000000000              00000             00000
    00000000000   000000000000           000000             00000
   0000000000         0000000000        0000000           0000000
  000000000            0000000000    000000000000000   000000000000000           0000000000
 0000000000             0000000000 0000000000000000000000000000000000000     000000000000000000
0000000000              0000000000 000000000000000000000000000000000000    0000000000000000000000
0000000000              00000000000   000000000         000000000         000000000     0000000000
0000000000               0000000000   000000000         000000000        000000000        000000000
0000000000               0000000000   000000000         000000000       000000000         0000000000
0000000000               0000000000   000000000         000000000       000000000          000000000
0000000000               0000000000   000000000         000000000       000000000          000000000
0000000000              0000000000    000000000         000000000       000000000          000000000
 0000000000             0000000000    000000000         000000000       000000000          000000000
  0000000000           0000000000     000000000         000000000       0000000000        0000000000
   0000000000         0000000000      0000000000   0000 0000000000   00000000000000       000000000
    000000000000000000000000000       00000000000000000  0000000000000000 0000000000    000000000
      0000000000000000000000           000000000000000   000000000000000    00000000000000000000
         0000000000000000                0000000000        00000000000         00000000000000       `

// Compress 2 source rows into 1 terminal row using ▀ (upper half),
// ▄ (lower half), █ (full), and space. Halves vertical height while
// preserving the silhouette.
function halfBlockCompress(art: string): string {
  const rows = art.split('\n')
  const out: string[] = []
  for (let i = 0; i < rows.length; i += 2) {
    const top = rows[i] ?? ''
    const bottom = rows[i + 1] ?? ''
    const width = Math.max(top.length, bottom.length)
    let line = ''
    for (let j = 0; j < width; j++) {
      const t = top[j] === '0'
      const b = bottom[j] === '0'
      if (t && b) line += '█'
      else if (t) line += '▀'
      else if (b) line += '▄'
      else line += ' '
    }
    out.push(line.replace(/\s+$/, ''))
  }
  return out.join('\n')
}

export function renderBanner(version: string): string {
  const compressed = halfBlockCompress(ART)
  const gradientArt = gradient(['#22c55e', '#84cc16', '#0ea5e9']).multiline(compressed)
  const tagline = gradient(['#84cc16', '#0ea5e9'])('  design reference library for any AI agent')
  const meta = `\n  v${version}  ·  @useotto/garden  ·  https://ot-to.org/skills/garden\n`
  return `\n${gradientArt}\n\n${tagline}\n${meta}`
}

export function printHelp(version: string): void {
  process.stdout.write(renderBanner(version))
  process.stdout.write(`
  Usage
    $ garden-skill                    Run the MCP server (stdio)
    $ npx @useotto/garden --help      Show this help

  Environment
    GARDEN_DB     Path to SQLite file (default: ~/.garden/garden.sqlite3)
    GARDEN_ROOT   Default folder for garden_scan

  MCP tools
    garden_scan, garden_stats, garden_list_pending, garden_save_tags,
    garden_search, garden_find_similar, garden_get

  Drop into your agent's MCP config:

    {
      "mcpServers": {
        "garden": {
          "command": "npx",
          "args": ["-y", "@useotto/garden"],
          "env": {
            "GARDEN_DB":   "/absolute/path/to/garden.sqlite3",
            "GARDEN_ROOT": "/absolute/path/to/your/images"
          }
        }
      }
    }

`)
}
