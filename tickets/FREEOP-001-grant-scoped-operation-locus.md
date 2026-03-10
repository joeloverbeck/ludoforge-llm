# FREEOP-001: Define grant-scoped operation locus and explicit sequence batching

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel free-operation discovery/authorization, turn-flow schemas/contracts, validation, FITL operation tests
**Deps**: data/games/fire-in-the-lake/41-content-event-decks.md, reports/fire-in-the-lake-rules-section-5.md, reports/fire-in-the-lake-rules-section-6.md

## Problem

Current free-operation grants can restrict moves only through generic `zoneFilter`, `moveZoneBindings`, and captured move-zone context. That is not precise enough to encode card text such as "within each" for operations whose meaningful space is not just "any zone string found in params". Card 56 exposed this gap:

1. Follow-up free operations are intended to be tied to one exact marched space.
2. The current engine infers candidate zones from generic move params, which is ambiguous for operations like March and brittle even for Rally.
3. Effect-issued grant sequencing currently relies on implicit batching derived from trace-path internals rather than an explicit contract.

Without a first-class agnostic model for operation locus and batch identity, GameSpecDoc authors are forced into card-specific workarounds that are hard to reason about and easy to mis-specify.

## Assumption Reassessment (2026-03-10)

1. `grantFreeOperation` currently supports `zoneFilter`, `moveZoneBindings`, `moveZoneProbeBindings`, `sequence`, `sequenceContext`, and `executionContext`, but it does not provide an explicit notion of "this operation is authorized only in these exact spaces". Confirmed in `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, and related schema files.
2. Effect-issued sequence batching is currently runtime-derived in `packages/engine/src/kernel/effects-turn-flow.ts` from `traceContext.effectPathRoot`, active seat, and `sequence.chain`. This fixed one concrete bug for card 56, but the batching contract is still implicit and not validated as authored behavior.
3. FITL card 56 currently compiles and passes its focused tests, but it still relies on generic move-zone inference rather than a dedicated "within each selected space" engine contract. The corrected scope of this ticket is therefore broader than a single card bugfix: it defines the reusable engine feature that card 56 and similar cards should use.

## Architecture Check

1. A first-class agnostic operation-locus contract is cleaner than piling more card-specific `zoneFilter` patterns into GameSpecDoc. It centralizes how free operations bind to spaces and removes inference from arbitrary move params.
2. The new capability belongs in shared turn-flow/kernel contracts because it describes generic free-operation authorization semantics. GameSpecDoc remains responsible only for supplying game-specific values such as selected spaces or operation classes.
3. No backwards-compatibility shims should be introduced. Replace the current ad hoc patterns with the new contract directly and update existing data/tests accordingly.

## What to Change

### 1. Define an explicit grant-scoped operation locus contract

Add a new agnostic free-operation grant contract that can express:

1. Exact allowed locus spaces for a granted operation or special activity.
2. Whether the locus applies to operation initiation space, affected space, destination space, or another explicitly named action semantic defined by the action pipeline.
3. Authorization/discovery behavior for unresolved decisions, so legal move generation and final apply use the same semantics.

The design must be generic enough for COIN/FITL and any future game using action pipelines with spatial decisions.

### 2. Define explicit sequence-batch semantics for effect-issued grants

Replace the current implicit batch derivation from trace-path internals with an explicit authored/runtime contract for effect-issued sequence batches. The solution must:

1. Allow sibling effect-issued grants to intentionally share captured sequence context.
2. Prevent accidental coupling between unrelated grants that only happen to share a seat and `sequence.chain`.
3. Be validated at GameDef behavior-validation time so ambiguous batching is rejected before runtime.

### 3. Thread the new contract through discovery, authorization, and validation

Update:

1. schema/types for authored grants and pending grants,
2. behavior validation,
3. legal move discovery,
4. free-operation authorization,
5. sequence-context capture/consumption,
6. overlap/equivalence diagnostics.

The same contract must drive both legal move surfacing and final move legality.

### 4. Add focused engine-level regression coverage

Add tests that prove:

1. exact-space follow-up grants work for multiple operation classes, not just Rally,
2. unresolved discovery does not over-surface impossible free moves,
3. effect-issued batch identity is explicit and deterministic,
4. overlapping or ambiguous batch/locus definitions fail validation.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-overlap.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify)

## Out of Scope

- Visual presentation changes or `visual-config.yaml` work
- Runner-only rendering behavior
- Card-specific FITL data rewrites beyond what is required to support engine-level tests in this ticket

## Acceptance Criteria

### Tests That Must Pass

1. A free-operation grant can authoritatively bind a follow-up operation to one exact space without relying on generic zone-string inference.
2. Effect-issued sequence grants use explicit batch semantics and reject ambiguous or accidental context sharing.
3. Existing suite: `pnpm -F @ludoforge/engine build`
4. Existing suite: `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. `GameDef` and runtime/kernel remain game-agnostic; FITL-specific spaces, factions, and card semantics stay in GameSpecDoc data/tests only.
2. No backwards-compatibility aliases or dual semantic paths are added; the new contract becomes the single supported model for this behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add direct coverage for exact-locus grants, explicit batch semantics, and validation failures.
2. `packages/engine/test/integration/fitl-insurgent-operations.test.ts` — verify locus-aware authorization across Rally/March or other space-driven insurgent actions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node packages/engine/dist/test/integration/fitl-insurgent-operations.test.js`
