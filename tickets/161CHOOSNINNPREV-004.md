# 161CHOOSNINNPREV-004: `chooseFrontierDecision` kind-dispatch + integration tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-003.md`

## Problem

The `chooseFrontierDecision` method at `policy-agent.ts:266` calls `createPolicyAgentChooseOneInnerPreview` unconditionally. With the chooseNStep adapter delivered (Ticket 003), the dispatch must select the correct adapter by microturn kind so chooseNStep profiles produce non-`disabled` `previewUsage` and the chooseN microturn evaluator at `microturn-option-evaluator.ts:154` receives a populated `previewOptionResolvedRefsByOptionKey` map.

This ticket also lands the two end-to-end behavioral tests for the integration: a constructed differentiation convergence-witness fixture proving per-option preview produces distinct refs for distinct ADDs, and a key-parity invariant test proving the three key-derivation sites agree.

## Assumption Reassessment (2026-05-07)

1. The unconditional call at `policy-agent.ts:266` is `const innerPreview = createPolicyAgentChooseOneInnerPreview(input, resolvedProfile);`. For chooseNStep microturns it returns `undefined` (kind guard at the adapter), so no current behavior changes for chooseNStep-disabled profiles.
2. `chooseStructuralFrontierDecision` is defined at `policy-agent.ts:106` and called at line 317; Ticket 003 renamed its `innerPreview` parameter to the shared `PolicyAgentInnerPreview | undefined` type as Foundation 14 no-alias fallout. This ticket owns the dispatch behavior that will first pass a chooseNStep adapter result into that shared parameter.
3. `frontierDecisionKey` at `policy-agent.ts:162` produces `chooseNStep:<decisionKey>:<command>:<JSON(value ?? null)>`; for ADD decisions (`command === 'add'`), this matches the per-option `stableMoveKey` and `scoreContributionsKeyForChooseNStepAdd` outputs. The `previewByOptionKey.get(frontierDecisionKey(...))` lookup at line 290 succeeds without normalization.
4. Ticket 003 has replaced `PolicyAgentChooseOneInnerPreview` with the shared structural interface `PolicyAgentInnerPreview`.
5. Downstream metadata-construction code (lines 277–305) reads `byOptionKey`, `refIds`, and `usage` — all present on the shared interface.

## Architecture Check

1. Kind-dispatched ternary at the single dispatch site. No game-specific identifiers in the dispatch — F#1 honored.
2. `chooseStructuralFrontierDecision` accepts the shared shape and propagates `previewUsage` for both kinds — F#19 honored (uniform per-published-decision treatment).
3. Default-off invariant: profiles with `chooseNStep: false` (or omitted) hit the same `undefined` path as today via the chooseNStep adapter's `chooseNStep !== true` guard. Verified during reassessment.
4. Key parity verified across the three derivation sites — no normalization layer needed; an architectural-invariant test prevents future drift.

## What to Change

### 1. Kind-dispatched dispatch — `packages/engine/src/agents/policy-agent.ts:266`

Replace:

```ts
const innerPreview = createPolicyAgentChooseOneInnerPreview(input, resolvedProfile);
```

with:

```ts
const innerPreview =
  input.microturn.kind === 'chooseOne'
    ? createPolicyAgentChooseOneInnerPreview(input, resolvedProfile)
    : input.microturn.kind === 'chooseNStep'
      ? createPolicyAgentChooseNStepInnerPreview(input, resolvedProfile)
      : undefined;
```

Add the import for `createPolicyAgentChooseNStepInnerPreview` from `./policy-agent-inner-preview.js`.

### 2. Shared-parameter consumption — `policy-agent.ts:106`

Verify `chooseStructuralFrontierDecision` already accepts `PolicyAgentInnerPreview | undefined` from Ticket 003. The body accesses only shared fields (`byOptionKey`, `refIds`, `usage`); this ticket's behavioral change is to kind-dispatch construction so chooseNStep adapter output can reach that existing shared parameter.

### 3. Downstream metadata construction (lines 277–305)

Verify the metadata-construction block consumes the shared shape correctly. No code change is required if Ticket 003 has correctly produced a shared structural interface; this is a typecheck-time confirmation.

### 4. New differentiation convergence-witness test

`packages/engine/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.ts` (new — `convergence-witness`). Witness id: `spec-161-choosenstep-differentiation`.

Constructed fixture: a chooseNStep microturn with two legal ADDs (A and B) leading to materially different post-ADD states. The chooseN microturn evaluator receives different `preview.option.delta.victory.currentMargin.self` values; the agent picks the option with the higher delta. Mirrors the ARVN scenario where 5/11 chooseNStep ties were broken by per-option preview.

### 5. New key-parity invariant test

`packages/engine/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.ts` (new — `architectural-invariant`).

Asserts: for a fixture of representative chooseNStep ADD decisions, `frontierDecisionKey(def, decision)`, `chooseNStepStableMoveKey(decision)`, and `scoreContributionsKeyForChooseNStepAdd(request, value)` produce byte-identical strings. Prevents silent drift if any of the three key-derivation sites is refactored independently.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify — kind-dispatched `innerPreview`; verify existing shared-parameter consumption)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.ts` (new — `convergence-witness`)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.ts` (new — `architectural-invariant`)

## Out of Scope

- Compile-time warning extension to `chooseNStep` — Ticket 005.
- Squared-cost formula — Ticket 006.
- Hidden-info, replay-identity, no-op-default, FITL canary, structural audit, cookbook, manual validation tests — Tickets 007–013.
- Any change to the chooseNStep adapter's internals (delivered in Ticket 003).

## Acceptance Criteria

### Tests That Must Pass

1. New: profile with `preview.inner.chooseNStep: true` and a `preferOptionProjectedMargin`-equivalent microturn-scope consideration produces non-`disabled` `previewUsage` at every chooseNStep microturn.
2. New: differentiation convergence-witness — agent picks the higher-delta ADD between two distinct options.
3. New: key-parity invariant — `frontierDecisionKey`, `chooseNStepStableMoveKey`, and `scoreContributionsKeyForChooseNStepAdd` produce identical strings for the same chooseNStep ADD decision.
4. Existing engine suite: `pnpm -F @ludoforge/engine test`.
5. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) Default-off profile with `chooseNStep: false` produces `innerPreview === undefined` at chooseNStep microturns — same as today (no behavior drift).
2. (architectural-invariant) `frontierDecisionKey`, `chooseNStepStableMoveKey`, `scoreContributionsKeyForChooseNStepAdd` agree on `chooseNStep:<decisionKey>:add:<JSON(value ?? null)>` for every chooseNStep ADD decision.
3. (convergence-witness) Differentiation: for the constructed fixture, the agent's selected ADD is the higher-delta option.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.ts` (new) — `convergence-witness`. Witness id: `spec-161-choosenstep-differentiation`.
2. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.ts` (new) — `architectural-invariant`. Three-way key parity for ADD decisions.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.js`
2. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm -F @ludoforge/engine test`
