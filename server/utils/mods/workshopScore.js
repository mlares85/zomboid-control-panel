// Scores how well a candidate mod (id/name) matches a free-text dependency
// search query. Higher score = stronger match. Used to rank local + Steam
// candidates when resolving a missing dependency by name.
export function scoreWorkshopDependencyMatch(query, modId, modName) {
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[\s_.\-+\[\]()]/g, "");
  const queryLower = String(query || "")
    .toLowerCase()
    .trim();
  const idLower = String(modId || "").toLowerCase();
  const nameLower = String(modName || "").toLowerCase();
  const queryNormalized = normalize(query);
  const idNormalized = normalize(modId);
  const nameNormalized = normalize(modName);

  if (!queryLower || !idLower) return { score: 0, matchType: "none" };
  if (idLower === queryLower) return { score: 1200, matchType: "exact-id" };
  if (idNormalized === queryNormalized)
    return { score: 1100, matchType: "exact-id" };
  if (nameLower === queryLower || nameNormalized === queryNormalized)
    return { score: 950, matchType: "exact-name" };
  if (
    idLower.startsWith(queryLower) ||
    idNormalized.startsWith(queryNormalized)
  )
    return { score: 650, matchType: "id-prefix" };
  if (
    nameLower.startsWith(queryLower) ||
    nameNormalized.startsWith(queryNormalized)
  )
    return { score: 550, matchType: "name-prefix" };
  if (idLower.includes(queryLower) || idNormalized.includes(queryNormalized))
    return { score: 350, matchType: "id-contains" };
  if (
    nameLower.includes(queryLower) ||
    nameNormalized.includes(queryNormalized)
  )
    return { score: 250, matchType: "name-contains" };
  return { score: 0, matchType: "none" };
}
