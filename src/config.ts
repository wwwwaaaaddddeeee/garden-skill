import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface GardenConfig {
  dbPath: string;
  defaultRoot?: string;
}

export function loadConfig(): GardenConfig {
  const dbPath = process.env.GARDEN_DB
    ? resolve(process.env.GARDEN_DB)
    : join(homedir(), ".garden", "garden.sqlite3");

  const defaultRoot = process.env.GARDEN_ROOT
    ? resolve(process.env.GARDEN_ROOT)
    : undefined;

  return { dbPath, defaultRoot };
}
