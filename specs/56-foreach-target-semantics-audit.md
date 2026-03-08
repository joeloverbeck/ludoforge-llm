# Spec 56: forEach Target-Semantics Audit and Canonicalization

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 29 (FITL Event Card Encoding), archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, archive/tickets/FITLEVENTARCH-002-choice-validation-error-classification.md
**Estimated effort**: 2-4 days

## Overview

Audit all current `forEach` usage in `data/games/*` and migrate only the cases where `forEach` is acting as a substitute for canonical event target semantics.

This spec explicitly does not propose a blanket rewrite. `forEach` remains the correct tool for true collection iteration.

## Why This Matters

Canonical `targets + cardinality + application: each` is cleaner and more robust than card-local manual loops when the intent is "select targets, then apply per-target effects".

Benefits:
- stronger declarative intent in `GameSpecDoc`
- less card-specific control-flow noise
- more consistent parameter validation/diagnostics
- easier future maintenance and card authoring

## Audit Findings (2026-03-08)

### Repository-Level Inventory (`data/games/*`)

- `data/games/fire-in-the-lake/30-rules-actions.md`: 84 `forEach`
- `data/games/fire-in-the-lake/41-content-event-decks.md`: 58 `forEach`
- `data/games/fire-in-the-lake/20-macros.md`: 46 `forEach`
- `data/games/texas-holdem/20-macros.md`: 17 `forEach`
- `data/games/texas-holdem/30-rules-actions.md`: 8 `forEach`

### Classification Summary

1. **Keep as-is (majority)**
- setup/cleanup loops over players
- piece movement loops over selected tokens
- macro-level procedural expansion where no event-target contract exists
- nested collection loops (for example, per-space then per-token)

2. **Migrate to canonical targets (high-confidence subset)**
- event-side effects that first choose/hold target-space bindings and then manually iterate those targets with `forEach`

## Migration Decision Rule

Migrate only when all are true:

1. The card effect semantically starts from selecting map targets.
2. Outer iteration is over selected targets (not over tokens/entities inside a target).
3. Per-target behavior can be represented as target-local effects under `application: each`.

Keep `forEach` when any are true:

1. Iteration is over tokens/pieces/cards/players rather than target spaces.
2. Iteration is over dynamically built non-target collections.
3. The logic is genuinely procedural and not target application.

## Recommended Changes

### A. High-Confidence Event-Card Canonicalizations

1. `card-21` (Americal, shaded)
- File: `data/games/fire-in-the-lake/41-content-event-decks.md` (around lines 2854-2904)
- Current pattern: selected provinces iterated by `forEach` over `$targetProvince`
- Recommendation: migrate outer loop to target-level `application: each`; keep inner per-piece iteration where still needed.

2. `card-24` (Operation Starlite, shaded)
- File: `data/games/fire-in-the-lake/41-content-event-decks.md` (around lines 3288-3346)
- Current pattern: already has `targets`, but uses `application: aggregate` plus explicit `forEach` over `$targetProvince`
- Recommendation: switch to `application: each` and remove only the redundant outer target loop.

3. `card-27` (Phoenix Program, shaded)
- File: `data/games/fire-in-the-lake/41-content-event-decks.md` (around lines 3998-4032)
- Current pattern: choose target spaces then `forEach` over `$targetSpaces`
- Recommendation: introduce canonical `targets` for shaded side and apply per-target marker/terror logic via `application: each`.

4. `card-30` (USS New Jersey, unshaded)
- File: `data/games/fire-in-the-lake/41-content-event-decks.md` (around lines 6650-6695)
- Current pattern: `chooseN $targetProvinces` then `forEach` to shift each province
- Recommendation: move to `targets + application: each` with direct per-target `shift-support-opposition` macro call.

5. `card-110` (No Contact, shaded)
- File: `data/games/fire-in-the-lake/41-content-event-decks.md` (around lines 9503-9533)
- Current pattern: single-target selection with `application: aggregate` and inner `forEach` for up-to-2 guerrillas
- Recommendation: move to `application: each` for target-level contract consistency; keep inner token loop (`forEach` over guerrillas) as legitimate collection iteration.

### B. Explicit Non-Migration Areas

1. `data/games/fire-in-the-lake/30-rules-actions.md`
- Most `forEach` loops are operation-pipeline procedural stages, not event target application.

2. `data/games/fire-in-the-lake/20-macros.md`
- Macro internals are intentionally procedural and reused broadly.

3. `data/games/texas-holdem/*`
- `forEach` usage is primarily player/seat/pot iteration and should remain intact.

## Test Plan Updates (Required)

### Existing Tests to Update

1. `packages/engine/test/integration/fitl-events-1968-us.test.ts`
- Update card-shape assertions that currently expect `forEach`-centric structures for `card-21` and legacy non-target assumptions for `card-27`.

2. `packages/engine/test/integration/fitl-events-phoenix-program.test.ts`
- Replace `targets === undefined` expectation for shaded side with canonical target-shape assertions.

### Existing Tests to Re-Run

1. `packages/engine/test/integration/fitl-events-operation-starlite.test.ts`
2. `packages/engine/test/integration/fitl-events-phoenix-program.test.ts`
3. `packages/engine/test/integration/fitl-events-uss-new-jersey.test.ts`
4. `packages/engine/test/integration/fitl-events-1968-us.test.ts`

### New Tests to Add

1. `packages/engine/test/integration/fitl-events-no-contact.test.ts`
- Add dedicated behavior + contract coverage for `card-110` (currently missing).
- Cover target legality, flip limits, and US troop casualty movement invariants.

## Implementation Phases

### Phase 1: Data-only Canonicalization

- Migrate only the five high-confidence card sides above.
- Preserve behavior and text semantics exactly.
- No backward-compatibility aliases or dual-shape support.

### Phase 2: Test Contract Alignment

- Update assertions from structural `forEach` internals to canonical target contracts.
- Keep behavior tests intact or strengthen where needed.

### Phase 3: Validation

Run at minimum:
1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-operation-starlite.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-phoenix-program.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-uss-new-jersey.test.js`
5. `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js`
6. `node --test packages/engine/dist/test/integration/fitl-events-no-contact.test.js`
7. `pnpm -F @ludoforge/engine test`
8. `pnpm turbo lint`

## Acceptance Criteria

1. The five listed card sides are canonicalized without behavior drift.
2. No procedural/macro loops are migrated where target semantics do not apply.
3. Target-related invalid selection diagnostics remain canonical (`MOVE_PARAMS_INVALID`).
4. All listed tests pass, plus full engine suite and lint.

## Risks and Mitigations

1. Risk: Accidental behavioral drift while converting loop shape.
- Mitigation: card-specific behavior tests and before/after invariants for each migrated card.

2. Risk: Over-canonicalizing legitimate collection loops.
- Mitigation: strict migration rule above; only migrate outer target-substitute loops.

3. Risk: Test brittleness due AST-shape coupling.
- Mitigation: assert canonical contract and outcomes, not incidental loop internals.

## Follow-On Architecture Hardening

1. Add a data-contract lint policy that flags likely target-substitute `forEach` patterns in event sides.
- Example heuristic: `chooseN`/`targets` selecting spaces followed by outer `forEach` over those selected spaces.
- Enforcement: warning first, then error once current migration set is complete.

2. Prefer canonical target-contract assertions in integration tests over low-level AST loop-shape assertions.
