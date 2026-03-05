# PIPEVAL-007: Canonicalize linkedWindow identifiers across kernel and CNL

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared contracts + kernel/CNL reference validation
**Deps**: `archive/tickets/PIPEVAL-003-validate-pipeline-linkedwindows-against-overridewindows.md`

## Problem

`linkedWindows` reference matching currently uses raw string equality in the new shared linked-window contract. This can produce false missing-reference diagnostics when identifiers differ only by whitespace or Unicode normalization form, even though compiler/validator identifier handling elsewhere already applies canonicalization semantics.

This is an architecture consistency gap across surfaces (`compile`, `crossValidate`, `validateGameDef`) and risks drift in deterministic diagnostic behavior.

## Assumption Reassessment (2026-03-05)

1. `linkedWindows` entries are normalized by the CNL compiler (`normalizeIdentifier`) before being written to `GameDef`.
2. Override-window ids are currently returned by the shared contract helper without canonicalization, and missing-reference detection compares raw strings.
3. Existing active tickets (`PIPEVAL-004`, `PIPEVAL-005`, `PIPEVAL-006`) do not cover identifier canonicalization parity for linked-window references; scope is net-new.

## Architecture Check

1. Canonical identifier comparison in one shared contract module is cleaner and more robust than scattered per-surface normalization.
2. This remains game-agnostic: it changes generic identifier semantics only, with no game-specific branches and no visual-config coupling.
3. No backwards-compatibility aliasing: enforce one canonical identifier contract and update all consumers directly.

## What to Change

### 1. Canonicalize ids in linked-window shared contract

In `turn-flow-linked-window-contract.ts`, canonicalize:
- collected override-window ids
- incoming `linkedWindows` values before comparison

Use existing canonical identifier semantics (`trim + NFC`) via a shared utility contract import (or a minimal dedicated helper in contracts) instead of ad-hoc logic.

### 2. Keep kernel and CNL consumers on shared contract only

Ensure `validate-gamedef-extensions.ts` and `cross-validate.ts` continue to rely on the shared helper outputs and do not introduce local normalization branches.

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
