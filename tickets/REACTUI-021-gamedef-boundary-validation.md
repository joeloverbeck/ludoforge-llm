# REACTUI-021: GameDef Boundary Validation for Runner Bootstrap and Load Paths

**Status**: PENDING
**Spec**: 39 (App Shell), 36 (Worker Bridge)
**Priority**: P1
**Depends on**: REACTUI-004
**Estimated complexity**: S

---

## Summary

Eliminate unsafe GameDef casts at runtime boundaries. Validate `GameDef` inputs before state mutation and fail fast with structured errors.

---

## What Needs to Change

- Add a runner-side boundary validator utility (for example `packages/runner/src/bridge/validate-game-def.ts`) that:
  - accepts unknown input,
  - validates with engine runtime validation APIs,
  - returns typed `GameDef` or throws structured `WorkerError`/runner error.
- Use boundary validation in:
  - `packages/runner/src/App.tsx` bootstrap fixture load path (remove `as unknown as GameDef` cast).
  - `packages/runner/src/worker/game-worker-api.ts` URL load path (`loadFromUrl`) so all incoming payloads follow one boundary contract.
- Keep validation generic and game-agnostic.

---

## Out of Scope

- Game selection UI.
- Schema redesign in engine.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/ui/App.test.ts`
  - bootstrap path does not rely on unsafe cast.
  - invalid bootstrap payload surfaces deterministic error.
- `packages/runner/test/worker/game-worker.test.ts`
  - invalid URL payload still maps to `VALIDATION_FAILED` with stable details.
- `packages/runner/test/worker/game-worker-boundary-validation.test.ts` (new)
  - validator accepts valid GameDef and rejects malformed payloads.

### Invariants

- No `as unknown as GameDef` at runner runtime boundaries.
- All external/untyped GameDef inputs are validated exactly once at boundary.
- Validation remains game-agnostic and reusable for future GameSpecDoc -> GameDef load paths.

