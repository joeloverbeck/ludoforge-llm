# REACTUI-021: GameDef Boundary Validation for Runner Bootstrap and Load Paths

**Status**: ✅ COMPLETED
**Spec**: 39 (App Shell), 36 (Worker Bridge)
**Priority**: P1
**Depends on**: REACTUI-004
**Estimated complexity**: S

---

## Summary

Eliminate unsafe GameDef casts at runtime boundaries. Validate `GameDef` inputs before state mutation and fail fast with structured errors.

---

## Reassessed Assumptions (2026-02-17)

- `packages/runner/src/App.tsx` still uses `defaultBootstrapGameDef as unknown as GameDef`. This is a real boundary safety gap.
- `packages/runner/src/worker/game-worker-api.ts` `loadFromUrl` already validates with `validateGameDef`, but validation is duplicated inline and not reusable.
- `packages/runner/test/worker/game-worker.test.ts` already verifies `VALIDATION_FAILED` mapping for bad URL loads.
- There is currently no shared runner-side `GameDef` boundary validator utility.
- There is currently no dedicated boundary-validator test file.

Scope correction:
- This ticket is not introducing new validation semantics in engine.
- This ticket is consolidating runner boundary behavior behind one reusable validator module and removing unsafe casts.

---

## What Needs to Change

- Add a runner-side boundary validator utility (for example `packages/runner/src/bridge/validate-game-def.ts`) that:
  - accepts unknown input,
  - validates with engine runtime validation APIs (`validateGameDefBoundary`),
  - returns validated `GameDef` or throws structured boundary error details.
- Use boundary validation in:
  - `packages/runner/src/App.tsx` bootstrap fixture load path (remove `as unknown as GameDef` cast).
  - `packages/runner/src/worker/game-worker-api.ts` URL load path (`loadFromUrl`) so incoming payloads follow one boundary contract.
- Keep validation generic and game-agnostic.

Architectural decision:
- Prefer a single boundary module over per-call inline validation logic.
- Keep worker/store/kernel contracts strict (typed `GameDef` inside runtime; unknown only at boundary ingress).
- No aliasing/back-compat shims for unsafe casts.

---

## Out of Scope

- Game selection UI.
- Schema redesign in engine.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/ui/App.test.ts`
  - bootstrap path no longer relies on unsafe cast.
  - invalid bootstrap payload surfaces deterministic initialization failure.
- `packages/runner/test/worker/game-worker.test.ts`
  - invalid URL payload still maps to `VALIDATION_FAILED` with stable details from shared validator.
- `packages/runner/test/worker/game-worker-boundary-validation.test.ts` (new)
  - validator accepts valid GameDef and rejects malformed payloads.

### Invariants

- No `as unknown as GameDef` at runner runtime boundaries.
- All external/untyped GameDef inputs are validated exactly once at boundary.
- Validation remains game-agnostic and reusable for future GameSpecDoc -> GameDef load paths.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**
  - Added canonical runtime boundary validator contract in engine: `assertValidatedGameDefInput()` and `GAMEDEF_INPUT_INVALID` in `packages/engine/src/kernel/validate-gamedef.ts`.
  - Updated bootstrap path to validate fixture at boundary and removed unsafe runtime cast in `packages/runner/src/App.tsx`.
  - Updated URL GameDef load path to use runtime boundary validator in `packages/runner/src/worker/game-worker-api.ts`.
  - Added boundary-focused tests in `packages/runner/test/worker/game-worker-boundary-validation.test.ts`.
  - Added engine unit coverage for the canonical boundary validator in `packages/engine/test/unit/validate-gamedef-input.test.ts`.
  - Strengthened existing boundary behavior assertions in:
    - `packages/runner/test/ui/App.test.ts`
    - `packages/runner/test/worker/game-worker.test.ts`
- **Deviation vs original plan**
  - Validation contract was elevated from runner-local utility to engine runtime so all consumers can share one boundary API.
  - Reused existing worker `VALIDATION_FAILED` mapping and details envelope; no worker transport error code changes were required.
  - Boundary error envelope is now canonical (`GAMEDEF_INPUT_INVALID`) with standardized source/received-type and optional diagnostics/cause.
- **Verification**
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
