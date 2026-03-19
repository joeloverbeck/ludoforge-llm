# 15GAMAGEPOLIR-020: Split Policy Surface Refs Into Discriminated Current and Preview IR Variants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy IR types/schema, compiler lowering, evaluator/runtime provider contracts, policy tests
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-018-compile-policy-expressions-into-canonical-typed-runtime-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-019-extract-policy-runtime-surface-provider-contracts-from-monolithic-evaluator.md

## Problem

The current compiled policy IR models surface refs as one object shape with `phase: 'current' | 'preview'`. That is technically usable, but it is not the cleanest long-term architecture because it weakens the type boundary between current-state and preview-state reads. It forces provider contracts and evaluator code to recover the distinction with local intersection types and casts instead of letting the IR shape express the ownership boundary directly.

If we want the policy runtime to stay clean, robust, and extensible, the compiled IR should make current and preview surface refs distinct by construction. This is an internal architecture ticket, not a user-facing syntax change.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/kernel/types-core.ts` currently defines `CompiledAgentPolicyRef` surface refs as a single shape with a unioned `phase` property rather than separate discriminated variants.
2. `packages/engine/src/cnl/compile-agents.ts` and `packages/engine/src/kernel/schemas-core.ts` already lower and validate typed compiled refs, so this ticket must refine those existing contracts rather than introduce a second IR layer.
3. Archived ticket 019 extracted runtime provider ownership successfully, but its implementation still needed local `PolicyCurrentSurfaceRef` and `PolicyPreviewSurfaceRef` intersection aliases because the compiled ref type does not discriminate cleanly enough yet.
4. None of the remaining active tickets explicitly owns this IR-shape cleanup. Ticket 013 is the closest downstream consumer because it plans to freeze compiled policy IR in golden fixtures, so it should not lock in the current avoidable shape accidentally.
5. Corrected scope: change the compiled internal IR, schema, compiler lowering, and runtime/provider typing so current and preview surface refs are explicit variants. Do not change authored `GameSpecDoc` syntax or add any compatibility aliases.

## Architecture Check

1. Separate discriminated ref variants are cleaner than a single unioned `phase` field because they make provider ownership and evaluator dispatch explicit at the type level instead of relying on casts and helper aliases.
2. This preserves the core boundary: authored game-specific policy data still lives in `GameSpecDoc`, while `GameDef`, compiler IR, and simulator/runtime remain generic and game-agnostic.
3. No backwards-compatibility shims, alias ref kinds, or dual-schema acceptance paths should be introduced. Existing compiler/runtime/tests should be updated to the new canonical IR shape directly.
4. This is a foundational cleanup that makes later policy runtime extensions safer. New generic surfaces or diagnostics should extend discriminated IR variants, not accumulate more hidden unions in one broad ref object.

## What to Change

### 1. Redefine compiled surface refs as explicit discriminated variants

Update the compiled policy ref model so current-state and preview-state surface refs are represented by separate canonical variants.

That should include:

- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- any exported kernel types/index surfaces that expose compiled policy refs

The new shape must let TypeScript narrow provider calls without local casts.

### 2. Align compiler lowering with the new IR shape

Update policy compilation to emit the new canonical variants directly from authored refs.

This includes:

- lowering from authored policy refs in `packages/engine/src/cnl/compile-agents.ts`
- any helper types or validation paths that currently assume one shared surface-ref object shape

### 3. Remove transitional typing debt from evaluator/runtime code

Refactor policy runtime code to consume the new discriminated IR directly.

This includes:

- removing local intersection aliases added only to compensate for the current ref shape
- ensuring current and preview providers accept their exact canonical ref variants
- keeping runtime ownership split across generic providers, not re-centralizing logic in the evaluator

### 4. Lock the new IR contract with tests and goldens

Add or strengthen tests so the new discriminated shape is treated as the canonical internal contract.

This should include:

- compiler tests that assert the emitted compiled ref variants
- evaluator/runtime tests that prove provider signatures narrow correctly and unsupported routing fails deterministically
- regression coverage so future tickets do not collapse the variants back into a broad unioned shape

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify if exported types shift)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/property/policy-determinism.test.ts` (modify only if needed)

## Out of Scope

- changing authored policy syntax
- adding new game-specific surfaces, heuristics, or authored policy content
- runner/CLI agent-descriptor work
- changing `visual-config.yaml` semantics
- revisiting hidden-information policy beyond the existing generic visibility contract

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves authored current and preview refs lower to distinct compiled IR variants.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` and `packages/engine/test/unit/agents/policy-preview.test.ts` prove runtime providers accept the canonical discriminated variants directly without local compensating alias types.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Current-state and preview-state surface refs are distinct canonical compiled IR variants.
2. `GameDef` and simulation remain game-agnostic; no game-specific branches or compatibility aliases are introduced.
3. Authored `GameSpecDoc` policy syntax remains unchanged; only the compiled internal IR is cleaned up.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compiled policy ref shape regression coverage.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — provider dispatch against canonical current-surface ref variants.
3. `packages/engine/test/unit/agents/policy-preview.test.ts` — provider dispatch against canonical preview-surface ref variants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`
