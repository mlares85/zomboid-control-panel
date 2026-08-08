import fs from "fs";
import crypto from "crypto";
import { createLogger } from "../../logger.js";
import { HASH_MAX_BYTES } from "./fileIndex.js";

const log = createLogger("API:Mods");

// Sync variant kept for the non-streaming diff endpoint (single-file, already fast)
export function hashFileSync(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > HASH_MAX_BYTES) return "too-large";
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch (e) {
    log.debug(`Error hashing file sync ${filePath}: ${e.message}`);
    return null;
  }
}

// Compute unified diff hunks between two line arrays using LCS
export function computeUnifiedDiff(linesA, linesB, contextLines = 3) {
  // Simple O(n*m) LCS for files up to ~10k lines; fast enough for mod files
  const n = linesA.length,
    m = linesB.length;

  // Guard: Uint16Array max value is 65535 — if either file exceeds that, fall back
  // Also guard against excessive memory: n*m cells
  if (n > 65535 || m > 65535 || n * m > 10_000_000) {
    // Too large for full LCS — return a simplified diff
    return [
      {
        startA: 1,
        startB: 1,
        countA: n,
        countB: m,
        lines: [
          ...linesA
            .slice(0, 50)
            .map((l, i) => ({ type: "remove", lineA: i + 1, text: l })),
          {
            type: "context",
            text: `... (${n} lines in Mod A, ${m} lines in Mod B — file too large for inline diff)`,
          },
          ...linesB
            .slice(0, 50)
            .map((l, i) => ({ type: "add", lineB: i + 1, text: l })),
        ],
      },
    ];
  }

  // Build LCS table
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        linesA[i - 1] === linesB[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to get edit ops
  const ops = []; // { type: 'equal'|'remove'|'add', lineA?, lineB?, text }
  let i = n,
    j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ type: "equal", lineA: i, lineB: j, text: linesA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "add", lineB: j, text: linesB[j - 1] });
      j--;
    } else {
      ops.push({ type: "remove", lineA: i, text: linesA[i - 1] });
      i--;
    }
  }
  ops.reverse();

  // Group into hunks with context
  const hunks = [];
  let currentHunk = null;
  let sinceLastChange = Infinity;

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const isChange = op.type !== "equal";

    if (isChange) {
      if (!currentHunk || sinceLastChange > contextLines * 2) {
        // Start new hunk — include preceding context
        if (currentHunk) hunks.push(currentHunk);
        const ctxStart = Math.max(0, k - contextLines);
        currentHunk = {
          startA: ops[ctxStart]?.lineA || op.lineA || 1,
          startB: ops[ctxStart]?.lineB || op.lineB || 1,
          lines: [],
        };
        // Add context lines before this change
        for (let c = ctxStart; c < k; c++) {
          if (ops[c].type === "equal") {
            currentHunk.lines.push({
              type: "context",
              lineA: ops[c].lineA,
              lineB: ops[c].lineB,
              text: ops[c].text,
            });
          }
        }
      }
      currentHunk.lines.push(op);
      sinceLastChange = 0;
    } else {
      sinceLastChange++;
      if (currentHunk && sinceLastChange <= contextLines) {
        currentHunk.lines.push({
          type: "context",
          lineA: op.lineA,
          lineB: op.lineB,
          text: op.text,
        });
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  // Add counts to each hunk
  for (const hunk of hunks) {
    hunk.countA = hunk.lines.filter((l) => l.type !== "add").length;
    hunk.countB = hunk.lines.filter((l) => l.type !== "remove").length;
  }

  return hunks;
}
