# 188FITLFOUFAC-004A: Generic WASM guardrail demotion parity prerequisite

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic policy score-row / WASM guardrail parity
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`

## Problem

Spec 188 ticket 004 authors ARVN `demote` guardrails in YAML. Live implementation proved the TypeScript policy score path applies the demotion penalty, while the WASM score-row path can retain the pre-demotion candidate score. That breaks the one-rules-protocol invariant: same authored rules and same state must produce equivalent candidate scoring across supported policy execution routes.

The observed red proof from the 004 draft was `pnpm -F @ludoforge/engine test:all`: `arvn-tournament-wasm-equivalence` failed at decision 22 because the selected action stayed `govern`, but the `sweep` candidate scored `8000` in TypeScript and `8300` in WASM.

## Assumption Reassessment (2026-05-21)

1. This is a generic engine/runtime parity issue, not an ARVN-specific or FITL-specific rule.
2. Narrowing ticket 004 to `warn`/`auditOnly` guardrails would hide the behavior gap and weaken the authored competence work.
3. Widening ticket 004 directly to engine work would violate its explicit no-engine-diff boundary, so this prerequisite owns the generic fix.

## Architecture Check

1. Preserve engine agnosticism (Foundation #1): no faction, game, or action IDs in engine/runtime code.
2. Preserve one rules protocol / many clients (Foundation #5): TypeScript and WASM policy routes must agree on guardrail-demoted candidate scores.
3. Apply a complete architectural fix (Foundation #15): do not paper over the failure with FITL-only expectations.
4. Add executable proof (Foundation #16): parity must be covered by focused tests and by the production ARVN equivalence lane.

## What to Change

### 1. Make demote guardrail scoring route-equivalent

Update the generic policy/WASM score-row path so candidate scores include the same guardrail demotion penalties as the TypeScript policy route. If a guardrail construct cannot be represented in the WASM route, add a generic fallback or exclusion path that preserves TypeScript/WASM candidate-score equivalence and makes the limitation visible without special-casing FITL.

### 2. Prove parity with focused coverage

Add or update tests that exercise a demote guardrail through both policy execution routes and assert equivalent candidate scores. Keep the production ARVN equivalence witness as a regression check for the live 004 draft.

## Files to Touch

- `packages/engine/src/agents/` (generic policy/WASM runtime and score-row code as needed)
- `packages/engine/test/unit/agents/` or `packages/engine/test/integration/` (focused generic parity coverage)
- Existing ARVN WASM equivalence test only if its assertion/proof shape needs truthing

## Out of Scope

- No FITL-, ARVN-, faction-, or action-specific engine branches.
- No weakening 004 guardrails to `warn` or `auditOnly`.
- No ARVN posture/relationship authoring, legacy demotion, or profile-quality witness work.

## Acceptance Criteria

### Tests That Must Pass

1. Focused generic guardrail-demotion parity test.
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js`
3. `pnpm -F @ludoforge/engine test:all`

### Invariants

1. Engine code remains game/faction/action agnostic.
2. TypeScript and WASM candidate-score rows agree after demote guardrails.
3. Unsupported guardrail constructs are handled generically and visibly; no silent score drift.

## Test Plan

### New/Modified Tests

1. Add or update a focused parity test for demote guardrails across TypeScript and WASM policy scoring.
2. Retain the ARVN tournament WASM equivalence witness as production coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js`
3. `pnpm -F @ludoforge/engine test:all`

## Implementation Notes (2026-05-21)

Completed by making the generic policy scoring path apply guardrail and turn-shape demotion penalties after either the TypeScript consideration scorer or the production WASM score-row scorer has produced base consideration scores. The fix is route-agnostic and does not add FITL, ARVN, faction, or action branches.

Added a focused WASM-enabled demote guardrail conformance test that forces the production score-row route with a constant move consideration and asserts the demoted candidate keeps the `-20` penalty.

## Proof (2026-05-21)

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test packages/engine/dist/test/integration/agents/guardrail-conformance-demote.test.js` — passed.
3. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — passed.
4. `pnpm -F @ludoforge/engine test:all` — passed, 957/957.
