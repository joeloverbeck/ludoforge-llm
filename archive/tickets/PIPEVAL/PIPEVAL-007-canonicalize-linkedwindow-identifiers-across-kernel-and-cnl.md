# PIPEVAL-007: Canonicalize linkedWindow identifiers across kernel and CNL

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared contracts + kernel/CNL reference validation
**Deps**: `archive/tickets/PIPEVAL-003-validate-pipeline-linkedwindows-against-overridewindows.md`

## Problem

`linkedWindows` reference matching currently uses raw string equality in the shared linked-window contract. This can produce false missing-reference diagnostics when identifiers differ only by whitespace or Unicode normalization form, even though identifier handling elsewhere already applies canonicalization semantics (`trim + NFC`).

This is an architecture consistency gap across surfaces (`compile`, `crossValidate`, `validateGameDef`) and risks drift in deterministic diagnostic behavior.

## Assumption Reassessment (2026-03-05)

1. CNL compilation normalizes `actionPipelines[*].linkedWindows` via `normalizeIdentifier` in `packages/engine/src/cnl/compile-operations.ts` — confirmed.
2. `turnFlow.eligibility.overrideWindows[*].id` is not canonicalized by CNL turn-flow compilation (`compile-turn-flow.ts` currently returns the shape as-is), so raw ids can survive into `GameDef` — confirmed.
3. Shared linked-window contract helpers currently compare raw strings (`collectTurnFlowEligibilityOverrideWindowIds` + `findMissingTurnFlowLinkedWindows`) — confirmed.
4. The prior PIPEVAL tickets (`PIPEVAL-004`, `PIPEVAL-005`, `PIPEVAL-006`) are archived/completed, not active, and none cover linked-window identifier canonicalization parity — confirmed; scope is net-new.
5. `validateGameDef` must also handle direct/malformed `GameDef` inputs that may bypass CNL compilation and therefore bypass identifier normalization — confirmed architectural requirement.

## Architecture Check

1. Canonical identifier comparison in one shared contract module is cleaner and more robust than scattered per-surface normalization.
2. This remains game-agnostic: it changes generic identifier semantics only, with no game-specific branches and no visual-config coupling.
3. No backwards-compatibility aliasing: enforce one canonical identifier contract and update all consumers directly.
4. Keep canonicalization helper ownership in shared contracts (or kernel-shared utility), not in CNL-only modules, so kernel validation does not depend on compiler-local utilities.

## What to Change

### 1. Canonicalize ids in linked-window shared contract

In `turn-flow-linked-window-contract.ts`, canonicalize:
- collected override-window ids
- incoming `linkedWindows` values before comparison

Use shared canonical identifier semantics (`trim + NFC`) from a contract-level helper (or a minimal local helper in this contract module).

### 2. Keep kernel and CNL consumers on shared contract only

Ensure `validate-gamedef-extensions.ts` and `cross-validate.ts` continue to rely on the shared helper outputs and do not introduce local normalization branches for linked-window checks.

### 3. Preserve diagnostic code semantics and paths

Keep current diagnostic codes/paths (`REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING`, `CNL_XREF_PROFILE_WINDOW_MISSING`) unchanged; only eliminate false negatives/positives due to non-canonical equivalent ids.

## Files to Touch

- `packages/engine/src/contracts/turn-flow-linked-window-contract.ts` (modify)
- `packages/engine/src/contracts/index.ts` (modify only if helper exports change)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (verify/no-op or modify)
- `packages/engine/src/cnl/cross-validate.ts` (verify/no-op or modify)
- `packages/engine/test/unit/contracts/turn-flow-linked-window-contract.test.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- New diagnostic taxonomy or renaming existing diagnostic codes
- Game-specific validation logic in GameDef/kernel/CNL
- Runtime simulation behavior changes unrelated to reference validation

## Acceptance Criteria

### Tests That Must Pass

1. Canonically equivalent ids (whitespace/NFC variants) do not emit linked-window missing-reference diagnostics in kernel validation.
2. Canonically equivalent ids do not emit linked-window missing-reference diagnostics in CNL cross-validation.
3. Truly missing ids still emit the existing diagnostics with unchanged codes/paths.
4. Existing suite: `pnpm turbo test --force`

### Invariants

1. Linked-window identifier semantics are canonical and shared across compiler/kernel/CNL surfaces.
2. GameDef and simulation remain game-agnostic and independent from visual config.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/turn-flow-linked-window-contract.test.ts` — add canonicalization cases (`"window-a"` vs `" window-a "`, NFC variants).
2. `packages/engine/test/unit/validate-gamedef.test.ts` — add kernel validation parity case for canonically equivalent ids.
3. `packages/engine/test/unit/cross-validate.test.ts` — add CNL parity case for canonically equivalent ids.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/contracts/turn-flow-linked-window-contract.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
5. `pnpm turbo test --force`
6. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**:
  - Canonicalized linked-window identifier handling in `turn-flow-linked-window-contract` using `trim + NFC` for both override-window id collection and linked-window comparison.
  - Kept kernel/CNL consumers on the shared contract helper; no per-surface normalization branches were added.
  - Added regression coverage for canonical-equivalent identifier handling across:
    - contract unit tests
    - kernel `validateGameDef` linked-window reference checks
    - CNL `crossValidateSpec` linked-window reference checks
- **Deviations from original plan**:
  - `packages/engine/src/contracts/index.ts` did not need changes because no new public contract exports were required.
  - `packages/engine/src/kernel/validate-gamedef-extensions.ts` and `packages/engine/src/cnl/cross-validate.ts` remained implementation no-ops; parity was achieved by hardening the shared contract module.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/contracts/turn-flow-linked-window-contract.test.js packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/cross-validate.test.js` ✅
  - `pnpm turbo test --force` ✅
  - `pnpm turbo lint` ✅
