# Session Initialization

You are starting a new session on this project. Follow these steps to get oriented:

## 1. Load Soft Context
Read `ARCHITECTURE.md` for current patterns and decisions.
Read `docs/activeContext.md` for current focus, recent decisions, blockers, and next steps.

## 2. Check Recent Work
Run: `git log --oneline -15`

## 3. Check Test Health
Run: `npm run test:server 2>&1 | tail -10`

## 4. Check Build Health
Run: `cd client && npm run build 2>&1 | tail -5`

## 5. Check Uncommitted State
Run: `git status --short | head -20`
Note any uncommitted work that may need attention.

## 6. Present Summary

Format your summary as:

```
## Session Start

**Current Focus**: [from activeContext.md]

**Recent Work** (git log):
- [last 5-8 commits, summarized]

**Test Status**: [pass/fail/count]

**Build Status**: [pass/fail]

**Uncommitted Changes**: [count and summary, or "Clean"]

**Blockers**: [from activeContext.md, or "None"]

**Next Steps**:
1. [from activeContext.md]
2. [from activeContext.md]
3. [from activeContext.md]
```

After presenting the summary, ask: "Ready to continue, or do you want to adjust the focus?"
