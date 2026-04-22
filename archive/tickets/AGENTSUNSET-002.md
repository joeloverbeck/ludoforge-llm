# AGENTSUNSET-002: Remove RandomAgent and GreedyAgent from the shipped engine contract

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent exports, descriptors, schemas, and trace contract
**Deps**: `archive/tickets/AGENTSUNSET-001.md`

## Problem

The shipped engine contract still exposes `RandomAgent`, `GreedyAgent`, `builtin:*` agent descriptors, and builtin agent-decision trace/schema branches even though the intended product path is authored policy agents. Keeping these built-ins in the public contract creates architectural drag, encourages non-policy fallback usage, and forces CI/test repair work around agents we do not intend to ship forward.

## Assumption Reassessment (2026-04-22)

1. `packages/engine/src/agents/index.ts` still exports `random-agent.ts` and `greedy-agent.ts`.
2. `packages/engine/src/agents/factory.ts` still parses and constructs `builtin:random` and `builtin:greedy`.
3. `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` still define builtin agent descriptors and builtin agent-decision trace payloads.
4. `docs/FOUNDATIONS.md` favors a single truthful contract over compatibility shims. If the product contract is policy-only, the engine surface should be policy-only too.

## Architecture Check

1. Removing built-in descriptors from the public engine contract is cleaner than keeping deprecated aliases or silent fallbacks. It makes the intended authored-policy boundary explicit.
2. This stays aligned with game-agnosticism: authored policy profiles are compiled data in `GameSpecDoc`; the engine only executes generic agent selection plumbing.
3. No backwards-compatibility aliasing. Invalid legacy descriptors should fail validation/parsing clearly rather than being remapped.

## What to Change

### 1. Remove built-in agent implementations from shipped exports

Delete `random-agent.ts` and `greedy-agent.ts` and stop exporting them from `packages/engine/src/agents/index.ts`.

### 2. Collapse descriptor and factory contracts to policy-only

Update:

- `packages/engine/src/agents/factory.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`

so the shipped `AgentDescriptor` surface is policy-only. Parsing, normalization, and creation should accept only policy descriptors.

### 3. Remove builtin decision-trace branches from the live contract

Update the trace/type/schema surface so live `agentDecision` payloads only describe policy-agent decisions. Any trace readers inside the workspace should be updated to the narrower contract in the same implementation pass.

### 4. Update architecture docs

Remove references to RandomAgent / GreedyAgent as supported engine bots from docs such as `docs/architecture.md`.

## Files to Touch

- `packages/engine/src/agents/index.ts` (modify)
- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/agents/random-agent.ts` (delete)
- `packages/engine/src/agents/greedy-agent.ts` (delete)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` (modify, generated)
- `packages/engine/test/unit/agents/factory.test.ts` (add)
- `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts` (modify, lint fallout only)
- `docs/architecture.md` (modify)

## Out of Scope

- Runner pre-game UI cleanup.
- Rewriting archived traces or archived tickets.
- Test-harness migration beyond what is required by `AGENTSUNSET-001`.

## Acceptance Criteria

### Tests That Must Pass

1. Shipped engine exports no longer include `RandomAgent` or `GreedyAgent`.
2. Parsing or normalization rejects legacy `builtin:*` descriptors with clear errors.
3. Engine trace/type/schema contracts no longer model builtin agent decisions as a live supported shape.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The only shipped configurable AI descriptor kind is `policy`.
2. No compatibility shim silently maps deprecated built-in agent identifiers onto policy behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/**/factory or schema coverage` — prove policy-only descriptor parsing/validation and explicit rejection of legacy builtin descriptors.
2. Existing migrated suites from `AGENTSUNSET-001` — prove the narrower contract does not regress simulator/runtime proofs.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completed: 2026-04-22

- Removed shipped `RandomAgent` / `GreedyAgent` sources and exports so the public `@ludoforge/engine/agents` surface is policy-only.
- Collapsed the agent descriptor and `agentDecision` trace contracts to policy-only across runtime types, runtime schemas, and the generated `Trace.schema.json` artifact.
- Added focused factory coverage proving policy descriptor normalization plus explicit rejection of legacy `builtin:*` descriptors.
- Cleared a direct lint fallout in `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts` after the policy-only contract removed the last live use of its imported `Agent` type.
- Original ticket deliverable split: final confirmation or truthful narrowing of `pnpm -F @ludoforge/engine test` now belongs to `tickets/AGENTSUNSET-005.md`; this ticket landed the engine-contract removal itself but not the last named broad-lane proof.

- `ticket corrections applied`: `Files to Touch omitted generated trace schema plus direct test fallout -> added packages/engine/schemas/Trace.schema.json, packages/engine/test/unit/agents/factory.test.ts, and packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts to match the live diff`
- `verification set`: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/factory.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js`; `pnpm -F @ludoforge/engine build` (rerun after the benchmark-test lint fix); `pnpm -F @ludoforge/engine lint`; `pnpm -F @ludoforge/engine typecheck`
- `proof gaps`: `tickets/AGENTSUNSET-005.md` owns final confirmation or truthful narrowing of `pnpm -F @ludoforge/engine test` after the default lane narrowed to `dist/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.js` and emitted progress heartbeats for over 20 minutes without a terminal pass/fail summary
