# 88PHAAWAACTFIL-001: Add phase-aware action indexing to legal move enumeration

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel module, legal-moves integration, and tests
**Deps**: archive/specs/88-phase-aware-action-filtering.md

## Problem

`enumerateRawLegalMoves` iterates all `def.actions` on every game step, even though most actions are phase-inapplicable. A phase-to-actions index would allow the enumeration to skip inapplicable actions before entering the preflight.

The original ticket split this work across three tiny tickets (`001` module only, `002` integration only, `003` tests only). Reassessing the code and tests shows that split is not a good architectural unit in this repository: the optimization is only meaningful once wired into `legal-moves.ts`, and the repo’s test suite includes source-guard tests around `legal-moves.ts` that should evolve in the same change.

## Assumption Reassessment (2026-03-28)

1. `ActionDef.phase` is `readonly PhaseId[]` — confirmed at `packages/engine/src/kernel/types-core.ts:175`.
2. `GameDef.actions` is a stable `readonly ActionDef[]` reference suitable as a WeakMap key — confirmed from the established cache pattern in `packages/engine/src/kernel/def-lookup.ts`.
3. Kernel validation enforces non-empty, unique, known `action.phase` entries — confirmed at `packages/engine/src/kernel/validate-gamedef-core.ts:71-108`.
4. `legal-moves.ts` currently performs two full `def.actions` scans in `enumerateRawLegalMoves` (early-exit trivial pass and main pass) — confirmed at `packages/engine/src/kernel/legal-moves.ts:1166-1218`.
5. `enumerateRawLegalMoves` is private. Tests must verify behavior through public exports (`legalMoves`, `enumerateLegalMoves`) or source-guard inspection; exporting the private helper only for tests would be the wrong API change.
6. The repo already contains source-guard tests that assert import and call-shape invariants for `legal-moves.ts` at `packages/engine/test/unit/kernel/legal-moves.test.ts`. This optimization should add to that proof surface instead of deferring tests.

## Architecture Check

1. The beneficial part of the proposed architecture is the phase index itself. It narrows a hot enumeration loop using existing generic data (`ActionDef.phase`) and follows the repo’s existing module-level WeakMap cache pattern.
2. The original ticket split is not beneficial compared with current architecture because it creates an unconsumed cache module and defers correctness proof. In this codebase, isolated micro-tickets for one kernel optimization weaken completeness and TDD.
3. Retaining the preflight phase check is still the right architecture. The index is a performance narrowing; `resolveActionApplicabilityPreflight` remains the semantic guardrail.
4. A cleaner future architecture would also remove repeated linear scans over `def.actionPipelines` by introducing a shared action-pipeline lookup/index. That is related but out of scope for this ticket because phase filtering alone already improves the hot loop without widening the change. Capture it as a follow-up, not an opportunistic refactor here.
5. No backwards-compatibility shims, aliases, or test-only exports.

## What to Change

### 1. Create `packages/engine/src/kernel/phase-action-index.ts`

- Export `PhaseActionIndex` interface: `{ readonly actionsByPhase: ReadonlyMap<PhaseId, readonly ActionDef[]> }`.
- Export `getPhaseActionIndex(def: GameDef): PhaseActionIndex` — builds or retrieves from WeakMap cache.
- WeakMap keyed on `def.actions` (the stable array reference), matching `def-lookup.ts` pattern.
- Builder iterates `def.actions`, for each action iterates `action.phase`, populates `Map<PhaseId, ActionDef[]>`.

### 2. Integrate the index into `packages/engine/src/kernel/legal-moves.ts`

- Import `getPhaseActionIndex`.
- Compute `actionsForPhase = getPhaseActionIndex(def).actionsByPhase.get(state.currentPhase) ?? []` once per raw enumeration call.
- Replace both `for (const action of def.actions)` loops in `enumerateRawLegalMoves` with `actionsForPhase`.
- Retain the preflight phase check in `action-applicability-preflight.ts`.

### 3. Add tests in the same change

- Add focused unit tests for `phase-action-index.ts` covering grouping, dual-phase membership, missing buckets, and cache identity.
- Add legal-move behavior tests through public APIs proving only current-phase actions are emitted.
- Add a source-guard test in `packages/engine/test/unit/kernel/legal-moves.test.ts` asserting `legal-moves.ts` imports and uses `getPhaseActionIndex` instead of scanning `def.actions` in the raw enumeration loops.

## Files to Touch

- `packages/engine/src/kernel/phase-action-index.ts` (new)
- `packages/engine/src/kernel/legal-moves.ts`
- `packages/engine/test/unit/kernel/phase-action-index.test.ts` (new)
- `packages/engine/test/unit/kernel/legal-moves.test.ts`

## Out of Scope

- Modifying `action-applicability-preflight.ts` semantics — the phase check there is retained.
- Adding fields to `GameDefRuntime` or any other type — the index remains an external cache only.
- Exporting `enumerateRawLegalMoves` only for tests.
- Introducing an action-pipeline index or refactoring other pipeline call sites in this ticket.
- Any compiler or CNL changes.
- Performance benchmarking.

## Acceptance Criteria

### Tests That Must Pass

1. Targeted engine tests covering the new index and legal-move behavior pass.
2. `pnpm turbo typecheck` passes.
3. `pnpm turbo lint` passes.
4. `pnpm turbo test` passes.

### Invariants

1. The WeakMap cache uses `def.actions` as key, not `def` itself — matching `def-lookup.ts`.
2. No new fields on `GameDefRuntime`, `GameDef`, or `ActionDef`.
3. The returned `actionsByPhase` map entries are readonly arrays.
4. Every action in `def.actions` appears in exactly as many buckets as it has unique phase entries.
5. `legalMoves` / `enumerateLegalMoves` behavior remains unchanged except for skipping phase-inapplicable actions before preflight.
6. The preflight phase check remains intact as a safety guard.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/phase-action-index.test.ts` — grouping, multi-phase membership, missing bucket, cache identity.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — behavior and source-guard coverage for phase-aware enumeration.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "phase action|phase-aware|legalMoves"`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm turbo test`

## Outcome

Completed: 2026-03-28

What actually changed:
- Added `packages/engine/src/kernel/phase-action-index.ts` as a WeakMap-cached `PhaseId -> ActionDef[]` index keyed by `def.actions`.
- Integrated the index into both raw enumeration loops in `packages/engine/src/kernel/legal-moves.ts`, while retaining the preflight phase check as the semantic safety guard.
- Added focused index tests in `packages/engine/test/unit/kernel/phase-action-index.test.ts`.
- Extended `packages/engine/test/unit/kernel/legal-moves.test.ts` with a behavior test and a source-guard test that proves `legal-moves.ts` now uses `getPhaseActionIndex`.

Deviations from original plan:
- The original micro-ticket split was not used. This ticket was corrected to own the full architectural unit of change: implementation plus tests.
- The tests verify phase-aware integration through public behavior and source-guard inspection rather than exporting `enumerateRawLegalMoves`, which remains private.

Verification results:
- `pnpm turbo build`
- `node --test packages/engine/dist/test/unit/kernel/phase-action-index.test.js`
- `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
