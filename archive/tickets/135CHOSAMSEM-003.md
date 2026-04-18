# 135CHOSAMSEM-003: Wire retry caller — detect dead-end from count=0, set `retryBiasNonEmpty`, emit `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning

**Status**: DEFERRED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents / move preparation (`packages/engine/src/agents/prepare-playable-moves.ts`), kernel move completion (`packages/engine/src/kernel/move-completion.ts` if the diagnostic channel needs extension)
**Deps**: `archive/tickets/135CHOSAMSEM-001.md`, `archive/tickets/135CHOSAMSEM-002.md`

## Problem

This draft ticket's owned slice was absorbed on 2026-04-18 by `135CHOSAMSEM-001` through a user-directed boundary rewrite required for `docs/FOUNDATIONS.md` alignment. It remains only as a historical record of the original planned split.

With 135CHOSAMSEM-001 (structured `drawDeadEnd` payload) and 135CHOSAMSEM-002 (`retryBiasNonEmpty` option + call-site clamp) in place, the retry caller (`attemptTemplateCompletion` in `prepare-playable-moves.ts`) can now make an informed decision about when to bias its retries. This ticket wires that decision: when the prior attempt returned `drawDeadEnd` with `optionalChooseN` indicating sampled count=0, the next retry passes `retryBiasNonEmpty: true` and emits a `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning through the completion diagnostic channel.

This ticket does NOT remove `sampledMin` from the sampler (that happens in 135CHOSAMSEM-004). Observable sampling outcomes remain unchanged because `sampledMin` is still live. The only observable new behavior is the warning being emitted on qualifying retries.

## Historical Resolution

- Retry-layer detection of `optionalChooseN.sampledCount === 0`, dispatch of `retryBiasNonEmpty: true`, and emission of `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` landed as part of `135CHOSAMSEM-001`.
- The deterministic warning surface was implemented on `movePreparations[].warnings`, with schema/type updates included in that widened ticket.
- This draft stays deferred so the original spec-to-ticket decomposition remains inspectable, but it no longer represents pending implementation work.

## Assumption Reassessment (2026-04-18)

1. `attemptTemplateCompletion` owns the retry loop. It already handles `drawDeadEnd`/`notViable` with a cap of `NOT_VIABLE_RETRY_CAP = 7` additional attempts. Adding per-attempt bias tracking fits naturally inside this loop. Confirmed during spec 135 reassessment.
2. The existing retry loop uses `fork(currentRng)` on each attempt to progress through RNG streams. Bias tracking is orthogonal to RNG progression and does not modify fork behavior.
3. A completion diagnostic channel for warnings may or may not already exist on this path. If none exists, the wiring necessary to surface `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` through the existing warning/diagnostic surface must be added as part of this ticket — not coupled to `console.warn` (Spec 135 explicitly prohibits that coupling).
4. `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` is a new warning identifier. Naming verified against the spec.

## Architecture Check

1. **Why this approach is cleaner**: The retry layer owns dead-end recovery. This is the only layer that observes "the first attempt dead-ended" and is therefore the correct site to apply a recovery bias. Placing the bias here satisfies Foundation 15 (architectural completeness) — decisions happen at the layer that has the context to make them.
2. **Agnostic boundaries**: The detection uses the generic `drawDeadEnd.optionalChooseN` payload from 135CHOSAMSEM-001. No game-specific logic. Foundation 1 preserved.
3. **No backwards-compatibility shims**: The warning is a net-new diagnostic. No alias paths introduced.

## What to Change

### 1. Track prior-attempt payload in `attemptTemplateCompletion`

Inside the retry loop, capture the `drawDeadEnd` outcome's `optionalChooseN` payload from the immediately-prior attempt. Track it in a local variable that carries from one iteration to the next. Clear it on any non-dead-end outcome (e.g., a retry that completes).

### 2. Bias-qualification check

Before invoking `completeTemplateMove` on a retry iteration, compute:

```ts
const shouldBias =
  priorDeadEnd !== null
  && priorDeadEnd.optionalChooseN !== null
  && priorDeadEnd.optionalChooseN.sampledCount === 0;
```

When `shouldBias` is true, pass `retryBiasNonEmpty: true` in the `TemplateMoveCompletionOptions`. When false, pass `false` or omit the field (either is fine because the default is `false`).

### 3. Emit the warning

When a retry is dispatched with `retryBiasNonEmpty: true`, emit a `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning through the completion diagnostic channel. The warning payload should include:

- Attempt index within the retry loop
- The prior attempt's `decisionKey` (from the `optionalChooseN` payload)
- The declared `min`/`max` (from the same payload)
- A short static reason string identifying this as the bias-on-retry warning

If the diagnostic channel does not already thread into `attemptTemplateCompletion`, add the plumbing so the warning surfaces through the same mechanism used for other completion warnings. Do NOT route to `console.warn` — the warning must flow through the deterministic diagnostic surface.

### 4. Other caller (`playable-candidate.ts`) unchanged

`playable-candidate.ts` is a diagnostic caller, not a retry driver. It does not set `retryBiasNonEmpty` and does not observe the warning. No changes to this file.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)
- `packages/engine/src/kernel/move-completion.ts` (modify — only if diagnostic channel plumbing needs extension to carry the new warning identifier)

## Out of Scope

- Removal of `sampledMin` from `selectFromChooseN` (135CHOSAMSEM-004). First-attempt sampling remains biased via `sampledMin` in this ticket — only retry-layer behavior changes observably (warning is now emitted on qualifying retries).
- Test fixture migrations that assert first-attempt uniform sampling (135CHOSAMSEM-004).
- New sampler-purity unit test (135CHOSAMSEM-005).
- Audit of `completion-contract-invariants.test.ts` (135CHOSAMSEM-004).

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: given a scenario where the first attempt returns `drawDeadEnd` with `optionalChooseN.sampledCount === 0`, the second attempt receives `retryBiasNonEmpty: true` and the diagnostic channel captures a `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning identifying the decision key.
2. New unit test: given a scenario where the first attempt returns `drawDeadEnd` with `optionalChooseN === null` (dead-end arose elsewhere), the second attempt does NOT set `retryBiasNonEmpty` and no warning is emitted.
3. New unit test: given a scenario where the first attempt completes, no retry is attempted and no warning is emitted.
4. Existing suite: `pnpm turbo test` — no regressions. `move-completion-retry.test.ts §2` continues to pass because `sampledMin` is still live and first-attempt bias still applies (test migration happens in 135CHOSAMSEM-004).

### Invariants

1. The warning is emitted if and only if the retry is dispatched with `retryBiasNonEmpty: true`.
2. The bias qualification condition (`priorDeadEnd.optionalChooseN.sampledCount === 0`) is the sole criterion — no other conditions silently trigger biased retries.
3. The retry cap (`NOT_VIABLE_RETRY_CAP = 7`) is unchanged — bias-on-retry does not expand the retry budget.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/prepare-playable-moves-retry-bias.test.ts` (new) — covers the three acceptance scenarios above.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo build test lint typecheck`
