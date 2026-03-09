# ENGINEARCH-151: Unify Free-Operation Overlap Discovery and Apply Contracts

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal-move discovery, free-operation denial analysis, and apply-time overlap parity
**Deps**: archive/tickets/ENGINEARCH-150-extract-shared-free-operation-overlap-classifier.md, archive/tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md, packages/engine/src/kernel/legal-moves-turn-order.ts, packages/engine/src/kernel/free-operation-discovery-analysis.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts, packages/engine/src/kernel/legal-choices.ts

## Problem

Ambiguous overlapping free-operation grants are now rejected when a move is applied, but discovery still evaluates grants independently and can expose those same moves as legal/free-operation-capable. That creates a contract split between legal-move generation and actual move execution.

## Assumption Reassessment (2026-03-09)

1. `applyMove` and grant consumption now use `resolveAuthorizedPendingFreeOperationGrants(...)`, which enforces overlap-aware canonical selection and rejects ambiguous top-ranked matches.
2. Discovery is not calling `doesGrantAuthorizeMove(...)` directly, but it still reconstructs authorization through `analyzeFreeOperationGrantMatch(...)` and only checks per-grant compatibility/context/zone matches. It does not invoke the ambiguity guard or canonical overlap resolver.
3. `legalMoves` currently depends on discovery helpers (`isFreeOperationApplicableForMove(...)` and `isFreeOperationGrantedForMove(...)`) inside `applyPendingFreeOperationVariants(...)`, so discovery can still surface a free-operation move that apply-time authorization later rejects as an ambiguous overlap contract violation.
4. `legalChoicesDiscover` already routes free-operation analysis through the dedicated `free-operation-discovery-analysis.ts` boundary, so parity scope must include that surface explicitly rather than treating discovery as only a legal-moves concern.
5. Existing apply-time coverage already proves ambiguous overlap rejection in `packages/engine/test/unit/kernel/apply-move.test.ts`, but there is no matching regression that proves `legalMoves` and `legalChoicesDiscover` suppress the same ambiguous state. Corrected scope: unify discovery and apply around one shared overlap contract and extend parity coverage across all three surfaces.

## Architecture Check

1. A move should not be legal in discovery if the same engine contract will reject it during application.
2. The clean boundary is not to duplicate more grant filtering inside discovery; it is to make discovery consume the same overlap-aware authorization core and then project its result into discovery-facing denial semantics.
3. This is a kernel contract issue, not a game-data issue. The fix belongs in shared game-agnostic turn-flow analysis.
4. No backwards-compatibility fallback should preserve the current split. Discovery and apply must converge on one authoritative answer.

## What to Change

### 1. Reuse overlap-aware resolution in discovery/preflight

Update legal-move and denial/preflight paths so ambiguous top-ranked overlaps are detected before moves are surfaced as legal free operations.

### 2. Define discovery-facing behavior for ambiguity

Choose one canonical discovery contract and apply it consistently:
- add an explicit ambiguity denial reason that legal-choice/preflight surfaces can report deterministically
- suppress ambiguous free-operation variants from `legalMoves` using that same result

Do not allow apply-time-only failure for a move that discovery marked legal.

### 3. Add parity regression coverage

Add tests proving dynamic/effect-issued ambiguous overlaps are handled identically in:
- legal move generation
- legal choice / discovery-denial analysis
- apply-time execution

## Files to Touch

- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify if shared discovery adapter belongs there)
- `packages/engine/src/kernel/free-operation-legality-policy.ts` (modify only if a new denial cause is required)
- `packages/engine/src/kernel/free-operation-denial-contract.ts` (modify if ambiguity becomes a first-class denial cause)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` (modify only if denial taxonomy changes)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)

## Out of Scope

- Declarative `GameDef` validation for statically knowable event-grant overlaps
- Visual/simulator presentation behavior

## Acceptance Criteria

### Tests That Must Pass

1. Dynamic ambiguous top-ranked free-operation overlaps are not surfaced as legal free-operation moves.
2. `legalChoicesDiscover`, `legalMoves`, and `applyMove` produce parity-equivalent outcomes for ambiguous overlap states.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
5. Existing suite: `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Legal-move generation and move application share one free-operation overlap contract.
2. No game-specific identifiers or per-title exceptions are introduced to decide overlap ambiguity.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — assert ambiguous dynamic overlaps do not produce legal free-operation variants.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — assert ambiguous overlap parity across `legalChoicesDiscover`, `legalMoves`, and `applyMove`.
3. `packages/engine/test/unit/kernel/apply-move.test.ts` — keep apply-time ambiguity/backstop coverage aligned with discovery parity.
4. `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` — add coverage if a dedicated ambiguity denial reason is introduced.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-09
- Outcome amended: 2026-03-09
- What actually changed:
  - Added a first-class discovery/apply denial cause for ambiguous top-ranked overlapping free-operation grants instead of leaving ambiguity as an apply-only runtime-contract exception.
  - Reused the shared overlap-equivalence logic from `free-operation-grant-authorization.ts` inside discovery analysis without re-running zone-filter evaluation, so existing deferred-binding discovery behavior stays intact.
  - Updated `legalMoves`, `legalChoicesDiscover`, and `applyMove` parity through the shared denial contract and legality-policy mapping.
  - Added regression coverage in `legal-moves.test.ts`, `legality-surface-parity.test.ts`, `apply-move.test.ts`, and `free-operation-legality-policy.test.ts`.
- Deviations from original plan:
  - The real discovery seam included `legal-choices.ts` and `legality-surface-parity.test.ts`, so the ticket scope was expanded there and corrected away from the non-existent `legal-moves-turn-order.test.ts` target.
  - Apply-time ambiguity handling was tightened into a deterministic illegal-move denial for dynamic overlap states rather than remaining a runtime-contract-only failure path.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-legality-policy.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
