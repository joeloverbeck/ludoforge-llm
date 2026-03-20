# 15GAMAGEPOLIR-019: Extract Policy Runtime Surface Provider Contracts From Monolithic Evaluator

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — policy runtime architecture, preview/current/candidate surface providers, evaluator integration
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-007-implement-policy-preview-runtime-and-hidden-info-masking.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-018-compile-policy-expressions-into-canonical-typed-runtime-ir.md

## Problem

Even after the visibility cleanup from ticket 017, policy execution logic is still concentrated in a monolithic evaluator that knows too much about every ref family directly: candidate metadata, turn context, seat context, current-state surfaces, and preview-state surfaces. That architecture makes every new policy-visible surface or execution mode expensive to add because runtime ownership is spread across evaluator branches instead of explicit contracts. Once ticket 018 lands typed compiled refs, the next clean boundary is to make runtime surface access explicit through provider contracts rather than keeping resolution logic embedded in one class.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/agents/policy-eval.ts` still mixes expression execution with runtime reads for seat intrinsics, turn intrinsics, candidate intrinsics, candidate params, and non-preview surface refs. That part of the ticket remains valid.
2. `packages/engine/src/agents/policy-preview.ts` already exists as a typed preview runtime collaborator. It is not string-oriented, and preview access is not still embedded directly inside the evaluator. The ticket must not pretend preview ownership is missing from scratch.
3. `packages/engine/src/agents/policy-surface.ts` already owns authored-surface parsing and visibility lookup. The missing boundary is narrower: evaluator-time runtime value access is not yet consistently delegated through explicit provider contracts.
4. The codebase already has typed compiled refs from ticket 018. This ticket should build on those existing ref kinds rather than introducing another compatibility layer or aliasing scheme.
5. Existing tests already cover preview caching/masking, policy determinism, and hidden-information invariants. The remaining test gap is proving ownership boundaries and provider-routed failures explicitly, not recreating all behavior tests from scratch.
6. Corrected scope: extract current-state, intrinsic, and candidate access behind explicit runtime provider contracts, keep `policy-preview.ts` as the preview provider implementation, and leave authored syntax and compiled ref shapes unchanged.

## Architecture Check

1. A provider boundary is still the better architecture, but only if it removes evaluator-owned runtime reads without duplicating the already-valid preview and visibility layers.
2. The evaluator should become an execution core over typed refs plus injected runtime providers. It should not become a second dispatch layer that wraps one-off helpers with no ownership gain.
3. This preserves the core boundary: game-specific semantics remain authored in `GameSpecDoc` and compiled into `GameDef`; runtime providers only expose generic execution surfaces.
4. No backwards-compatibility adapters, alias names, or parallel legacy resolution paths should remain after the refactor.
5. `visual-config.yaml` must remain completely outside this runtime contract.

## What to Change

### 1. Define explicit provider contracts for policy runtime access

Introduce typed runtime interfaces for:

- current-state surface access
- preview-state surface access, represented by the existing `policy-preview.ts` runtime behind the shared contract
- candidate metadata and candidate param access
- intrinsic context access for acting seat, active seat, phase, step, and round

These contracts should return typed policy values and centralize runtime ownership. Do not add a provider abstraction for library refs; library resolution should stay inside the evaluator.

### 2. Refactor the evaluator into an execution core over providers

Reshape policy evaluation so the evaluator:

- walks typed compiled expressions
- delegates all external reads to provider interfaces
- no longer embeds ref-family-specific parsing or surface-specific branching as core architecture

Preview execution should remain one provider implementation behind the shared contract rather than a special-case branch inside `policy-eval.ts`.

### 3. Align diagnostics, traces, and tests with the provider boundary

Update runtime diagnostics and tests so they assert provider-owned failures and invariants explicitly.

This includes:

- deterministic errors when a typed compiled ref is routed to an unsupported runtime provider
- visibility-safe preview reads through the preview provider contract
- candidate param and intrinsic context reads staying independent from current/preview state providers

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (add)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-surface.ts` (modify if shared runtime helpers belong there)
- `packages/engine/src/kernel/types-core.ts` (modify if shared provider contracts should be exported)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify if preview contract shape changes)
- `packages/engine/test/unit/property/policy-determinism.test.ts` (modify only if needed to pin the provider boundary)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify only if needed to pin the provider boundary)

## Out of Scope

- changing authored policy syntax
- adding new game-specific heuristics, metrics, or policy libraries
- runner/CLI agent-descriptor work
- visual presentation or `visual-config.yaml`
- search/rollout policy systems beyond Spec 15 v1

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-eval.test.ts` proves the evaluator executes typed compiled expressions through explicit runtime providers rather than evaluator-local ad hoc resolution.
2. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview reads remain owned by the preview provider and preserve ticket 017 visibility behavior.
3. `packages/engine/test/unit/property/policy-determinism.test.ts` proves provider extraction does not change deterministic replay behavior.
4. `packages/engine/test/unit/property/policy-visibility.test.ts` proves hidden-information invariants still hold when current and preview reads are delegated through providers.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The evaluator is an execution engine over typed IR, not a monolithic ref-resolution hub.
2. Current-state, preview-state, candidate, and intrinsic runtime reads each have one explicit generic owner.
3. `GameDef` and simulation remain game-agnostic; no game-specific runtime providers or branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — execution through provider contracts, provider-owned failures, and separation between intrinsic/candidate/current providers.
2. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview provider visibility and masking behavior, plus any shared contract assertions if applicable.
3. `packages/engine/test/unit/property/policy-determinism.test.ts` — determinism after evaluator/provider refactor.
4. `packages/engine/test/unit/property/policy-visibility.test.ts` — hidden-info safety through provider-owned runtime surfaces.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What actually changed: extracted explicit runtime provider contracts into `packages/engine/src/agents/policy-runtime.ts`; moved current-surface, candidate, and intrinsic reads behind those providers; kept `policy-preview.ts` as the preview provider implementation; shared seat-token and victory-surface helpers through `policy-surface.ts`; updated evaluator/tests to assert provider-owned routing and failures.
- Deviations from original plan: did not modify `packages/engine/src/kernel/types-core.ts`; did not change authored syntax or compiled ref shapes; property tests remained valid without code changes because the provider extraction preserved their invariants.
- Verification results: `pnpm -F @ludoforge/engine build`; `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js`; `pnpm -F @ludoforge/engine lint`; `pnpm -F @ludoforge/engine test`; `pnpm run check:ticket-deps`.
