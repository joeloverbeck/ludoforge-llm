# 120MAREFFDOM-003: Final verification of marker effect domain separation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — verification-owned test guard alignment
**Deps**: `archive/tickets/120MAREFFDOM-001.md`

## Problem

After the extraction and consumer import rewiring completed under ticket 001, a final verification pass confirms the refactoring is complete and no regressions were introduced. This ticket exists to formalize the verification gate before the spec can be marked as implemented.

## Assumption Reassessment (2026-04-09)

1. Ticket 001 will have completed the full extraction and consumer import rewiring
2. The verification battery should pass, but stale source-architecture guards remain in scope if the refactor changed module ownership and the guard no longer matches reality
3. The spec's 5 invariants must all hold after the refactoring

## Architecture Check

1. Verification-first ticket — validation is primary, but direct verification fallout remains in scope when an authoritative lane exposes stale refactor-aligned test guard expectations
2. Confirms the architectural improvement: two focused modules instead of one overloaded file
3. No backwards-compatibility concerns — nothing to check beyond what exists

## Confirmed Scope Correction (2026-04-09)

`pnpm turbo test --force` exposed a stale architecture guard in `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts`: the guard still modeled `effects-choice.ts` as the normalization-owning module even though ticket 001 had moved that responsibility into `effects-markers.ts`. Keeping this ticket as "no code changes under any circumstance" would have forced either a false failure or an undocumented local workaround, so the ticket absorbed that one verification-owned guard update.

## What to Change

### 1. Run full build and test suite

Execute the complete verification battery:
- `pnpm turbo build`
- `pnpm turbo test --force` (bypass cache for guaranteed fresh run)
- `pnpm turbo typecheck`
- `pnpm turbo lint`

### 2. Verify spec invariants

Confirm all 5 invariants from the spec:
1. Every effect function retains its exact signature and behavior (tests pass)
2. The effect registry maps to the same functions, just from different modules (grep `effect-registry.ts` imports)
3. No new public exports beyond the moved functions and shared utilities (grep exports in both files)
4. `effects-choice.ts` no longer contains any marker-related code (grep for `Marker`, `marker`, `resolveMarkerLattice`, `resolveGlobalMarkerLattice`)
5. `effects-markers.ts` does not contain any decision/choice-related code (grep for `chooseOne`, `chooseN`, `rollRandom`, `PendingChoice`)

### 3. Repair direct verification fallout if required

If the authoritative verification battery exposes a stale guard or assertion that no longer matches the already-landed domain split, update that guard narrowly so it reflects the real module ownership without changing product behavior.

### 4. Verify file sizes are reasonable

- `effects-choice.ts` should be ~1114 lines (decision effects + shared utilities + helpers)
- `effects-markers.ts` should be ~428 lines (marker effects + lattice helpers + imports)

## Files to Touch

- `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` only if authoritative verification exposes stale refactor-aligned guard expectations

## Out of Scope

- Behavioral or product-code changes outside direct verification-owned fallout
- Performance benchmarking
- Addressing globalMarker defaultState projection drift

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — zero errors
2. `pnpm turbo test --force` — all tests pass
3. `pnpm turbo typecheck` — zero type errors
4. `pnpm turbo lint` — zero lint errors

### Invariants

1. `effects-choice.ts` contains zero marker-related functions
2. `effects-markers.ts` contains zero decision-related functions
3. Effect registry dispatch behavior is identical (all tests pass)
4. No re-exports or compatibility shims exist

## Test Plan

### New/Modified Tests

- `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` only if verification proves the guard stale against the completed module split

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test --force`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-09
- Changed:
  - verified the completed marker-effect domain split against the full build, forced test, typecheck, and lint battery
  - updated `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` so its normalization-ownership expectations match the post-split module boundary: `effects-markers.ts` owns normalization-dependent marker resolver usage and `effects-choice.ts` is now normalization-free
- Non-blocking drift confirmed:
  - the ticket's rough file-size estimates were stale at verification time: `effects-choice.ts` is 1080 lines and `effects-markers.ts` is 466 lines
  - the broader spec/ticket series still mentions `resolveChoiceTraceProvenance` flowing into `effects-markers.ts`, but the final extraction did not require that import there
- Verification:
  - `pnpm turbo build` passed
  - `pnpm turbo test --force` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
