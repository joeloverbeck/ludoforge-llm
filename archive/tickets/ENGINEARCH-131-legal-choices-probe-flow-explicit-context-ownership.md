# ENGINEARCH-131: Legal-Choices Probe Flow Explicit Context Ownership

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel legal-choices probe threading and context-construction flow
**Deps**: archive/tickets/ENGINEARCH-113-discriminated-decision-authority-context-contract.md, archive/tickets/ENGINEARCH-129-eliminate-discovery-context-dispatcher-alias.md

## Problem

`legalChoicesWithPreparedContext` currently threads probe/strict via a scalar `ownershipEnforcement: 'strict' | 'probe'` argument. This works, but it keeps an implicit policy channel instead of explicit context-constructor ownership in control flow.

## Assumption Reassessment (2026-02-28)

1. Discovery context constructors now support explicit strict/probe variants.
2. `legal-choices.ts` still passes scalar ownership flags through recursive calls and only resolves constructor choice inside `executeDiscoveryEffects`.
3. Existing pending tickets do not cover removal of scalar probe-threading from legal-choices recursion. Corrected scope: move to explicit strict/probe execution paths and constructor ownership at call boundaries.
4. Existing tests verify effect-context constructor boundaries and effect-runtime ownership invariants, but they do not explicitly guard against reintroducing scalar strict/probe recursion parameters in legal-choices control flow.

## Architecture Check

1. Explicit strict/probe branches are cleaner and easier to audit than scalar mode-like threading.
2. This is runtime plumbing only; it preserves GameDef/simulator game-agnostic boundaries and does not encode game-specific behavior.
3. No compatibility aliases/shims: replace scalar threading directly.

## What to Change

### 1. Replace scalar ownership threading with explicit flow functions

Split discovery evaluation flow into strict and probe-specific functions or an explicit discriminated flow object, removing scalar ownership argument recursion.

### 2. Keep constructor ownership at boundaries

Ensure strict/probe context constructors are called from explicit strict/probe branches only.

### 3. Preserve existing legality semantics

No change to actual legality outcomes; only control-flow/contract clarity improvements.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` (modify only if constructor-call expectations or boundary guard semantics need updates)

## Out of Scope

- Choice option diagnostics/ranking policy changes.
- Turn-flow policy redesign unrelated to context ownership threading.
- Any GameSpecDoc or visual-config file/schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. Legal-choices recursion no longer uses scalar `'strict' | 'probe'` ownership parameter threading.
2. Probe legality exploration still emits probe mismatch reasons in probe paths only.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Strict/probe discovery context ownership is explicit in control flow.
2. Legal choices runtime remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts` — verifies probe-vs-strict behavior parity after flow refactor.
2. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` — ensures boundary constructor usage expectations remain explicit after legal-choices refactor and guards against regression to scalar strict/probe recursion-threading.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-authority-runtime-invariants.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Refactored `packages/engine/src/kernel/legal-choices.ts` to remove scalar `'strict' | 'probe'` recursion threading.
  - Introduced explicit strict/probe execution paths via dedicated effect-execution functions and strict/probe legal-choices wrappers.
  - Kept strict/probe context constructor ownership explicit at effect execution boundaries.
  - Strengthened architecture guard coverage in `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` to forbid regression to scalar ownership threading in legal-choices flow.
  - Added parity coverage in `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts` to assert discovery ownership behavior matches across `applyEffect` and `applyEffects`.
- **Deviations from original plan**:
  - None in scope. Test coverage was expanded to close a discovered regression gap for scalar threading reintroduction.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/choice-authority-runtime-invariants.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (321/321).
  - `pnpm -F @ludoforge/engine lint` passed.
