# 15GAMAGEPOLIR-008: Integrate `PolicyAgent` with Traces and Diagnostics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent integration, trace payloads, diagnostics formatter
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-005-add-agentpolicycatalog-runtime-ir-schema-and-fingerprints.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-007-implement-policy-preview-runtime-and-hidden-info-masking.md

## Problem

Even with a working evaluator, the simulator still needs a generic `PolicyAgent`, policy-aware traces, and inspectable diagnostics. Without that integration, authored policies cannot participate in normal simulation flows or be debugged sanely.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/agents/policy-eval.ts` and `packages/engine/src/agents/policy-runtime.ts` already provide most of the authored-policy decision core, including seat/profile resolution, canonical candidate ordering, pruning metadata, and fallback metadata. The missing work is simulator-facing integration, reusable diagnostics formatting, and policy-aware trace contracts.
2. The engine factory still exposes only string-based built-in agents (`random` / `greedy`), and simulator/game trace payloads currently carry no authored-policy decision metadata. Shared trace events still encode the narrow `ai-random` / `ai-greedy` enum.
3. Spec 15 requires policy traces to capture seat id, resolved profile id, profile fingerprint, pruning/tie-break outcome, preview usage, and emergency fallback status. The current evaluator metadata is a partial substrate, not a complete trace contract.
4. Archived ticket 007 now provides preview execution, but preview visibility is still conservative rather than per-ref contract-driven; this ticket should report the runtime’s real preview/masking behavior, not invent stronger semantics in diagnostics.
5. Corrected scope: this ticket should integrate the engine-side `PolicyAgent` into existing simulator/factory flows, upgrade shared trace contracts, and provide engine-owned diagnostics serialization/formatting. It should not yet perform the broader engine/runner descriptor migration planned in ticket `15GAMAGEPOLIR-009`, and it should not migrate runner seat/session/UI contracts planned in ticket `15GAMAGEPOLIR-010`.
6. Because `@ludoforge/engine/trace` types are consumed by the runner console trace subscriber, a minimal runner trace formatter/test update is in scope as downstream contract maintenance even though runner configuration migration is not.

## Architecture Check

1. Integrating `PolicyAgent` behind the existing simulator contract is cleaner than adding a parallel simulation path.
2. Reusing the existing evaluator metadata as the source of truth for trace/diagnostic payloads is cleaner than duplicating policy reasoning in a second formatter-only path.
3. Structured policy-aware trace payloads are cleaner than stretching the existing `ai-random`/`ai-greedy` enum past its intended boundary.
4. Diagnostics should expose the current preview/visibility contract honestly, including conservative masking when it happens, instead of burying it behind generic success labels.
5. No game-specific trace branches or profile-specific runtime code should be introduced.

## What to Change

### 1. Add the generic `PolicyAgent`

Implement the simulator-facing agent that:

- resolves acting seat
- resolves the authored/default profile or an explicit override when requested by engine-facing callers
- delegates move choice to the existing policy evaluator
- always returns a legal move

### 2. Redesign policy trace payloads

Replace narrow seat-type trace framing with structured policy-aware events and summary/verbose payload tiers that can be emitted from shared trace events and simulator move logs.

### 3. Add policy diagnostics formatting

Add formatter support for:

- resolved profile plan
- parameter values
- cost tiers
- visibility/preview usage
- fingerprints
- pruning/tie-break outcome summaries

## File List

- `packages/engine/src/agents/policy-agent.ts` (new)
- `packages/engine/src/agents/policy-diagnostics.ts` (new)
- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/agents/index.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify if serialized move-trace contracts change)
- `packages/engine/src/kernel/serde.ts` (modify if serialized move-trace contracts change)
- `packages/engine/src/sim/simulator.ts` (modify)
- `packages/engine/src/trace/trace-events.ts` (modify)
- `packages/engine/src/sim/enriched-trace-types.ts` (modify)
- `packages/runner/src/trace/console-trace-subscriber.ts` (modify for shared trace contract compatibility)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (new)
- `packages/engine/test/unit/trace/policy-trace-events.test.ts` (new)
- `packages/runner/test/trace/console-trace-subscriber.test.ts` (modify)

## Out of Scope

- CLI shorthand parsing and full structured descriptor normalization
- runner session/store/UI migration
- authored FITL/Texas policy content
- performance benchmark gating

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-agent.test.ts` proves `PolicyAgent` always returns a legal move, resolves the correct seat/profile, and emits emergency fallback when required.
2. `packages/engine/test/unit/trace/policy-trace-events.test.ts` proves summary and verbose trace payloads contain the Spec 15 required policy fields and no longer depend on a two-value AI seat enum.
3. `packages/runner/test/trace/console-trace-subscriber.test.ts` proves the downstream console formatter renders the new shared trace shape without assuming `ai-random` / `ai-greedy`.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `PolicyAgent` never inspects undeclared game-specific runtime paths.
2. Policy traces identify structured agent/profile/seat data instead of stringly AI seat labels.
3. Trace/diagnostic payloads reuse evaluator-produced policy metadata rather than recomputing policy reasoning in parallel.
4. Emergency fallback remains visible and traceable whenever it fires.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — engine integration and fallback semantics.
2. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — trace payload contract coverage.
3. `packages/runner/test/trace/console-trace-subscriber.test.ts` — downstream formatter compatibility for the shared trace contract.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/runner test -- --run console-trace-subscriber.test.ts`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What actually changed:
  - added `packages/engine/src/agents/policy-agent.ts` as the simulator-facing wrapper over the existing authored-policy evaluator, including authored-binding resolution, explicit profile override support, and emergency-fallback reporting
  - added `packages/engine/src/agents/policy-diagnostics.ts` to derive reusable policy decision traces and diagnostics snapshots from compiled profile data plus evaluator metadata instead of duplicating policy reasoning in a second path
  - extended evaluator metadata in `packages/engine/src/agents/policy-eval.ts` to capture profile fingerprints, pruning summaries, tie-break chain data, preview usage, selected stable keys, and per-candidate verbose details
  - replaced the narrow shared trace `aiDecision` payload with structured `agentDecision` metadata, threaded it through `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/trace/trace-events.ts`, `packages/engine/src/sim/simulator.ts`, and regenerated the engine trace/eval JSON schema artifacts
  - updated built-in engine agents to emit structured built-in decision summaries so simulator traces no longer depend on the old two-value AI seat enum
  - applied the necessary downstream shared-contract maintenance in the runner trace path by updating `packages/runner/src/store/game-store.ts`, `packages/runner/src/trace/console-trace-subscriber.ts`, and its test to consume `agentDecision`
  - added focused coverage in `packages/engine/test/unit/agents/policy-agent.test.ts` and `packages/engine/test/unit/trace/policy-trace-events.test.ts`, and extended factory plus runner trace tests for the new contracts
- Deviations from original plan:
  - the clean architecture required a small shared-agent-decision contract refactor rather than only adding policy-specific trace fields on top of `aiDecision`; keeping the old name/shape would have baked the obsolete random/greedy framing deeper into simulator and runner boundaries
  - full engine/runner structured descriptor migration was still not done here; this ticket only introduced the structured decision payloads and `PolicyAgent` integration needed for authored-policy execution, leaving broader factory/parser/session normalization to follow-on tickets
- Verification:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js packages/engine/dist/test/unit/agents/factory.test.js packages/engine/dist/test/unit/agents/factory-api-shape.test.js`
  - `pnpm -F @ludoforge/runner exec vitest run test/trace/console-trace-subscriber.test.ts`
  - `pnpm turbo lint`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
