# ENG-217: Complete Sequence-Context Control-Flow Path Traversal

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect traversal utility, GameDef validation, sequence-context diagnostics
**Deps**: archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-216-path-sensitive-sequence-context-linkage-validation.md, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effects-control.ts, packages/engine/src/kernel/effects-subset.ts

## Problem

The new path-sensitive sequence-context validator still misses some executable control-flow subtrees. In particular, `forEach.effects` and `evaluateSubset.compute` are traversed for grant presence but their resulting path state is discarded, so invalid `requireMoveZoneCandidatesFrom` linkages inside those paths can pass validation or be evaluated against the wrong prior grant set.

## Assumption Reassessment (2026-03-09)

1. Runtime executes `forEach.effects` before optional `forEach.in`, and both are real effect lists that can contain `grantFreeOperation`.
2. Runtime also executes `evaluateSubset.compute` as an effect list while scoring candidate subsets, so the validator must not half-model it.
3. Mismatch: `effect-grant-sequence-context-paths.ts` currently checks those subtrees for relevant grants but drops the returned path state. Correction: the validator must either fully model each executable subtree in path order or reject unsupported grant placement explicitly.

## Architecture Check

1. A single, explicit rule for how each control-flow effect contributes to sequence-context linkage is cleaner than ad hoc partial recursion.
2. The fix stays entirely in generic effect/control-flow semantics; no game-specific identifiers or per-game exceptions leak into `GameDef`, validation, or simulation.
3. No backwards-compatibility shim is needed; the validator should have one canonical path model that matches current runtime execution.

## What to Change

### 1. Thread path state through all executable control-flow subtrees

Update `collectEffectGrantSequenceContextExecutionPaths` so every executable effect list that can issue grants contributes to the returned path state in runtime order. At minimum this must cover `forEach.effects` and any continuation that depends on it, instead of discarding those grants.

### 2. Define `evaluateSubset.compute` semantics explicitly

Choose one canonical rule and encode it in both validation and tests:
- either `evaluateSubset.compute` participates in sequence-context linkage because its grants are semantically valid for later checks, or
- `grantFreeOperation` with sequence-context contracts is illegal inside `evaluateSubset.compute` and must produce a deterministic diagnostic.

Do not leave it partially traversed.

### 3. Add regression coverage for missed control-flow forms

Add targeted validation tests that fail on the current implementation and prove the fixed traversal order. Include at least one invalid case and one valid same-path case for loop-style control flow.

## Files to Touch

- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify, if diagnostics or unsupported-placement policy changes)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify if runtime boundary coverage is needed)

## Out of Scope

- Mandatory completion/outcome contracts from `tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md`
- Ia Drang data re-encoding from `tickets/ENG-204-ia-drang-reencode-on-grant-contracts.md`
- Visual presentation or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. A `forEach.effects` capture cannot be ignored when a later `forEach.in` or sibling continuation requires that capture on the same execution path.
2. An impossible linkage inside loop/subset control flow is rejected deterministically instead of passing due to dropped path state.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. Sequence-context linkage validation matches generic runtime control-flow ordering for supported effect nodes.
2. `GameDef` validation remains game-agnostic; all game-specific behavior stays in `GameSpecDoc` data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add loop/subset sequence-context regression cases that pin the intended path semantics.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a realistic nested issuance case if a runtime boundary check is needed beyond unit validation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`
