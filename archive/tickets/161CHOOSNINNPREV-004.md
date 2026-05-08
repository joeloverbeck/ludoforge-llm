# 161CHOOSNINNPREV-004: `chooseFrontierDecision` kind-dispatch + integration tests

**Status**: COMPLETED
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
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-fixture.ts` (new — shared constructed witness fixture for this ticket's two integration tests)
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

## Outcome

Completed on 2026-05-07. Landed slice:

- `packages/engine/src/agents/policy-agent.ts` now dispatches inner-preview construction by microturn kind, calling `createPolicyAgentChooseOneInnerPreview` for `chooseOne`, `createPolicyAgentChooseNStepInnerPreview` for `chooseNStep`, and `undefined` for other frontier kinds.
- Existing shared-parameter consumption was verified as already satisfied from Ticket 003: `chooseStructuralFrontierDecision`, guided metadata construction, and `matchGuidedCompletionDecision` consume `PolicyAgentInnerPreview` through `byOptionKey`, `refsByOptionKey`, `refIds`, and `usage`.
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.ts` proves the constructed witness `spec-161-choosenstep-differentiation`: with `preview.inner.chooseNStep: true`, the policy agent selects the higher-delta ADD and emits non-disabled, differentiating `previewUsage`; with the flag off, chooseNStep preview stays disabled.
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.ts` proves key parity through observed runtime outputs: `runChooseNStepInnerPreview` option keys, policy-agent verbose frontier candidate keys, and chooseN score-contribution lookup all agree for the same ADDs.
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-fixture.ts` is owned test-support fallout to avoid duplicating the constructed chooseNStep witness across the two ticket-named tests.

Semantic correction: the live fixture's canonical chooseN decision key is `$picks`, so the concrete ADD keys are `chooseNStep:$picks:add:<JSON(value)>`; this still satisfies the ticket's `chooseNStep:<decisionKey>:add:<JSON(value ?? null)>` contract and is now asserted via observed runtime keys rather than draft-only string literals.

Generated fallout: transient `packages/engine/dist/` only; no schema, golden, or compiled JSON artifact is owned by this ticket.

Deferred sibling scope: compiler warning parity, cost validation, hidden-info, replay/no-op, FITL canary, structural audit, cookbook, and manual validation remain with Tickets 005-013.

File-size sweep: `policy-agent.ts` is 485 lines after the dispatch edit; the new shared fixture is 238 lines, differentiation test 62 lines, and key-parity test 64 lines. All are below the repo cap.

Runtime surface breadth: policy/agent-only behavior; no kernel, schema, or package-barrel public surface change.

Command ledger:

- `Test Plan | pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.js | split into serial build plus focused compiled test | build passed; focused compiled test passed after final marker edit`
- `Test Plan | pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.js | split into same serial build plus focused compiled test | build passed; focused compiled test passed after final marker edit`
- `Test Plan | pnpm turbo typecheck | run literally | passed`
- `Test Plan | pnpm turbo lint | run literally | passed`
- `Test Plan | pnpm -F @ludoforge/engine test | run literally | passed; default lane summary 65/65 files passed`

Output sequencing: final proof ran build first, then focused compiled tests against stable `dist`; `pnpm turbo typecheck` rebuilt `dist`, so both focused compiled tests were rerun against the refreshed output before the broad engine package test.

Broad-lane recovery: the first `pnpm -F @ludoforge/engine test` attempt failed only the test-class marker guard because the new `convergence-witness` file was missing `@witness`; adding `// @witness: spec-161-choosenstep-differentiation` fixed that owned corpus-metadata issue, and the rerun passed.

Late-edit proof validity: after the first final proof lanes, the only source edit was the test marker comment required by the engine corpus guard. Affected lanes rerun after that edit: `pnpm -F @ludoforge/engine build`, both focused compiled tests, and `pnpm -F @ludoforge/engine test`. `pnpm turbo typecheck` and `pnpm turbo lint` were not invalidated by the marker-only comment; the post-edit engine build recompiled the affected test source.

Terminal closeout no-invalidation: status/proof transcription only; no scope, acceptance criteria, command semantics, touched-file ownership, follow-up ownership, dependency classification, source code, or test behavior changed.

Ticket graph integrity: `pnpm run check:ticket-deps` passed for 10 active tickets and 2270 archived tickets.
