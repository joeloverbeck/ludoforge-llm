# ENGINEARCH-088: Decision Authority Context Hardening for Choice Resolution

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel legality/apply APIs, decision sequence plumbing, runtime validation surfaces
**Deps**: tickets/ENGINEARCH-087-compiler-owned-binding-namespace-and-distribute-runtime-parity.md

## Problem

Choice ownership (`chooser`) is now enforceable, but authority input is caller-provided (`decisionPlayer`) and can be spoofed by untrusted callers. This weakens the architectural contract for cross-seat decisions.

## Assumption Reassessment (2026-02-27)

1. Current legality/apply surfaces accept optional `decisionPlayer` inputs and pass them through to effect runtime checks.
2. Current checks validate seat equality but do not cryptographically or structurally bind authority to a trusted runtime context.
3. Mismatch: ownership semantics are present, but authority provenance is implicit. Corrected scope is to introduce an authoritative decision context owned by engine runtime flow, not a free-form caller override.

## Architecture Check

1. Authoritative context objects are cleaner than open scalar overrides because they can carry trusted provenance and future policy fields.
2. This keeps game-specific decision rules in `GameSpecDoc` while keeping runtime enforcement generic and game-agnostic.
3. No backwards-compatibility alias paths; replace the loose override model directly.

## What to Change

### 1. Replace scalar `decisionPlayer` overrides with authoritative decision context

Introduce a typed decision context object resolved from runtime turn/actor state. Require it at choice-resolution surfaces where ownership enforcement occurs.

### 2. Enforce ownership against authoritative context only

Update `legalChoices`/`resolveMoveDecisionSequence`/`applyMove`/effect runtime paths to reject unresolved or mismatched authority context.

### 3. Tighten API contracts

Remove optional authority fields that allow spoofing and update exported runtime types accordingly.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/apply-move.test.ts` (modify/add)

## Out of Scope

- Runner/UI authentication concerns.
- Game-specific choice rules or selector semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Choice ownership enforcement cannot be bypassed by caller-provided scalar seat overrides.
2. Cross-seat chooser decisions resolve only when authoritative context matches chooser ownership.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Authority provenance is engine-owned and game-agnostic.
2. GameDef/runtime do not gain game-specific branches or compatibility aliases.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — rejects spoofed authority context and accepts authoritative matches.
2. `packages/engine/test/unit/apply-move.test.ts` — apply path parity for authoritative context enforcement.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — decision probing respects authoritative context.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `node --test packages/engine/dist/test/unit/apply-move.test.js`
5. `pnpm -F @ludoforge/engine test`
