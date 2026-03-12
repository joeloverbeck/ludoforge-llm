# ENGINEARCH-209: Sequence-Captured Zone Sets for Later Grant Evaluation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — free-operation overlay transport, captured-sequence eval/query surfaces, and discovery/apply parity
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/kernel/free-operation-overlay.ts`, `packages/engine/src/kernel/free-operation-preflight-overlay.ts`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/free-operation-grant-bindings.ts`, `packages/engine/src/kernel/resolve-ref.ts`, `packages/engine/src/kernel/predicate-value-resolution.ts`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/validate-queries.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/unit/schemas-ast.test.ts`

## Problem

The engine already captures same-batch move-zone selections through `sequenceContext.captureMoveZoneCandidatesAs`, but later grants can only consume that information indirectly via `requireMoveZoneCandidatesFrom`. That is too narrow for exact authoring of chained free operations where later legality, targeting, or action logic must read the earlier selection set through normal generic eval/query surfaces.

The current limitation blocks exact authoring for patterns such as:
- Rally in authored spaces, then allow a later move only when selected pieces originate from that earlier space set.
- Chained grants whose later legality needs set membership against prior selected spaces rather than simple candidate-zone overlap.

## Assumption Reassessment (2026-03-12)

1. `packages/engine/src/kernel/turn-flow-eligibility.ts` persists captured move-zone sets per sequence batch in `freeOperationSequenceContexts.capturedMoveZonesByKey`, so the engine already owns the underlying runtime data.
2. `packages/engine/src/kernel/free-operation-grant-authorization.ts` currently lets later grants consume that data only through `requireMoveZoneCandidatesFrom`, which checks overlap between current move-zone candidates and the captured set. It does not expose the set as a generic value/query surface.
3. `packages/engine/src/kernel/event-execution.ts` plus deferred event effects already provide a clean sequencing mechanism (`effectTiming: afterGrants`) for staged grant issuance; the missing piece is not event sequencing itself but generic access to the captured zone set during later grant evaluation.
4. Mismatch: the current `executionContext` contract is eagerly resolved when the grant is issued (`effects-turn-flow.ts` and `turn-flow-eligibility.ts`), so it is the wrong architectural extension point for late-bound captured-zone data. Scope corrected to add a first-class captured-sequence read surface instead of mutating `executionContext` semantics.

## Architecture Check

1. Exposing captured zone sets through a first-class generic eval/query surface is cleaner than proliferating operation-specific free-operation flags, FITL-only grant helpers, or overloading `executionContext` with late-bound semantics it was not designed to carry.
2. This preserves the boundary: `GameSpecDoc` authors describe how a later grant depends on a prior selected zone set, while `GameDef`, compiler, and kernel only transport and evaluate generic sequence-derived data.
3. No backwards-compatibility aliasing should be retained for the new surface. Introduce one canonical read surface for captured sequence zones and use it consistently anywhere the free-operation overlay is available.
4. The new surface must remain reusable for any game and any action family, not only FITL events.

## What to Change

### 1. Add a canonical runtime surface for captured sequence-zone sets

Extend the generic free-operation evaluation model so later grants can reference a captured sequence-zone set by batch-local key inside:
- `zoneFilter`
- normal action legality / targeting / effect value expressions
- query-driven authoring surfaces that already evaluate against the free-operation overlay

Do not retrofit this into `executionContext`; keep `executionContext` issue-time-resolved and add a distinct late-bound surface for captured sequence zones.

### 2. Align validation and lowering with the new surface

Update AST/schema/query validation so the new captured-set reference is:
- available only on surfaces that already run with a free-operation overlay
- rejected when used with malformed keys or unsupported shape
- consistent anywhere declarative grants or effect-issued grants can later evaluate free-operation logic

### 3. Keep discovery, legal-move generation, and apply-time authorization aligned

Later grants that rely on captured sets must behave the same way in:
- event play viability
- `legalMoves`
- `legalChoicesDiscover` / denial analysis
- `applyMove`

Do not allow discovery to surface a free move that apply-time grant authorization later rejects because the captured-set surface was unavailable or inconsistently resolved.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/free-operation-overlay.ts` (modify)
- `packages/engine/src/kernel/free-operation-preflight-overlay.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-bindings.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/src/kernel/predicate-value-resolution.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/validate-queries.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)

## Out of Scope

- Re-encoding Fire in the Lake card data in this ticket.
- Adding game-specific operation classes, event hooks, or FITL-only runtime branches.
- Visual presentation or `visual-config.yaml` changes.

## Acceptance Criteria

### Tests That Must Pass

1. A later free-operation grant can reference a same-batch captured move-zone set through a canonical generic runtime surface, without using `requireMoveZoneCandidatesFrom` as the only consumer.
2. The new captured-set surface resolves identically in free-operation discovery, legal-move generation, and apply-time evaluation.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Captured sequence-zone data is exposed through a generic engine contract, not through Fire in the Lake specific identifiers or branches.
2. `GameSpecDoc` remains the source of game-specific chained-operation logic; `GameDef`, compiler, kernel, and simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — prove later grants can consume captured zone sets through the new generic surface and that discovery/apply stay aligned.
2. `packages/engine/test/unit/schemas-ast.test.ts` — prove the AST accepts the new canonical captured-sequence ref/query surface.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/unit/schemas-ast.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
6. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Added a first-class `capturedSequenceZones` ref/query surface instead of overloading `executionContext`, and threaded captured batch data through the existing free-operation overlay path.
  - Updated free-operation discovery, legality, move-binding resolution, and apply-time zone-filter evaluation so the same captured zone-set data is available consistently across discovery and execution.
  - Added integration coverage for zone-filter and query-driven later grants that read captured sequence zones, plus AST-schema coverage for the new surface and regenerated engine schema artifacts.
- Deviations from original plan:
  - The implementation intentionally did not make `executionContext` late-bound. Reassessing the live code showed that `executionContext` is issue-time-resolved, so mutating it into a deferred transport channel would have been a less robust architecture than a dedicated read surface.
  - Validation scope stayed focused on AST/query-surface validity rather than adding new sequence-key linkage diagnostics for every captured-sequence read site.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `node --test packages/engine/dist/test/unit/schemas-ast.test.js`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
  - `pnpm run check:ticket-deps`
