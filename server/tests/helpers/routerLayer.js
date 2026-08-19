// Route composition moved from flat `router.get/post(...)` registrations to
// nested `router.use(subRouter)` mounts when routes were decomposed into
// directories. Tests that introspect `router.stack` need to walk into those
// nested routers (mounted at "/", so route paths are unchanged) to find the
// layer that actually owns a given path + method.
export function findRouteLayer(stack, routePath, method) {
  for (const entry of stack) {
    if (entry.route?.path === routePath && entry.route.methods[method]) {
      return entry;
    }
    if (entry.name === "router" && entry.handle?.stack) {
      const found = findRouteLayer(entry.handle.stack, routePath, method);
      if (found) return found;
    }
  }
  return undefined;
}
