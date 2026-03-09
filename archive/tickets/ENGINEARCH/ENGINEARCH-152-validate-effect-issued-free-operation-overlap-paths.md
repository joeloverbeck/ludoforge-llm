# ENGINEARCH-152: Validate Effect-Issued Free-Operation Overlap Paths

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — path-sensitive `GameDef` validation for effect-issued free-operation overlaps
**Deps**: archive/tickets/ENGINEARCH-150-extract-shared-free-operation-overlap-classifier.md, archive/tickets/ENG/ENG-216-path-sensitive-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-217-complete-sequence-context-control-flow-path-traversal.md, packages/engine/src/kernel/effect-grant-execution-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts

## Problem

Static ambiguity rejection was added for declarative event-card `freeOperationGrants`, but the validator still does not analyze `grantFreeOperation` effects that are statically co-issued on the same execution path. Those cases remain valid at the `GameDef` boundary and are only rejected later by runtime overlap handling.

## Assumption Reassessment (2026-03-09)

1. `validate-gamedef-behavior.ts` now rejects ambiguous event-side/branch `freeOperationGrants`.
2. `validate-gamedef-behavior.ts` still validates `grantFreeOperation` effects only through the generic effect validator; it does not run overlap ambiguity analysis across effect execution paths.
3. Existing path-sensitive infrastructure already traverses effect execution paths for sequence-context linkage, including `if` and `forEach` control flow. Correction: reuse or generalize that path analysis so it can collect effect-issued grant occurrences, not only sequence-context linkage references.
4. The current test surface is broader than originally assumed:
   - `packages/engine/test/unit/validate-gamedef.test.ts` already covers declarative overlap rejection plus effect-path sequence-context scope behavior.
   - `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` already covers the path collector directly.
   - `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` already covers declarative overlap rejection and several effect-issued runtime behaviors, but not static rejection of ambiguous effect-issued overlaps at `GameDef` validation time.

## Architecture Check

1. Effect-issued free-operation grants are still authored game data and should be validated at the same game-agnostic boundary when their overlap is statically knowable.
2. Reusing the existing execution-path traversal is cleaner than inventing a second bespoke effect walker for overlap validation.
3. The cleaner long-term shape is a generic effect grant path collector that can support multiple validation passes from one traversal contract, instead of a sequence-context-specific collector plus ad hoc future walkers.
4. No backwards-compatibility shim should preserve invalid same-path overlap authoring. Invalid effect-issued overlap should become a hard validation failure.

## What to Change

### 1. Collect effect-issued grant overlap candidates per execution path

Extend or generalize the existing path-sensitive effect traversal so it can collect `grantFreeOperation` path occurrences, not only sequence-context linkage references.

### 2. Validate statically co-issued effect overlaps

For each execution path where multiple effect-issued grants can co-issue, run the shared overlap classifier and emit deterministic diagnostics when top-ranked overlaps are ambiguous.

### 3. Add side/branch path coverage

Cover:
- same execution-path effect issuance
- side + selected-branch effect paths
- alternative/control-flow paths that must remain non-overlapping when they are mutually exclusive

## Files to Touch

- `packages/engine/src/kernel/effect-grant-execution-paths.ts` (modify or extract shared path collector support)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` (modify/add if the collector contract is generalized)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify/add because `initialState(...)` is the concrete `GameDef` validation boundary for these event cards)

## Out of Scope

- Runtime discovery/apply parity for dynamic ambiguity
- Reworking event effect timing semantics unrelated to overlap validation

## Acceptance Criteria

### Tests That Must Pass

1. Same-path effect-issued ambiguous top-ranked free-operation overlaps are rejected by `GameDef` validation.
2. Mutually exclusive effect paths do not trigger false-positive ambiguity diagnostics.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
5. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
6. Existing suite: `pnpm -F @ludoforge/engine lint`
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Statically knowable free-operation overlap ambiguity is rejected at the `GameDef` boundary regardless of whether grants are declared directly or emitted by effects.
2. Path-sensitive overlap validation remains generic and does not encode game-specific card or scenario logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add same-path effect-issued ambiguity rejection and mutually exclusive path non-regression cases.
2. `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` — extend only if the path collector surface changes or a new collector invariant needs direct unit coverage.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add `initialState(...)` validation-boundary coverage for invalid effect-issued overlaps and a non-regression case where mutually exclusive branches remain valid.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-09
- Outcome amended: 2026-03-09
- What changed:
  - Generalized `packages/engine/src/kernel/effect-grant-execution-paths.ts` into a reusable effect-grant execution-path collector, while preserving the existing sequence-context collector as a wrapper over the shared traversal.
  - Reused that generic traversal inside `validate-gamedef-behavior.ts` so static overlap ambiguity is now checked for effect-issued `grantFreeOperation` paths, not only declarative event `freeOperationGrants`.
  - Added direct collector coverage plus unit and integration coverage for same-path rejection, side-plus-branch rejection, and mutually exclusive path non-regression.
  - Renamed the collector module from `effect-grant-sequence-context-paths.ts` to `effect-grant-execution-paths.ts` so the file name matches the generalized, non-sequence-context-specific responsibility.
- Deviations from original plan:
  - The implementation was slightly broader and cleaner than the original ticket wording: overlap validation was added to the existing generic effect grant scope pass, so the architecture now supports all effect scopes already routed through that validator rather than adding an event-only special case.
  - `packages/engine/src/kernel/sequence-context-linkage-grant-reference.ts` did not need changes.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
