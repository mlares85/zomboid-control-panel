// Build a small list of search variants to try in order. Mod IDs in PZ are
// typically PascalCase, snake_case, or all-lowercase like "truemusic".
// Steam's text search treats the whole token as one word, so "truemusic"
// misses the actual mod titled "True Music". We try the raw form first, then
// a humanized version, then strip common suffixes (_b41, _b42, _fix, _v2…),
// and finally fall back to the parent mod's name with the same
// suffix-stripping. Duplicates and very short variants (<3 chars) get
// dropped so we never spam Steam with noise.
export function buildSearchVariants(raw, parent) {
  const variants = [];
  const seen = new Set();
  const push = (v) => {
    if (!v) return;
    const s = v.trim().toLowerCase();
    if (s.length < 3 || seen.has(s)) return;
    seen.add(s);
    variants.push(v.trim());
  };
  const stripSuffixes = (s) =>
    s
      .replace(
        /[_-]?(b4[12]fix|b4[12]_fix|b4[12]|fix(es)?|patch|patches|update|updates|v\d+(\.\d+)*|rev\d+|reupload|continued|continuation|port|ported|edition)$/gi,
        "",
      )
      .trim();
  const humanize = (s) =>
    s
      .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → camel Case
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // ABCWord  → ABC Word
      .replace(/[_\-]+/g, " ") // snake / kebab → spaces
      .replace(/\s+/g, " ")
      .trim();
  push(raw);
  const humanized = humanize(raw);
  if (humanized.toLowerCase() !== raw.toLowerCase()) push(humanized);
  const stripped = stripSuffixes(raw);
  if (stripped.toLowerCase() !== raw.toLowerCase()) push(stripped);
  const humanizedStripped = humanize(stripped);
  if (
    humanizedStripped.toLowerCase() !== humanized.toLowerCase() &&
    humanizedStripped.toLowerCase() !== stripped.toLowerCase()
  )
    push(humanizedStripped);
  if (parent) {
    push(parent);
    const parentStripped = stripSuffixes(parent);
    if (parentStripped.toLowerCase() !== parent.toLowerCase())
      push(parentStripped);
  }
  return variants;
}

// Scores a Steam Workshop search result title against the query, ranking
// exact/prefix/contains matches above weak token overlaps.
export function scoreSteamSearchCandidate(title, lowerOriginal) {
  const t = (title || "").toLowerCase();
  if (!t) return 0;
  if (t === lowerOriginal) return 1000;
  if (t.replace(/[\s_-]/g, "") === lowerOriginal) return 900;
  if (t.startsWith(lowerOriginal)) return 700;
  if (t.includes(lowerOriginal)) return 500;
  // Token overlap fallback for humanized variants
  const queryTokens = lowerOriginal
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((x) => x.length > 2);
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((tok) => t.includes(tok)).length;
  return Math.round((matched / queryTokens.length) * 400);
}
