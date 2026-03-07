# FITLEVENTARCH-006: Event Target Canonical Payload Ownership

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — event target schema contract hardening + event-data migration policy
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, tickets/FITLEVENTARCH-004-event-target-executability-crossvalidate-parity.md

## Problem

Current contract allows `application: aggregate` targets without `targets[].effects`, which preserves split ownership between target declaration and scope-level effects. This keeps authoring ambiguous and weakens the long-term canonical architecture.

## Assumption Reassessment (2026-03-07)

1. Target-local execution semantics are now first-class (`application` + `effects`), but schema only requires `effects` for `application: each`.
2. Large portions of event data still use target declarations whose executable payload lives outside the target.
3. Mismatch: canonical target-local ownership is not fully enforced yet; this leaves architectural ambiguity.

## Architecture Check

1. Requiring executable payload at the target declaration keeps data intent local, explicit, and easier to evolve.
2. This is still game-agnostic in engine/runtime; only GameSpecDoc shape is normalized.
3. No backward-compatibility shims: adopt one strict canonical target contract and migrate authored data.

## What to Change

### 1. Tighten event target schema contract

Require non-empty `targets[].effects` for both `application` modes (`each` and `aggregate`).

### 2. Migrate existing authored event targets

Update event deck content to move target-relevant effects into the corresponding target `effects` arrays.

### 3. Harden validation and tests

Add negative validation cases for targets missing `effects` regardless of `application`.

## Files to Touch

- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/types-events.ts` (modify if optionality changes)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)

## Out of Scope

- Non-event DSL redesign
- Runner visual configuration changes
- Game-balance edits

## Acceptance Criteria

### Tests That Must Pass

1. Any event target missing `effects` is rejected by canonical schema/validation.
2. Migrated event deck data compiles and executes with unchanged gameplay behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Event target declarations are self-contained for executable payload ownership.
2. GameDef/runtime remain game-agnostic with no per-game branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts` — reject missing target effects for both application modes.
2. `packages/engine/test/unit/cross-validate.test.ts` — validate canonical target-owned payload patterns.
3. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — assert migrated canonical target ownership shape where applicable.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
