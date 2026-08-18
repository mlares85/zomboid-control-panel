// Shared target lists/regexes/helpers used by both wipe/preview and wipe.
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Server");

// "accounts" lives outside the save folder, so it is not part of the sweep
export const SAVE_TARGETS = ["map", "players", "world"];
export const ALLOWED_TARGETS = [...SAVE_TARGETS, "accounts"];

// Directories belonging to each target
export const MAP_DIRS = [
  "map",
  "chunkdata",
  "isoregiondata",
  "zpop",
  "apop",
  "metagrid",
  "map_visited_server",
];
export const WORLD_DIRS = ["radio"];
// Player files in save root
export const PLAYER_ROOT_FILES =
  /^(players\.db|players\.db-journal|vehicles\.db|vehicles\.db-journal|map_p\.bin|map_zone\.bin)$/i;
// World state files in save root (everything that isn't player data or directories)
// This covers WorldDictionary.bin, map_meta.bin, map_t.bin, entity_data.bin,
// global_mod_data.bin, reanimated.bin, iTrack.bin, gos_*.bin, map_*.bin (except map_zone/map_p),
// z_outfits.bin, recorded_media.bin, erosion.ini, WorldDictionary*.lua, etc.
export const WORLD_ROOT_FILES =
  /^(WorldDictionary.*|map_meta\.bin|map_t\.bin|map_worldgen\.bin|map_animals\.bin|map_basements\.bin|entity_data\.bin|global_mod_data\.bin|reanimated\.bin|iTrack\.bin|gos_.*\.bin|id_manager_data\.bin|important_area_data\.bin|z_outfits\.bin|recorded_media\.bin|servermap_symbols\.bin|map_sand\.bin|hidden_authors\.ini|erosion\.ini)$/i;

export async function countDir(dir) {
  const fileAccess = new LocalFiles();
  let files = 0;
  let size = 0;
  if (!(await fileAccess.exists(dir))) return { files: 0, size: 0 };
  try {
    const entries = await fileAccess.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory) {
        const sub = await countDir(fullPath);
        files += sub.files;
        size += sub.size;
      } else {
        files++;
        try {
          const stat = await fileAccess.stat(fullPath);
          if (stat) size += stat.size;
        } catch (e) {
          log.debug(`Stat failed for ${fullPath}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    log.debug(`countDir readdir failed for ${dir}: ${e.message}`);
  }
  return { files, size };
}
