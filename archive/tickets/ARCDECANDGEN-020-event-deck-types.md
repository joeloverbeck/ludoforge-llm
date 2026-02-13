# ARCDECANDGEN-020: Generic Event Deck Type Definitions

**Status**: ✅ COMPLETED
**Phase**: 8A (Generic Event Deck Subsystem — type contracts)
**Priority**: P2
**Complexity**: M
**Dependencies**: ARCDECANDGEN-001
**Reference**: `specs/32-architecture-decomposition-and-generalization.md` (Problem 8, Phase 1A)

## Goal (Corrected)

Reassess and correct this ticket so its assumptions match the current codebase, then define the right scope for a future implementation that removes opaque `Record<string, unknown>` event payloads in favor of AST-typed contracts.

## Reassessed Assumptions vs Current Code

1. The event deck model already exists in split architecture files.
- `src/kernel/types-events.ts` exists and defines `EventDeckDef`/`EventCardDef` plus nested event-card types.
- `src/kernel/types-core.ts` already has `GameDef.eventDecks?: readonly EventDeckDef[]`.

2. The ticket's originally proposed type names do not match real names.
- Current types are `EventCardTargetDef`, `EventCardBranchDef`, `EventCardSideDef`, `EventCardLastingEffectDef`, and `EventCardTargetCardinality`.
- The original ticket used `EventTargetDef`, `EventBranchDef`, `EventSideDef`, `EventLastingEffectDef`, `EventTargetCardinality`.

3. Opaque payload typing still exists and is the real gap.
- `src/kernel/types-events.ts` still uses `Readonly<Record<string, unknown>>` for:
  - target `selector`
  - side/branch `effects`
  - lasting effect payloads
- This still violates the Spec 32 intent for compile-time type safety.

4. `GameDef.eventCards` removal is obsolete.
- `GameDef.eventCards` does not exist in the current architecture.
- `eventDecks` is the active field.

5. `GameState.activeLastingEffects` is not present today.
- The original ticket proposed adding it from a types-only phase.
- In the current architecture this should be coupled to runtime lifecycle semantics, so it is better tracked as follow-up runtime work (Phase 8B), not forced into this ticket as a standalone type-only invariant.

6. Event deck runtime and compiler paths are already integrated.
- `src/cnl/compile-event-cards.ts`, parser/validator support, and integration tests for cards 82/27 are present.
- The remaining issue is strict typing quality, not missing subsystem wiring.

## Architecture Reassessment

Are the proposed changes beneficial versus the current architecture? **Yes, with scope correction.**

Benefits of replacing opaque records with AST/query contracts:
- Improves compile-time guarantees and removes silent shape drift.
- Keeps event definitions aligned with generic kernel DSL primitives (`EffectAST`, `ConditionAST`, `OptionsQuery`).
- Supports the agnostic-engine rule by using shared contracts instead of game-specific ad hoc payloads.

Scope correction required for architecture quality:
- Do not mix runtime-lifecycle state additions (`activeLastingEffects`) into a pure type-contract ticket unless lifecycle semantics are implemented in the same stream.
- Prefer preserving current `EventCard*` naming unless a dedicated rename ticket is approved; a broad rename adds churn without architectural gain.

## Updated Scope

### In Scope

1. Replace event deck/card opaque payload fields in `src/kernel/types-events.ts` with shared AST/query contracts.
2. Keep `GameDef.eventDecks` contract aligned with strict event deck typing.
3. Update/strengthen tests that assert typed event-card contracts compile and validate through CNL/compiler paths.

### Out of Scope

1. Kernel execution changes for lasting-effect lifecycle.
2. Adding `GameState.activeLastingEffects` without lifecycle/runtime behavior.
3. Broad renaming of existing `EventCard*` symbols.
4. Any game-specific FITL logic additions.

## Corrected Acceptance Criteria

1. No `Record<string, unknown>` remains in event deck/card behavioral payload fields.
2. Event targets use `OptionsQuery` selectors.
3. Event side/branch/lasting effect payloads use shared AST types.
4. `GameDef.eventDecks` remains the canonical event-deck entry point.
5. `npm run typecheck` passes.
6. `npm test` passes.

## Verification Run for This Reassessment

- `npm run typecheck` passed.
- `npm run test:unit -- --coverage=false` passed.
- `npm test` passed.

## Outcome

**Completed on**: 2026-02-13

What was actually changed vs originally planned:
- Corrected ticket assumptions to match the implemented architecture (`eventDecks` present, `EventCard*` names in use, no `eventCards` field, no current `activeLastingEffects` state field).
- Updated scope to focus on type-contract hardening, excluding premature runtime-state additions.
- Added explicit architecture tradeoff analysis based on Spec 32 principles.

What was intentionally not changed:
- No source code implementation for event typing was performed in this reassessment pass.
- No runtime behavior was altered.
