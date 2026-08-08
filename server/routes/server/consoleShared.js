// Shared path resolution for all server-console.txt routes.
import { getActiveServer, getSetting } from "../../database/init.js";

export async function resolveZomboidDataPath() {
  const activeServer = await getActiveServer();
  // server-console.txt is in zomboidDataPath (where Server/, Saves/, Logs/ are)
  return (
    activeServer?.zomboidDataPath ||
    activeServer?.installPath ||
    (await getSetting("zomboidDataPath")) ||
    (await getSetting("serverPath"))
  );
}
