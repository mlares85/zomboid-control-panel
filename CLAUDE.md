# Zomboid Control Panel

## Build & Test

```bash
npm run test              # Run all tests (server + client)
npm run test:server       # Server tests only
npm run test:client       # Client tests only
npm run lint:server       # ESLint with require-result-handling rule
npm run build             # Verify frontend builds
```

## Test-Driven Development

- **Write failing tests first.** Red → Green → Refactor.
- Tests are a hard gate — never commit with failing tests.
- Every exported function needs a test. Every bug fix starts with a failing test that reproduces it.
- Test the actual reported scenario, not a simplified version of it.

### Test patterns

- Inject dependencies via constructors — not global imports or `req.app.get()`.
- Use in-memory fakes over mocks (e.g., fake filesystem that satisfies the interface, not `jest.mock("fs")`).
- Extract parsing/pure logic into standalone functions for easy testing.
- Test files go next to the code or in a `__tests__/` directory.

## Code Rules

### Hard Limits

- **Functions:** 15 logic lines MAX (excluding early returns, config objects).
- **Files:** 300 lines MAX (excluding test tables and data schemas like `serverConfigSchema.ts`).
- **Route handlers:** Validate input, call a service, return a response. No inline business logic.
- When a file exceeds the limit, extract — don't negotiate the limit.

### Backend Standards

- ESLint + `require-result-handling` rule must pass with zero warnings.
- Errors are values — use `{success: boolean}` consistently, never mix with thrown errors.
- No silent failures. Every error must be visible to the user and logged with context.
- Validate at system boundaries only (HTTP handlers, WebSocket messages).
- Shared guards (bridge-ready, RCON-connected, server-running) belong in middleware, not copy-pasted per handler.

### Frontend Standards

- **300 lines MAX per component file.** Extract sections into named components.
- Use TypeScript strictly — no `any` without a comment explaining why.
- Socket.IO events must be typed in a shared event map.
- Data fetching should use a caching layer (TanStack Query preferred).
- No inline business logic in JSX — extract into hooks or utilities.

### Project Structure

```
server/
├── routes/           # Thin HTTP handlers (validate → call service → respond)
├── services/         # Business logic, state management
├── database/         # Data access layer
├── utils/            # Pure helper functions
├── middleware/        # Shared guards (auth, bridge-ready, rate-limit)
└── tests/            # Test files

client/src/
├── pages/            # Route-level components (compose sub-components)
├── components/       # Reusable UI components
├── hooks/            # Custom React hooks
├── lib/              # API client, utilities, types
├── contexts/         # React contexts
└── __tests__/        # Test files
```

## Anti-Over-Engineering

- No abstraction until you have two implementations or need it for testing.
- Three similar lines > a premature abstraction. But when the same guard appears in 95 handlers, that's a middleware.
- No scaffolding for features that don't exist yet.
- No wrapper classes, single-use abstractions, or premature generalization.

## Architecture Notes

Maintain an `ARCHITECTURE.md` capturing non-obvious patterns and decisions.
Update it when establishing a new pattern or making a significant architectural decision.
Keep entries concise — one paragraph per decision.

## Git Discipline

- Commit after each logical feature or fix, not in massive batches.
- One feature per commit where practical.
- Never commit with failing tests.
- Use descriptive commit messages (what changed + why).

## Anti-File-Clutter

- Do not create plan.md, TODO.md, SUMMARY.md, or progress tracking files.
- No doc comments that restate the function name. Only comment the WHY.
