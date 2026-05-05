import gradient from 'gradient-string'

const ART = String.raw`######                                                #####
     #############      ###       ##                      #############
   #####      #####    ####     ####                       ####    ####
  #####        ##### ##################   #########        ####    ####
  #####        #####  #####     ####    ####    #####      ############
  #####        #####  #####     ####   #####    #####   ##    #####     #
  #####        #####  #####     ####   #####    #####   ######      #####
   #####      #####   #####     ####    ####    #####    #######  ######
     ############     ######### ######## ##########       ###### ######
         ####            ###      ###       ####             ########`

export function renderBanner(version: string): string {
  const gradientArt = gradient(['#22c55e', '#84cc16', '#0ea5e9']).multiline(ART)
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
