# ENGINEARCH-152: Validate Effect-Issued Free-Operation Overlap Paths

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — path-sensitive `GameDef` validation for effect-issued free-operation overlaps
**Deps**: archive/tickets/ENGINEARCH-150-extract-shared-free-operation-overlap-classifier.md, archive/tickets/ENG/ENG-216-path-sensitive-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-217-complete-sequence-context-control-flow-path-traversal.md, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts

## Problem

Static ambiguity rejection was added for declarative event-card `freeOperationGrants`, but the validator still does not analyze `grantFreeOperation` effects that are statically co-issued on the same execution path. Those cases remain valid at the `GameDef` boundary and are only rejected later by runtime overlap handling.

## Assumption Reassessment (2026-03-09)

1. `validate-gamedef-behavior.ts` now rejects ambiguous event-side/branch `freeOperationGrants`.
2. The same file still validates `grantFreeOperation` effects only through the generic effect validator; it does not run overlap ambiguity analysis across effect execution paths.
3. Existing path-sensitive infrastructure already traverses effect execution paths for sequence-context linkage. Correction: reuse that path analysis to detect statically co-issued effect grants and apply the same generic overlap classifier when co-issuance is certain.

## Architecture Check

1. Effect-issued free-operation grants are still authored game data and should be validated at the same game-agnostic boundary when their overlap is statically knowable.
2. Reusing existing execution-path traversal is cleaner than inventing a second bespoke effect walker for overlap validation.
3. No backwards-compatibility shim should preserve invalid same-path overlap authoring. Invalid effect-issued overlap should become a hard validation failure.

## What to Change

### 1. Collect effect-issued grant overlap candidates per execution path

Extend the existing path-sensitive effect traversal so it can collect `grantFreeOperation` overlap candidates, not only sequence-context linkage references.

### 2. Validate statically co-issued effect overlaps

For each execution path where multiple effect-issued grants can co-issue, run the shared overlap classifier and emit deterministic diagnostics when top-ranked overlaps are ambiguous.

### 3. Add side/branch path coverage

Cover:
- same-array sequential effect issuance
- side + selected-branch effect paths
- alternative/control-flow paths that must remain non-overlapping when they are mutually exclusive

## Files to Touch

- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify or extract shared path collector support)
- `packages/engine/src/kernel/sequence-context-linkage-grant-reference.ts` (modify only if generalized grant references belong here)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify only if executable effect-path regression coverage adds value)

## Out of Scope

- Runtime discovery/apply parity for dynamic ambiguity
- Reworking event effect timing semantics unrelated to overlap validation

## Acceptance Criteria

### Tests That Must Pass

1. Same-path effect-issued ambiguous top-ranked free-operation overlaps are rejected by `GameDef` validation.
2. Mutually exclusive effect paths do not trigger false-positive ambiguity diagnostics.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Statically knowable free-operation overlap ambiguity is rejected at the `GameDef` boundary regardless of whether grants are declared directly or emitted by effects.
2. Path-sensitive overlap validation remains generic and does not encode game-specific card or scenario logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add same-path effect-issued ambiguity rejection and mutually exclusive path non-regression cases.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add executable coverage only if a runtime-facing effect-path boundary remains meaningful after validation tightening.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`
