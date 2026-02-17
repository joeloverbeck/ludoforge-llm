# REACTUI-002: ErrorBoundary, LoadingState, and ErrorState

**Spec**: 39 (React DOM UI Layer) — Deliverables D21, D22, D23
**Priority**: P0 (blocks REACTUI-003 GameContainer)
**Depends on**: REACTUI-001
**Estimated complexity**: S
**Status**: ✅ COMPLETED

---

## Summary

Create the three error/loading components that `GameContainer` needs for lifecycle gating. These are simple, self-contained components with no game-specific logic.

---

## Reassessed Assumptions and Scope Corrections

### Corrected baseline assumptions (repo reality)

- `packages/runner/src/ui/` currently contains only `tokens.css` and `shared.module.css` from REACTUI-001; D21-D23 components did not exist before this ticket.
- `packages/runner/src/App.tsx` is still placeholder bootstrap content; this ticket does not assume `GameContainer` integration exists yet.
- Runner UI tests currently run under Vitest Node environment (`environment: 'node'`) and include pattern `test/**/*.test.ts`; this ticket uses Node-compatible component contract tests.
- `REACTUI-001` was already completed and archived at `archive/tickets/REACTUI-001-design-tokens-and-base-styles.md`.

### Scope adjustments

- Kept this ticket strictly focused on D21-D23 component implementation + unit tests.
- `ErrorState` remains a presentational component with `error` and `onRetry` props. Retry policy orchestration (for example `clearError()` only vs `clearError()` + re-init) remains in `GameContainer`/`App` integration tickets.
- Tests validate component contracts and fallback surface behavior in the current Node-based test harness.

### Architectural rationale

- Keeping `ErrorState` stateless and store-agnostic preserves clean layering and keeps retry strategy composable at container level.
- A standalone `ErrorBoundary` wrapper isolates unrecoverable render failures from runtime/store failures, yielding a more robust and extensible failure model as UI complexity increases.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/ErrorBoundary.tsx` | React class component error boundary with fallback UI |
| `packages/runner/src/ui/LoadingState.tsx` | "Loading game..." centered spinner/text |
| `packages/runner/src/ui/LoadingState.module.css` | Scoped styles for LoadingState |
| `packages/runner/src/ui/ErrorState.tsx` | Error display with retry button |
| `packages/runner/src/ui/ErrorState.module.css` | Scoped styles for ErrorState |
| `packages/runner/test/ui/ErrorBoundary.test.ts` | Unit tests for ErrorBoundary contracts |
| `packages/runner/test/ui/LoadingState.test.ts` | Unit tests for LoadingState contracts |
| `packages/runner/test/ui/ErrorState.test.ts` | Unit tests for ErrorState contracts |

### Modified files

None.

---

## Detailed Requirements

### ErrorBoundary (D23)

- React class component (error boundaries require class lifecycle methods).
- Props: `children: ReactNode`, optional `fallback?: ReactNode`.
- Catches render errors in the subtree and displays fallback UI.
- Default fallback UI: error message text + "Reload" button that calls `window.location.reload()` when available.
- State: `{ hasError: boolean; error: Error | null }`.
- `static getDerivedStateFromError(error)` sets `hasError: true` and stores error instance.

### LoadingState (D21)

- Functional component with optional `message?: string` defaulting to `"Loading game..."`.
- Centered in the game container.
- Uses design tokens for typography and colors.
- Uses `shared.module.css` panel pattern.
- Shows a CSS-only spinner (no external animation library).

### ErrorState (D22)

- Props: `{ error: { message: string }; onRetry: () => void }`.
- Displays error message text.
- "Retry" button calls `onRetry`.
- Centered in the game container.
- Uses design tokens for colors (`--danger` for error text).

---

## Out of Scope

- Integration with the Zustand store (REACTUI-003 / REACTUI-004)
- GameContainer layout and lifecycle gating
- Retry orchestration policy (whether retry triggers clear-only or clear+init flow)
- Network error detection or categorization
- Error reporting to external services
- Animation (Spec 40)
- Mobile optimization

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/ErrorBoundary.test.ts` | Renders children when no error is thrown |
| `packages/runner/test/ui/ErrorBoundary.test.ts` | Renders fallback UI when a child throws during render |
| `packages/runner/test/ui/ErrorBoundary.test.ts` | Default fallback includes a "Reload" control |
| `packages/runner/test/ui/LoadingState.test.ts` | Renders loading message text |
| `packages/runner/test/ui/LoadingState.test.ts` | Accepts custom message prop |
| `packages/runner/test/ui/ErrorState.test.ts` | Renders error message from props |
| `packages/runner/test/ui/ErrorState.test.ts` | Calls `onRetry` when "Retry" is activated |

### Invariants

- `ErrorBoundary` is a class component.
- `LoadingState` and `ErrorState` are functional components.
- No component reads from the Zustand store directly.
- No game-specific logic or terminology in any component.
- Loading/Error components style through local CSS modules with design tokens/shared patterns; no inline style objects required.
- Components remain presentation-focused; container-level orchestration is deferred.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs originally planned**:
  - Implemented D21-D23 components and matching UI tests.
  - Corrected ticket assumptions to current repo baseline before implementation.
  - Kept retry orchestration decoupled from presentational components for cleaner container-level composition.
- **Deviations**:
  - Acceptance tests were implemented as Node-compatible component contract tests (`.test.ts`) rather than browser-dom interaction tests, matching the current runner test harness.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
