# 140MICRODECPRO-001: I1 + I5 investigation — FITL compound-turn inventory + effect-frame suspend/resume prototype

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — adds one kernel-only prototype test under `packages/engine/test/unit/kernel/`
**Deps**: `specs/140-microturn-native-decision-protocol.md`

## Problem

Before any microturn-protocol implementation work begins, Spec 140 requires two derisking investigations that bound the design surface:

1. **I1 — FITL compound-turn inventory**: For every FITL action using `chooseN`, nested `chooseOne`, or `chooseStochastic`, document the decomposed microturn-sequence shape under the new contract. This is the design validator for the decision-stack representation. If any FITL action produces a shape that cannot be represented as a `DecisionStackFrame[]` sequence, the spec is revised before implementation.
2. **I5 — Effect-frame suspend/resume prototype**: Prototype the technically-hardest part of the spec — snapshotting and resuming effect-execution frames across nested `forEach(chooseN(...))` inside `chooseOne(...)` — on a synthetic GameDef. Proves the pattern before full FITL-scale work in ticket 005.

These two investigations produce checked-in fixtures/tests that inform every downstream ticket.

## Assumption Reassessment (2026-04-20)

1. Spec 140 is stable after `/reassess-spec` — confirmed this session. I1 and I5 outputs are listed in § Required Investigation (Pre-Implementation). No implementation work begins until I1 through I5 complete.
2. FITL action YAML lives in `data/games/fire-in-the-lake/` — confirmed by reassessment; covers at minimum `march`, `operation-terror`, `operation-assault`, `operation-patrol`, `operation-rally`, `operation-train`, `operation-ambush`, plus all event-card-driven actions with chooser branches.
3. The test-class convention for the suspend/resume prototype is `architectural-invariant` per `.claude/rules/testing.md` — confirmed.
4. `packages/engine/test/fixtures/` is the canonical location for checked-in fixture JSON — confirmed by glob.

## Architecture Check

1. Design validation through fixtures, not code: I1 produces a JSON inventory consumed by downstream tickets; I5 produces a single self-contained kernel test. No engine runtime code changes here — the production kernel is unchanged until ticket 003 onward.
2. Engine-agnosticism preserved: the synthetic I5 GameDef is game-agnostic; the FITL-specific I1 inventory is data/documentation, not engine logic. Neither introduces a per-game branch into the kernel.
3. F14 compliant: no compatibility shims, no transitional scaffolding. The fixture and test are the deliverables; they remain in-tree as derisking references.

## What to Change

### 1. I1 — FITL compound-turn inventory fixture

Create `packages/engine/test/fixtures/spec-140-compound-turn-shapes/fitl-actions.json`. Structure (one entry per FITL action):

```jsonc
{
  "actionId": "march",
  "triggerState": "action-selected, zero bindings",
  "microturnSequence": [
    { "decisionKind": "chooseN", "decisionKey": "spaces", "optionsAtPublication": "..." , "legalActionCount": "≤ 27" },
    { "decisionKind": "chooseOne", "decisionKey": "operationType", "optionsAtPublication": "...", "legalActionCount": "..." }
  ],
  "turnRetirementBoundary": "after operationType binds",
  "reactionInterruptBoundaries": []
}
```

Cover: `march`, `operation-terror`, `operation-assault`, `operation-patrol`, `operation-rally`, `operation-train`, `operation-ambush`, plus every event-card-driven action with chooser branches. The fixture does not need to encode live legal options — it describes the *shape* of the microturn sequence so downstream tickets can validate against it.

### 2. I1 — Companion walkthrough doc

Create `campaigns/phase3-microturn/compound-turn-inventory.md`. Plain-prose walkthrough of the fixture's design intent, highlighting any FITL action whose shape was surprising or required design iteration. The directory `campaigns/phase3-microturn/` is new — create it.

### 3. I5 — Effect-frame suspend/resume prototype test

Create `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` with file-top marker:

```ts
// @test-class: architectural-invariant
```

Build a synthetic `GameDef` whose single action body is `forEach(zone Z, chooseN(tokens in Z', min:1, max:3)) then applyEffect(...)`. Prove end-to-end:

1. First `chooseOne` bind opens the outer frame; publication emits a microturn for the outer decision.
2. After binding, effect execution resumes and enters `forEach`; each iteration opens a `chooseN` sub-frame; publication emits one microturn per sub-selection (add/remove/confirm model preserved).
3. After the final sub-frame pops, the outer `forEach` completes and post-selection effects execute.
4. State-serialization round-trip at any mid-execution point preserves stack + bindings identically (state hash stable across serialize/deserialize).

Because the production kernel does not yet implement `publishMicroturn` / `applyDecision`, the prototype uses inline helper scaffolding — a small module-private shim that simulates the intended algorithm on top of existing kernel primitives, or a TypeScript sketch class that implements the proposed pattern directly. The goal is **proof of feasibility**, not production-ready code. Downstream ticket 005 replaces the scaffolding with the real implementation.

### 4. Fixture validation helper

Add a small `packages/engine/test/fixtures/spec-140-compound-turn-shapes/validate.ts` that loads the JSON fixture and asserts schema conformance (all required fields present, decision kinds are from the D1 enum). This protects the fixture from silent drift as downstream tickets reference it.

## Files to Touch

- `packages/engine/test/fixtures/spec-140-compound-turn-shapes/fitl-actions.json` (new)
- `packages/engine/test/fixtures/spec-140-compound-turn-shapes/validate.ts` (new)
- `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` (new)
- `campaigns/phase3-microturn/compound-turn-inventory.md` (new)

## Out of Scope

- Production kernel changes (no new code under `packages/engine/src/kernel/microturn/` yet — that is ticket 003).
- Complete policy-profile or worker-bridge audits (ticket 002).
- Any FITL data-file modification — I1 reads FITL YAML, it does not rewrite it.
- Replacing prototype scaffolding with real `publishMicroturn` / `applyDecision` calls — that is ticket 004 / 005.

## Acceptance Criteria

### Tests That Must Pass

1. `effect-frame-suspend-resume-prototype.test.ts` runs green and asserts all four suspend/resume invariants (outer frame open, sub-frame independent capture, final effect single-run, state-hash round-trip).
2. `validate.ts` (invoked from the prototype test or a sibling sanity-check test) loads `fitl-actions.json` and asserts every entry has the required fields with valid decision kinds.
3. Existing suite: `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all pass.

### Invariants

1. Every FITL action with compound-turn structure is covered in the fixture — no silent omissions. Cross-check: grep FITL YAML for `chooseN`, `chooseOne`, `chooseStochastic` uses and confirm each action appears in `fitl-actions.json`.
2. The prototype test is classified `architectural-invariant` and does not pin any trajectory-specific outcome.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` — proves the technically-hardest part of the spec before ticket 005 commits to production code.
2. `packages/engine/test/fixtures/spec-140-compound-turn-shapes/validate.ts` — fixture schema-conformance helper.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/effect-frame-suspend-resume-prototype.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- Landed `packages/engine/test/fixtures/spec-140-compound-turn-shapes/fitl-actions.json` as the live compiled FITL compound-turn inventory (`115` surfaces: `29` action pipelines, `86` event-card sides).
- Added `packages/engine/test/fixtures/spec-140-compound-turn-shapes/validate.ts` to enforce fixture schema conformance plus exact coverage parity against the current compiled FITL surface.
- Added `campaigns/phase3-microturn/compound-turn-inventory.md` to explain the inventory intent and highlight the deepest nested shapes (`train-us-profile`, `march-nva-profile`, `assault-us-profile`, `infiltrate-profile`, ambush profiles).
- Added `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` as a kernel-only sketch proving outer `chooseOne` publication, nested `chooseN` suspend/resume across `forEach`, single-run post-selection effects, and stable serialize/deserialize hashing across a mid-execution state.
- `ticket corrections applied`: focused proof command updated to the repo-valid `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/effect-frame-suspend-resume-prototype.test.js`; FITL canonical action ids are `terror`, `ambushNva`, and `ambushVc` rather than the draft prose labels `operation-terror` / generic `operation-ambush`; the prototype wording was implemented as the spec-consistent `chooseOne -> forEach(chooseN)` suspend/resume shape.
- `verification set`: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/effect-frame-suspend-resume-prototype.test.js`; `pnpm turbo build`; `pnpm turbo test`; `pnpm turbo lint`; `pnpm turbo typecheck`
- `proof gaps`: none
