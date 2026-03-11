# ENGINEARCH-167: Legality-backed choice-domain expressiveness for dependent token selection

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering and generic choice/query expressiveness
**Deps**: archive/tickets/FITLEVECARENC-022-enable-dependent-target-selectors-in-event-card-compilation.md, archive/tickets/ENG-220-align-event-target-selector-validation-with-canonical-choice-contracts.md

## Problem

Current authoring support for `chooseN.options` token domains is not expressive enough to say "only let the player select source tokens that have at least one legal downstream destination." For card-65 unshaded, that meant out-of-play US Bases could not be pre-filtered to only those with a legal map placement. The card had to select from a broader source domain and defer legality enforcement to later destination choices.

That pattern is correct but not ideal: it weakens authoring precision, inflates choice domains, and makes event data harder to read.

## Assumption Reassessment (2026-03-11)

1. The attempted source-domain encoding for card-65 unshaded required aggregate/map-space legality checks inside a token-domain filter and triggered compiler missing-capability diagnostics instead of lowering.
2. Existing work in `FITLEVECARENC-022` expanded dependent target-selector support, but it did not provide a generic source-option contract for legality-backed token selection.
3. The current card-65 data in `data/games/fire-in-the-lake/41-events/065-096.md` remains correct only because destination legality is enforced after source selection, not because the source domain itself can express the full rule.

## Architecture Check

1. The right fix is a generic authoring/runtime construct for dependent source-option legality, not a FITL-only selector primitive.
2. This keeps game-specific rules in `GameSpecDoc` while preserving the engine as a generic evaluator of declarative legality constraints.
3. No backwards-compatibility aliasing: add one canonical way to express legality-backed dependent source domains.

## What to Change

### 1. Define a canonical source-option legality construct

Add a generic authoring form that lets a choice domain express "include this source option only if an existential downstream legality condition holds." This can be an `exists`-style predicate over derived destination queries or an equivalent canonical construct, but it must be generic and reusable.

### 2. Lower and evaluate the construct consistently

Update compiler and runtime legality evaluation so the new construct is supported in token-domain filters or equivalent choice-domain declarations, with deterministic behavior in both validation and execution surfaces.

### 3. Add a direct dependent-selection regression

Add tests covering a source-token choice whose legality depends on whether a later destination query is non-empty, including at least one token that must be excluded from the source domain because it has no legal destination.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` or the current choice-lowering entrypoint (modify)
- `packages/engine/src/kernel/eval-query.ts` and/or `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify in follow-up only; not in this ticket)

## Out of Scope

- Reworking card-65 itself in this ticket
- Introducing FITL-specific query names or predicates
- UI changes to how large option domains are displayed

## Acceptance Criteria

### Tests That Must Pass

1. A GameSpec author can encode a token choice that excludes sources with zero legal downstream destinations using a generic construct.
2. The compiler accepts that encoding without missing-capability diagnostics.
3. Runtime legality and execution honor the filtered source domain consistently.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Source-option legality stays declarative and game-agnostic.
2. Compiler/runtime parity holds for the new construct.
3. The construct must not require visual-config data or game-specific engine branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — compiler accepts the new legality-backed source-domain shape.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — runtime excludes source options with no legal downstream destination.
3. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — tighten unshaded source-domain expectations after the follow-up ticket lands.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
