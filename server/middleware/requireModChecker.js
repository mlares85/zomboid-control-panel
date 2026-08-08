// Guards routes that need the app-level modChecker service. Attaches it to
// req.modChecker so handlers don't each repeat the same null check.
export function requireModChecker(req, res, next) {
  const modChecker = req.app.get("modChecker");
  if (!modChecker) {
    res.status(500).json({ error: "Mod checker not initialized" });
    return;
  }
  req.modChecker = modChecker;
  next();
}
