# 15GAMAGEPOLIR-019: Extract Policy Runtime Surface Provider Contracts From Monolithic Evaluator

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — policy runtime architecture, preview/current/candidate surface providers, evaluator integration
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-007-implement-policy-preview-runtime-and-hidden-info-masking.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-018-compile-policy-expressions-into-canonical-typed-runtime-ir.md

## Problem

Even after the visibility cleanup from ticket 017, policy execution logic is still concentrated in a monolithic evaluator that knows too much about every ref family directly: candidate metadata, turn context, seat context, current-state surfaces, and preview-state surfaces. That architecture makes every new policy-visible surface or execution mode expensive to add because runtime ownership is spread across evaluator branches instead of explicit contracts. Once ticket 018 lands typed compiled refs, the next clean boundary is to make runtime surface access explicit through provider contracts rather than keeping resolution logic embedded in one class.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/agents/policy-eval.ts` still contains direct branching for seat refs, turn refs, candidate refs, preview refs, current-state surfaces, and candidate param resolution.
2. `packages/engine/src/agents/policy-preview.ts` is already a specialized runtime collaborator, but its contract is narrow and string-oriented; it is not yet part of a broader explicit policy surface-provider architecture.
3. Ticket 017 fixed the most important ownership gap by making surface visibility explicit, but the evaluator still owns too much ref resolution behavior directly.
4. The ideal long-term architecture is not “one bigger evaluator with more cases”; it is a small evaluator over typed IR plus well-bounded runtime providers for each surface family.
5. `GameDef` and simulation must remain game-agnostic, so these providers must be generic runtime contracts over compiled data and simulator state, not game-specific resolver hooks.
6. Corrected scope: after typed IR exists, extract current-state, preview-state, candidate, and intrinsic access behind explicit provider contracts and keep the evaluator focused on expression execution/order of operations.

## Architecture Check

1. Provider contracts are cleaner than continuing to grow evaluator-local `if`/`switch` trees because they isolate ownership of candidate data, preview data, and current-state surface reads.
2. This preserves the core boundary: game-specific semantics remain authored in `GameSpecDoc` and compiled into `GameDef`; runtime providers only expose generic execution surfaces.
3. Explicit providers make it easier to add future generic surfaces or diagnostics without smearing behavior across `policy-eval.ts`, `policy-preview.ts`, and helper utilities.
4. No backwards-compatibility adapters or legacy evaluator branches should remain once the provider boundary is introduced.
5. `visual-config.yaml` must remain completely outside this runtime contract.

## What to Change

### 1. Define explicit provider contracts for policy runtime surfaces

Introduce typed runtime interfaces for at least:

- current-state surface access
- preview-state surface access
- candidate metadata and candidate param access
- intrinsic context access for acting seat, active seat, phase, step, and round

These contracts should return typed policy values and make unsupported access impossible by construction where feasible.

### 2. Refactor the evaluator into an execution core over providers

Reshape policy evaluation so the evaluator:

- walks typed compiled expressions
- delegates all external reads to provider interfaces
- no longer embeds ref-family-specific parsing or surface-specific branching as core architecture

Preview execution should become one provider implementation or composed provider layer rather than a special string-ref subsystem.

### 3. Align diagnostics, traces, and tests with the provider boundary

Update runtime diagnostics and tests so they assert provider-owned failures and invariants explicitly.

This includes:

- deterministic errors when a typed compiled ref is routed to the wrong provider layer
- visibility-safe preview reads through the preview provider contract
- candidate param and intrinsic context reads staying independent from current/preview state providers

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-surface.ts` (modify or replace)
- `packages/engine/src/agents/policy-ir.ts` (modify if execution helpers move there)
- `packages/engine/src/kernel/types-core.ts` (modify if provider-owned compiled metadata needs representation)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/property/policy-determinism.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify)

## Out of Scope

- changing authored policy syntax
- adding new game-specific heuristics, metrics, or policy libraries
- runner/CLI agent-descriptor work
- visual presentation or `visual-config.yaml`
- search/rollout policy systems beyond Spec 15 v1

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-eval.test.ts` proves the evaluator executes typed compiled expressions through injected provider contracts rather than evaluator-local ad hoc resolution.
2. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview reads flow through the preview provider and preserve ticket 017 visibility behavior.
3. `packages/engine/test/unit/property/policy-determinism.test.ts` proves provider extraction does not change deterministic replay behavior.
4. `packages/engine/test/unit/property/policy-visibility.test.ts` proves hidden-information invariants still hold when current and preview reads are delegated through providers.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The evaluator is an execution engine over typed IR, not a monolithic ref-resolution hub.
2. Current-state, preview-state, candidate, and intrinsic policy surfaces each have one explicit generic runtime owner.
3. `GameDef` and simulation remain game-agnostic; no game-specific runtime providers or branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — execution through provider contracts and deterministic provider failures.
2. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview provider visibility and masking behavior.
3. `packages/engine/test/unit/property/policy-determinism.test.ts` — determinism after evaluator/provider refactor.
4. `packages/engine/test/unit/property/policy-visibility.test.ts` — hidden-info safety through provider-owned runtime surfaces.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
