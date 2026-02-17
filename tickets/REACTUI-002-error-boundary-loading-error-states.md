# REACTUI-002: ErrorBoundary, LoadingState, and ErrorState

**Spec**: 39 (React DOM UI Layer) — Deliverables D21, D22, D23
**Priority**: P0 (blocks REACTUI-003 GameContainer)
**Depends on**: REACTUI-001
**Estimated complexity**: S

---

## Summary

Create the three error/loading components that `GameContainer` needs for lifecycle gating. These are simple, self-contained components with no game-specific logic.

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

### Modified files

None.

---

## Detailed Requirements

### ErrorBoundary (D23)

- React class component (error boundaries require `componentDidCatch`).
- Props: `children: ReactNode`, optional `fallback?: ReactNode`.
- Catches render errors in the subtree and displays a fallback UI.
- Fallback UI: error message text + "Reload" button that calls `window.location.reload()`.
- State: `{ hasError: boolean; error: Error | null }`.
- `static getDerivedStateFromError(error)` sets `hasError: true`.

### LoadingState (D21)

- Functional component, no props (or optional `message?: string` defaulting to `"Loading game..."`).
- Centered in the game container.
- Uses design tokens for typography and colors.
- Uses `shared.module.css` panel pattern.
- Shows a CSS-only spinner or pulsing dots (no external animation library).

### ErrorState (D22)

- Props: `{ error: { message: string }; onRetry: () => void }`.
- Displays the error message text.
- "Retry" button that calls `onRetry`.
- Centered in the game container.
- Uses design tokens for colors (`--danger` for error text).

---

## Out of Scope

- Integration with the Zustand store (that's REACTUI-003's job)
- GameContainer layout and lifecycle gating
- Network error detection or categorization
- Error reporting to external services
- Animation (Spec 40)
- Mobile optimization

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/ErrorBoundary.test.tsx` | Renders children when no error is thrown |
| `packages/runner/test/ui/ErrorBoundary.test.tsx` | Renders fallback UI when a child throws during render |
| `packages/runner/test/ui/ErrorBoundary.test.tsx` | "Reload" button is present in fallback UI |
| `packages/runner/test/ui/LoadingState.test.tsx` | Renders loading message text |
| `packages/runner/test/ui/LoadingState.test.tsx` | Accepts custom message prop |
| `packages/runner/test/ui/ErrorState.test.tsx` | Renders error message from props |
| `packages/runner/test/ui/ErrorState.test.tsx` | Calls `onRetry` when "Retry" button is clicked |

### Invariants

- ErrorBoundary is a **class** component (React requirement for error boundaries).
- LoadingState and ErrorState are **functional** components.
- No component reads from the Zustand store directly.
- No game-specific logic or terminology in any component.
- All components import from `tokens.css` / `shared.module.css` only — no inline styles except dynamic values.
- Components are pure presentation — all behavior comes from props.
