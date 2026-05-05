import { openDb } from "../db/client.js";
import { scanFolder } from "../lib/scan.js";
import { getStats } from "../lib/pending.js";
import { search } from "../lib/search.js";

const dbPath = process.env.GARDEN_DB ?? "/tmp/garden-smoke.sqlite3";
const root = process.argv[2];
if (!root) {
  console.error("usage: node dist/scripts/smoke.js <folder>");
  process.exit(1);
}

const db = openDb(dbPath);

console.log(`Scanning ${root} → ${dbPath}`);
const t0 = Date.now();
const result = await scanFolder(db, root, { recursive: true });
const dt = Date.now() - t0;

console.log("Scan result:", JSON.stringify(result, null, 2));
console.log(`Took ${(dt / 1000).toFixed(1)}s`);

console.log("\nStats:", getStats(db));

console.log("\nSample (no query, latest 3):");
const hits = search(db, undefined, { limit: 3 });
for (const h of hits) {
  console.log(`  #${h.id}  ${h.width}x${h.height}  ${h.path}`);
  console.log(`    palette: ${h.palette.slice(0, 4).map((p) => p.hex).join(" ")}`);
}
