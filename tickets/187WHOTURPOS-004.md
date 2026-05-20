# 187WHOTURPOS-004: `relationships` library bucket + relationship refs

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `contracts/policy-contract.ts`, `cnl/game-spec-doc.ts`, `kernel/types-core.ts`, `kernel/schemas-core.ts`, `cnl/lower-agent-considerations.ts`, `cnl/compile-agents.ts`, `agents/policy-evaluation-core.ts`
**Deps**: `specs/187-whole-turn-posture-and-ally-rival-metadata.md`

## Problem

Spec 187 §4.2 introduces a generic `relationships` library bucket mapping relationship roles (`nominalAlly`, `sharedEnemy`, `rivalAlly`, `leader`, `nearWin`, `kingmakerRisk`, `cooperativeUntilThreshold`) to seats via authored conditions, exposing refs `relationship.<role>.seat` and `relationship.<role>.gainValue`. Each role binds to a seat via an authored entry in the existing `strategicConditions` bucket — e.g. a `nearWin` role binds the seat whose per-seat `victory.currentMargin.<seat>` exceeds an authored threshold (no hardcoded near-win threshold or faction id in engine code, Foundation #1). A role may also bind to a Spec 180 standing-role selector (`currentLeader`/`nearestThreat`/`closestAhead`/`closestBehind`). There is no `standing.<seat>.*` ref namespace; `nearWin` is a role kind whose binding condition is a strategic condition.

This ticket lands the bucket (compiler-side, same 4-site pattern as `187WHOTURPOS-001`) plus runtime resolution of the relationship refs. It is independent of the posture chain; conditional ally weighting that consumes these refs is `187WHOTURPOS-005`.

## Assumption Reassessment (2026-05-21)

1. The `strategicConditions` bucket exists (`contracts/policy-contract.ts:12`; lowered in `cnl/lower-agent-considerations.ts:83,104,271`; `CompiledPolicyStrategicCondition` schema in `kernel/schemas-core.ts:1567`) — relationship-role binding conditions reuse it rather than introducing a new condition mechanism.
2. Per-seat `victory.currentMargin.<seat>` refs are delivered by Spec 180/185 (archived, completed) and are the substrate for authored "near-win" conditions.
3. Standing-role selectors `currentLeader`/`nearestThreat`/`closestAhead`/`closestBehind` exist as `AGENT_POLICY_STANDING_ROLE_SELECTORS` (`contracts/policy-contract.ts:106-111`) — relationship roles may bind to them; they are selectors, not a `standing.<seat>.*` ref namespace.
4. `relationships` is absent from `AGENT_POLICY_LIBRARY_BUCKETS`; like `postureEvaluators` it is referenced indirectly (by posture terms in `-005`), so it is NOT added to `AGENT_POLICY_PROFILE_USE_BUCKETS`.

## Architecture Check

1. Reusing `strategicConditions` for role-binding conditions avoids a parallel condition evaluator and keeps "near-win"/"kingmaker" semantics fully authored (Foundation #1) — the engine learns no faction pairs or thresholds.
2. Extends the Spec 180 standing-role substrate rather than introducing a parallel "standing" concept (Spec 187 §10 "Corrected").
3. Foundation #12: role-kind validity and binding-condition references are validated at compile time; binding an unknown seat fails compilation.
4. Net-new bucket; no compatibility shim. Profiles declaring no relationships are unaffected.

## What to Change

### 1. Register the bucket

Add `relationships` to `AGENT_POLICY_LIBRARY_BUCKETS` (`contracts/policy-contract.ts`). Do not add to `AGENT_POLICY_PROFILE_USE_BUCKETS`.

### 2. Input shape + compiled type + schema

Add `relationships?` to `GameSpecAgentLibrary` (`cnl/game-spec-doc.ts`) with a `GameSpecRelationshipDef` declaring `role` (one of the seven role kinds) and a binding condition (a `strategicConditions` reference and/or standing-role selector). Add `CompiledRelationship` to `kernel/types-core.ts` and the schema to `kernel/schemas-core.ts` (`CompiledAgentLibraryIndexSchema` + catalog family).

### 3. Lowering + static validation

In `cnl/lower-agent-considerations.ts` / `cnl/compile-agents.ts`, lower relationship roles; validate role-kind membership and that the binding condition references a real `strategicConditions` entry or standing-role selector. Reject binding to an unknown seat.

### 4. Runtime ref resolution

In `agents/policy-evaluation-core.ts`, resolve `relationship.<role>.seat` (the seat currently bound to the role, via its condition) and `relationship.<role>.gainValue`. These read only the observer-safe projection (Foundation #4).

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/lower-agent-considerations.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/test/` — relationship compiler golden + determinism + authoring-error tests (new)

## Out of Scope

- Conditional ally weighting / the flip and `allyWeightContext` trace (`187WHOTURPOS-005`).
- Static cross-validation of posture terms referencing `relationship.<role>` (`187WHOTURPOS-005`).
- FITL faction wiring (US/ARVN/NVA/VC) — that is Spec 188.

## Acceptance Criteria

### Tests That Must Pass

1. Relationship roles compile and bind seats via authored `strategicConditions`/standing-role conditions, with no faction ids in engine code.
2. Binding a role to an unknown seat fails compilation with a descriptive error.
3. `relationship.<role>.seat` resolves at runtime to the seat bound by the role's condition (or empty when the condition matches no seat).
4. Recompiling the same GameSpecDoc yields byte-identical GameDef (determinism).
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No hardcoded faction pair, victory formula, or near-win threshold appears in engine code (Foundation #1).
2. Relationship refs read only the observer-safe projection except in labeled analysis profiles (Foundation #4).

## Test Plan

### New/Modified Tests

1. Relationship-bucket compiler golden + determinism test — pins the compiled `relationships` shape and asserts byte-identical recompile.
2. Authoring-error corpus test — relationship role binding an unknown seat rejected at compile time.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/<relationship-compiler-test>.test.js`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`
