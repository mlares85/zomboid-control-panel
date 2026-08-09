# Mandatory Update Protocol (MUP)

Run this at the end of every session to preserve context for the next one.

## 1. Review What Was Done
Run: `git log --oneline -10`

## 2. Check Test Status
Run: `npm run test:server 2>&1 | tail -10`

## 3. Check Build Status
Run: `cd client && npm run build 2>&1 | tail -5`

## 4. Update ARCHITECTURE.md

Check if any new architectural patterns, endpoints, or non-obvious decisions were introduced this session that aren't yet in `ARCHITECTURE.md`. If so, add concise entries (1-2 sentences each) following the existing style. Skip if nothing architectural changed.

## 5. Update `docs/activeContext.md`

Rewrite the file with fresh content:

- **Current Focus**: What the next session should pick up (1-2 lines)
- **Recent Decisions**: Any decisions made this session with brief rationale. Only include things git log doesn't capture (the "why", not the "what"). Drop decisions from previous sessions that are no longer relevant.
- **Blockers / Open Questions**: Anything unresolved that the next session needs to know about
- **Next Steps**: Top 3 priorities for the next session, ordered by importance

Rules:
- Keep the file under 50 lines total
- Do NOT list files modified or implementation status — git log and `/initme` handle that
- Be specific and actionable, not vague

## 6. Commit the Update

Stage and commit only the context and architecture files:

```bash
git add docs/activeContext.md ARCHITECTURE.md
git commit -m "docs(context): MUP session update"
```

## 7. Confirm

Report: "MUP complete. Context saved for next session." and show the updated activeContext.md content.
