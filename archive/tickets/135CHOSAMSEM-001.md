# 135CHOSAMSEM-001: Extend `drawDeadEnd` outcome with optional-chooseN diagnostic payload

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel move completion (`packages/engine/src/kernel/move-completion.ts`)
**Deps**: `specs/135-choosen-sampler-semantics.md`

## Problem

The current `TemplateCompletionResult.drawDeadEnd` variant carries only `rng`, which is insufficient for the caller-retry bias relocation proposed by Spec 135 §Contract 2–3. The retry caller (`prepare-playable-moves.ts:attemptTemplateCompletion`) needs to distinguish "dead-end reached via a count=0 sample on an optional chooseN" from other dead-end causes so it can bias only the retries where biasing is meaningful. Without a structured payload on `drawDeadEnd`, that distinction is not inspectable, and the retry caller cannot make an informed decision about when to set `retryBiasNonEmpty: true`.

This ticket adds the diagnostic payload and, by user-directed boundary rewrite for FOUNDATIONS alignment, also absorbs the `retryBiasNonEmpty` plumbing, retry-caller wiring, warning emission, and `sampledMin` removal originally staged in 135CHOSAMSEM-002 through -004. The widened slice keeps the proof attached to real runtime semantics instead of an unreachable intermediate state and preserves architectural completeness under `docs/FOUNDATIONS.md`.

## Assumption Reassessment (2026-04-18)

1. `TemplateCompletionResult` is defined in `packages/engine/src/kernel/move-completion.ts` as a discriminated union, and the `drawDeadEnd` variant currently carries only `rng` — confirmed via reassessment of spec 135 in this session.
2. `completeTemplateMoveInternal` is the production site that returns `drawDeadEnd`. Dead-ends can arise from multiple internal paths; this ticket captures information about the first-encountered optional chooseN decision on the trace.
3. Spec 135 §Implementation Direction 3 calls out the payload shape: "the first-optional-chooseN decision on the trace (key, sampled count, declared min/max)". This is the exact contract implemented here.

## Architecture Check

1. **Why this approach is cleaner**: The structured payload lives at the outcome boundary where all dead-end diagnostics naturally converge, rather than being reconstructed externally by the retry caller from a side channel. Keeping the diagnostic tied to the outcome preserves deterministic traceability (Foundation 9).
2. **Agnostic boundaries**: The payload describes a generic chooseN decision, using the existing `DecisionKey` and scalar count/min/max fields. No game-specific shape or identifier is introduced. Foundation 1 preserved.
3. **No backwards-compatibility shims**: The payload becomes a required field on the `drawDeadEnd` variant. Every internal site returning `drawDeadEnd` must populate it in this ticket — no optional-field fallback, no `| undefined` shim.

## What to Change

### 1. Extend the `drawDeadEnd` variant

In `packages/engine/src/kernel/move-completion.ts`, modify the `TemplateCompletionResult` union so the `drawDeadEnd` variant carries a structured payload describing the first optional-chooseN decision encountered during the completion attempt. The payload shape:

```ts
interface DrawDeadEndOptionalChooseN {
  readonly decisionKey: DecisionKey;
  readonly sampledCount: number;
  readonly declaredMin: number;
  readonly declaredMax: number;
}

// On the union variant:
| { readonly kind: 'drawDeadEnd'; readonly rng: Rng; readonly optionalChooseN: DrawDeadEndOptionalChooseN | null }
```

`optionalChooseN` is `null` when the completion trace contained no optional chooseN (i.e., the dead-end arose elsewhere). Non-null when at least one optional chooseN was encountered; the payload describes the first one.

### 2. Populate the payload at return sites

Every `completeTemplateMoveInternal` return site that produces `drawDeadEnd` must set `optionalChooseN`. Thread a local accumulator through the internal completion path that records the first optional chooseN decision (key, sampled count, declared min/max) as it is encountered. When the completion ultimately returns `drawDeadEnd`, the accumulator is attached; when it returns `completed`/`structurallyUnsatisfiable`/`stochasticUnresolved`, the accumulator is discarded.

"First optional chooseN" means: the first `chooseN` request resolved by `chooseAtRandom` where `request.min === 0 && request.max > 0 && options.length >= 1`. Only the first such occurrence is captured; subsequent ones are ignored for payload purposes.

### 3. Update other return sites to set `optionalChooseN: null`

Any `drawDeadEnd` return site not reached through `chooseAtRandom` (e.g., structural dead-ends discovered before any chooseN is sampled) sets `optionalChooseN: null` explicitly. No implicit defaults.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/kernel/playable-candidate.ts` (modify)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` (generated)
- `packages/engine/test/unit/kernel/move-completion-draw-dead-end-payload.test.ts` (new)
- `packages/engine/test/unit/kernel/move-completion-retry.test.ts` (modify)
- `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` (modify)
- `packages/engine/test/unit/kernel/playable-candidate.test.ts` (modify)
- `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (modify)

## Out of Scope

- New standalone sampler-purity coverage still tracked in `135CHOSAMSEM-005`.
- Any follow-up cleanup to the historical draft split beyond marking absorbed tickets accurately.

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: given a template move that dead-ends via an optional chooseN (`min=0, max=N`) sampling count=0, `completeTemplateMove` returns `{ kind: 'drawDeadEnd', rng, optionalChooseN: { decisionKey, sampledCount: 0, declaredMin: 0, declaredMax: N } }`.
2. New unit test: given a template move that dead-ends before any chooseN is encountered (e.g., a structural target-selector miss), `completeTemplateMove` returns `{ kind: 'drawDeadEnd', rng, optionalChooseN: null }`.
3. New retry-path unit test: when the prior attempt dead-ended from `optionalChooseN.sampledCount === 0`, the next retry is dispatched with `retryBiasNonEmpty: true` and emits `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` through the deterministic preparation warning surface.
4. Existing suite: `pnpm turbo test` — no regression in completion outcomes beyond the intentional removal of the hidden first-attempt `sampledMin` clamp.

### Invariants

1. `TemplateCompletionResult.drawDeadEnd` now carries `optionalChooseN: DrawDeadEndOptionalChooseN | null` as a required field. No runtime sites return `drawDeadEnd` without populating it.
2. `optionalChooseN`, when non-null, captures the FIRST optional chooseN encountered on the trace — deterministic across runs for the same input.
3. Retry bias is applied only by the retry layer after a prior dead-end whose captured optional chooseN sampled `0`; the sampler itself no longer hard-clamps optional chooseN counts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-completion-draw-dead-end-payload.test.ts` (new) — covers both populated and `null` payload cases.
2. Existing optional-chooseN tests in `move-completion-retry.test.ts`, `completion-contract-invariants.test.ts`, and `playable-candidate.test.ts` migrate from “silent non-empty preference” assertions to first-attempt semantics plus payload assertions.
3. `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (modify) — proves retry bias dispatch and warning emission through the preparation trace.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo build test lint typecheck`

## Outcome

- 2026-04-18: Completed with a user-directed boundary rewrite to absorb the original `135CHOSAMSEM-002` through `135CHOSAMSEM-004` slices so the payload proof matched live runtime semantics and remained aligned with `docs/FOUNDATIONS.md` #14, #15, and #16.
- Landed:
  - `TemplateCompletionResult.drawDeadEnd` now carries required `optionalChooseN: DrawDeadEndOptionalChooseN | null`.
  - `completeTemplateMove` records the first optional chooseN sample (`decisionKey`, `sampledCount`, declared bounds) and threads it to every `drawDeadEnd` return site.
  - `TemplateMoveCompletionOptions.retryBiasNonEmpty` is threaded through completion, and `prepare-playable-moves.ts` sets it only on qualifying retries after a captured `sampledCount: 0` dead-end.
  - Retry dispatches with that bias now emit `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` through `movePreparations[].warnings`.
  - `selectFromChooseN` now samples directly from declared `[min, max]`; the hidden `sampledMin` clamp is removed.
  - Focused tests now prove both populated and `null` payload cases, retry-bias warning behavior, and migrated optional-chooseN assertions no longer encode the removed hidden bias.
- ticket corrections applied: `pure information-carrying change with no observable behavior changes -> widened by user override to include retry plumbing, warning emission, and sampledMin removal so acceptance proof matched live runtime behavior`
- verification run:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-completion-draw-dead-end-payload.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/completion-contract-invariants.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-completion-retry.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/playable-candidate.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/prepare-playable-moves-retry.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/prepare-playable-moves.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
- schema/artifact fallout checked: `packages/engine/schemas/Trace.schema.json` regenerated to carry the new warning surface.
