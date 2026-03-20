# FITL Turn-Processing Optimization Targets

## Purpose

This report identifies existing tests that are good optimization-loop targets for Fire in the Lake policy evaluation and turn processing.

Selection criteria:

- they execute the real slow path or a close approximation of it
- they prove behavior we must preserve while optimizing
- they are specific enough to localize regressions

This is not a ticket. It is a recommended test harness for iterative performance work.

## Recommended Optimization Loop

Run this small set on every optimization iteration:

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/performance/policy-agent.perf.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/unit/policy-production-golden.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js packages/engine/dist/test/integration/fitl-card-flow-determinism.test.js`

Then run the full safety pass before finalizing:

1. `pnpm -F @ludoforge/engine lint`
2. `pnpm -F @ludoforge/engine test`

## Primary Targets

### 1. `packages/engine/test/performance/policy-agent.perf.test.ts`

Why this is a top target:

- It directly measures the current slow path: `legalMoves(...)` plus `PolicyAgent.chooseMove(...)`.
- It runs against real production FITL and Texas specs, not synthetic fixtures.
- It already locks the key policy metrics that optimization must preserve:
  - candidate count
  - preview count
  - zero emergency fallback
  - bounded decision time

What it protects:

- policy candidate preparation
- policy evaluation
- preview evaluation
- fixed-seed decision stability at the perf corpus level

Why it matters for FITL:

- The current FITL case is materially slower than Texas and is the clearest direct signal for policy-path optimization.

### 2. `packages/engine/test/integration/fitl-policy-agent.test.ts`

Why this is a top target:

- It proves the production FITL policy path works end to end.
- It exercises the full chain from production spec compilation to legal-move generation, move concretization, policy choice, viability checks, and short self-play.
- It verifies that the agent does not fall back under real production conditions.

What it protects:

- incomplete template concretization before policy scoring
- legality and completeness of selected moves
- fixed-seed self-play without runtime failures
- policy binding resolution for all four FITL seats

Optimization relevance:

- If we speed up candidate generation or policy evaluation incorrectly, this test is likely to catch it quickly.

### 3. `packages/engine/test/unit/policy-production-golden.test.ts`

Why this is a top target:

- It locks the compiled production policy catalogs and fixed-seed summary traces.
- It protects exactly the outputs an optimization pass is most likely to accidentally perturb:
  - chosen move
  - policy trace structure
  - resolved profile
  - candidate and preview usage metadata

What it protects:

- compiled `GameDef.agents` shape
- policy trace payload shape
- fixed-seed move selection

Optimization relevance:

- This is the best guard against “faster but observably different” changes in policy selection or diagnostics.

### 4. `packages/engine/test/unit/property/policy-determinism.test.ts`

Why this is a top target:

- It encodes the core invariants that a more aggressive optimization might violate.
- It is small and fast relative to the production FITL tests, so it should stay in the tight loop.

What it protects:

- returned move is always one of the provided legal moves
- permutation invariance of legal-move order
- same-seed replay determinism
- emergency fallback still returns a legal move

Optimization relevance:

- Use this to guard against caching mistakes, unstable iteration order, or PRNG misuse.

### 5. `packages/engine/test/integration/fitl-card-flow-determinism.test.ts`

Why this is a top target:

- It reaches beyond isolated policy choice into turn progression and repeated move application.
- It is a good proxy for the broader “entire code involved in processing a turn” concern.
- It checks byte-identical deterministic outcomes across repeated execution.

What it protects:

- deterministic `legalMoves(...)` behavior under FITL card flow
- deterministic move completion and `applyMove(...)` results
- turn-order/card-flow behavior after repeated scripted operations

Optimization relevance:

- This is the strongest existing guard for turn-processing determinism after optimizing move enumeration, action completion, or application internals.

## Secondary Guards

These are not the first tests I would put in the per-iteration loop, but they are strong follow-up checks when optimizing adjacent code.

### `packages/engine/test/integration/fitl-pass-rewards-production.test.ts`

Why keep it nearby:

- It covers a real production FITL pass chain across multiple applied moves.
- It is useful when optimization touches action application, pass handling, or card-driven runtime state updates.

### `packages/engine/test/unit/trace/policy-trace-events.test.ts`

Why keep it nearby:

- It validates policy trace emission and simulator move-log integration.
- It is useful when optimization touches diagnostics assembly, trace generation, or summary/verbose trace branching.

### `packages/engine/test/unit/phase-advance.test.ts`

Why keep it nearby:

- It provides strong behavioral coverage for `advancePhase(...)` and `advanceToDecisionPoint(...)`.
- It is more structural and synthetic than the FITL production tests, so it is not the best perf anchor, but it is a useful regression guard when optimizing phase advancement internals.

## Suggested Optimization Order

If the goal is to make FITL materially faster without destabilizing architecture, the likely highest-value areas are:

1. `legalMoves(...)` and downstream candidate preparation for FITL production states.
2. `preparePlayableMoves(...)` and `evaluatePlayableMoveCandidate(...)` for incomplete/template moves.
3. policy preview evaluation and any repeated per-candidate work inside `PolicyAgent.chooseMove(...)`.
4. turn progression helpers only after the policy path is measured and improved, because current evidence points more strongly at decision-time cost than generic phase advancement.

## Practical Advice For Iterative Loops

- Use the production FITL state from `packages/engine/test/performance/policy-agent.perf.test.ts` as the main benchmark anchor.
- Keep the golden and property tests in the same loop so optimizations do not silently change policy output shape or determinism.
- Treat `packages/engine/test/integration/fitl-policy-agent.test.ts` as the end-to-end correctness anchor for policy work.
- Treat `packages/engine/test/integration/fitl-card-flow-determinism.test.ts` as the end-to-end correctness anchor for broader turn-processing work.
- Do not optimize by weakening preview usage, candidate counts, or trace semantics just to make the perf test pass.

## Best Starting Set

If I had to choose only three tests for the first optimization pass, I would start with:

1. `packages/engine/test/performance/policy-agent.perf.test.ts`
2. `packages/engine/test/integration/fitl-policy-agent.test.ts`
3. `packages/engine/test/integration/fitl-card-flow-determinism.test.ts`

That set gives one direct timing gate, one production policy correctness gate, and one broader turn-processing determinism gate.
