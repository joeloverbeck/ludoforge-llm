# ENG-001: Unify Pending Free-Operation Move Enumeration And Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/kernel` turn-flow eligibility, legal move enumeration, free-operation discovery/validation, and apply-move integration
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/turn-flow-eligibility.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-grant-authorization.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Problem

Pending free-operation grants are not represented by a single canonical engine model. The current engine splits behavior across turn-flow eligibility checks, normal action template enumeration, an `executionContext`-only grant seeding path, and a late free-operation variant retrofit. That split makes the same required grant appear valid in one subsystem and absent or illegal in another.

This is currently surfacing as:

- `card-46` shaded (`559th Transport Grp`) entering a valid required free-`Infiltrate` window but producing no legal moves, causing a decision-point stall loop.
- `card-62` (`Cambodian Civil War`) surfacing a free `Air Lift` move that can fail validation with `turnFlowActionClassMismatch` because the move originates from a normal turn-flow template instead of a grant-rooted model.
- increased fragility around `Ia Drang`, `Operation Attleboro`, and any future event that issues required chained or cross-seat free operations.

## Assumption Reassessment (2026-03-11)

1. The current kernel does not have one first-class concept of a “grant-rooted move”; required grants are reconstructed separately during legal move discovery, free-operation authorization, and move validation.
2. `turnFlow.actionClassByActionId` remains the canonical source of intrinsic action class, while `grant.operationClass` is currently a compatibility rule rather than a move-shaping rule.
3. The failing FITL cards show that trying to patch one enumeration path at a time creates regressions elsewhere. The scope must therefore be a structural redesign, not a local fix.

## Architecture Check

1. The cleaner design is to make ready pending grants a first-class legal-move source and have both `legalMoves()` and `applyMove()` consume the same grant-rooted representation. That removes duplicated reasoning and eliminates late retrofit behavior.
2. This keeps game-specific behavior in `GameSpecDoc` data. The engine redesign is fully generic: it models how any game’s pending grants become legal moves, without any Fire in the Lake identifiers or branch-specific rules in agnostic code.
3. No backwards-compatibility aliasing or shims are introduced. The old split paths should be removed or collapsed into the new canonical flow, not preserved alongside it.

## What to Change

### 1. Define A Canonical Grant-Rooted Legal Move Model

Create a single kernel path that turns every ready pending free-operation grant into one or more legal move roots, regardless of whether the grant has `executionContext`.

That model must carry:

- the authoritative `grantId`
- the intrinsic mapped action class for the target action
- execution player / seat override context
- free-operation overlay data (`executionContext`, `zoneFilter`, sequence context)
- completion/required semantics

The move root must be the same object model used by both legal move discovery and move validation.

### 2. Replace Split Enumeration With Grant-First Enumeration

Refactor legal move discovery so required pending grants are enumerated directly instead of being reconstructed indirectly from normal action templates plus late fallback variants.

Specifically:

- remove the semantic split between `enumeratePendingFreeOperationMoves()` and `applyPendingFreeOperationVariants()`
- stop treating `executionContext` grants as special
- ensure a ready required grant can keep the active seat actionable even when normal `firstEligible` / `secondEligible` windows would otherwise be exhausted
- ensure move enumeration never depends on opportunistically reusing a normal action template that was not grant-rooted

### 3. Separate Intrinsic Action Class From Grant Compatibility

Refactor free-operation validation so:

- intrinsic action class comes only from `turnFlow.actionClassByActionId`
- grant compatibility checks use `grant.operationClass` against the intrinsic mapped class
- submitted `move.actionClass` is only used when the player is truly selecting among turn-flow option-matrix class variants

Do not use `grant.operationClass` as a synthetic `move.actionClass` patch.

### 4. Align `applyMove()` With The Same Grant-Rooted Model

Update move validation and grant consumption so they use the same canonical grant-rooted metadata that legal move discovery used.

This includes:

- authorization lookup
- action applicability preflight
- executor resolution
- class compatibility checks
- required-grant window enforcement
- post-resolution turn-flow resume behavior

### 5. Remove Dead/Brittle Fallback Logic

Once the canonical path is in place, delete or collapse the old fallback machinery that exists only to backfill missing grant moves after normal enumeration.

The engine should have one explanation for why a free move exists and one explanation for why it is legal.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/apply-move.test.ts` (modify)

## Out of Scope

- changing FITL card text or card data beyond what is required to conform to the redesigned generic engine model
- visual presentation, runner UI, or `visual-config.yaml`
- preserving the old free-operation fallback architecture for compatibility

## Acceptance Criteria

### Tests That Must Pass

1. Required pending free-operation grants are surfaced as legal moves through a single canonical path, whether or not the grant has `executionContext`.
2. Grant-rooted moves do not fail with `turnFlowActionClassMismatch` merely because the grant operation class differs from the action’s intrinsic mapped class.
3. A required post-event grant window cannot produce a legal-move vacuum that stalls `advanceToDecisionPoint`.
4. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. Existing suite: `pnpm turbo test`

### Invariants

1. There is exactly one canonical engine path from pending free-operation grant to legal move template.
2. `GameDef` and kernel remain game-agnostic; no FITL-specific identifiers or branch logic are introduced in engine code.
3. `turnFlow.actionClassByActionId` remains the intrinsic source of action class; `grant.operationClass` is compatibility metadata, not a substitute move class.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — cover required-grant enumeration without `executionContext`, class compatibility, and grant-rooted move discovery parity.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — verify grant-rooted legal move seeding and removal of executionContext-only asymmetry.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/apply-move.test.ts` — verify canonical grant metadata is respected through validation and consumption.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm turbo test`
