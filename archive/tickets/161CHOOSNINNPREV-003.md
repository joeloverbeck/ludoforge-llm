# 161CHOOSNINNPREV-003: Shared `PolicyAgentInnerPreview` interface + chooseNStep adapter

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-002.md`

## Problem

`policy-agent-inner-preview.ts` exports `createPolicyAgentChooseOneInnerPreview` returning a `PolicyAgentChooseOneInnerPreview` shape. To support a parallel chooseNStep adapter without duplicating helpers (`summarizeUsage`, `summarizeReadyRefStats`) and without forcing the dispatch site to discriminate on type-narrowed unions, both adapters need to expose a single shared structural interface.

This ticket introduces `PolicyAgentInnerPreview` as the shared structural interface, refactors `summarizeUsage` and `summarizeReadyRefStats` to operate over the shared shape, and adds `createPolicyAgentChooseNStepInnerPreview` that returns an instance of that shared shape, backed by `runChooseNStepInnerPreview` (delivered in Ticket 002).

## Assumption Reassessment (2026-05-07)

1. `createPolicyAgentChooseOneInnerPreview` exists at `policy-agent-inner-preview.ts:147` and returns `PolicyAgentChooseOneInnerPreview` (declared at lines 17–23) with fields `run`, `refIds`, `usage`, `byOptionKey`, `refsByOptionKey`.
2. `summarizeUsage` (lines 125–145) and `summarizeReadyRefStats` (lines 74–123) currently are typed against `ChooseOneInnerPreviewRun`. Their bodies access `options[].outcome` and `options[].resolvedRefs` — both fields exist symmetrically on `ChooseNStepInnerPreviewRun` (delivered in Ticket 002), so a generic-over-the-shared-fields refactor is structural.
3. `runChooseNStepInnerPreview` (Ticket 002) returns `ChooseNStepInnerPreviewRun` whose `options[].stableMoveKey` matches `frontierDecisionKey(def, decision)` for ADD decisions (verified during reassessment).
4. `PolicyAgentInnerPreview` is a proposed-new shared interface; it does not currently exist in the codebase.

## Architecture Check

1. Shared structural interface (no `kind` discriminator) means `chooseFrontierDecision` consumes `byOptionKey`, `refIds`, and `usage` uniformly without `switch`-based narrowing. The underlying `run.options[].decision.kind` already discriminates if any future consumer needs it.
2. F#14 — clean refactor: `PolicyAgentChooseOneInnerPreview` collapses into `PolicyAgentInnerPreview` (no alias). All consumers update in this same ticket.
3. F#19 — chooseNStep per-option preview is the per-published-decision analog of chooseOne per-option preview; the shared adapter shape encodes this uniformity.
4. Engine-agnostic — adapter changes touch no game-specific identifiers. F#1 honored.

## Boundary Correction (2026-05-07)

Live reassessment found that removing `PolicyAgentChooseOneInnerPreview` without an alias requires the existing `policy-agent.ts` consumer type to rename to `PolicyAgentInnerPreview`. That is a Foundation 14 no-alias cleanup, not the Ticket 004 dispatch behavior. This ticket therefore owns the minimal type-only `policy-agent.ts` import/signature update; Ticket 004 still owns kind-dispatched construction at `chooseFrontierDecision` plus differentiation/key-parity integration tests.

## What to Change

### 1. Shared interface in `packages/engine/src/agents/policy-agent-inner-preview.ts`

Replace `PolicyAgentChooseOneInnerPreview` with the shared structural interface:

```ts
export interface PolicyAgentInnerPreview {
  readonly run: ChooseOneInnerPreviewRun | ChooseNStepInnerPreviewRun;
  readonly refIds: readonly string[];
  readonly usage: PolicyEvaluationMetadata['previewUsage'];
  readonly byOptionKey: ReadonlyMap<
    string,
    ChooseOneInnerPreviewRun['options'][number] | ChooseNStepInnerPreviewRun['options'][number]
  >;
  readonly refsByOptionKey: ReadonlyMap<string, ReadonlyMap<string, PolicyValue>>;
}
```

The `run` field uses a structural union (no discriminator on the wrapper); `byOptionKey` similarly accepts either option type. Consumers that read `run` directly use the union; those that read only `refsByOptionKey` and `usage` see no semantic difference.

### 2. Refactor `summarizeUsage` and `summarizeReadyRefStats`

Update the parameter types of `summarizeUsage` (lines 125–145) and `summarizeReadyRefStats` (lines 74–123) to accept either `ChooseOneInnerPreviewRun` or `ChooseNStepInnerPreviewRun` — equivalently, the union type. Their bodies access `options[].outcome` and `options[].resolvedRefs`, which exist symmetrically on both runs; no logic change.

### 3. New chooseNStep adapter

```ts
export function createPolicyAgentChooseNStepInnerPreview(
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ResolvedPolicyProfile | null,
): PolicyAgentInnerPreview | undefined {
  if (resolvedProfile === null) return undefined;
  if (input.microturn.kind !== 'chooseNStep') return undefined;
  if (resolvedProfile.profile.preview.inner?.chooseNStep !== true) return undefined;

  const run = runChooseNStepInnerPreview({ /* ... build input from AgentMicroturnDecisionInput + resolvedProfile ... */ });
  const refIds = collectMicroturnPreviewOptionRefs(resolvedProfile.profile.use, /* library */);
  const usage = summarizeUsage(run, refIds);
  const byOptionKey = new Map(run.options.map((option) => [option.stableMoveKey, option] as const));
  const refsByOptionKey = new Map(run.options.map((option) => [option.stableMoveKey, option.resolvedRefs] as const));

  return { run, refIds, usage, byOptionKey, refsByOptionKey };
}
```

### 4. Update existing chooseOne adapter return type

`createPolicyAgentChooseOneInnerPreview` returns `PolicyAgentInnerPreview | undefined` (replacing `PolicyAgentChooseOneInnerPreview | undefined`). The function body is unchanged structurally — the returned object satisfies the union type.

### 5. Remove the obsolete `PolicyAgentChooseOneInnerPreview` symbol

Per F#14, no alias. Remove the symbol; consumers downstream (Ticket 004 updates `policy-agent.ts`) reference `PolicyAgentInnerPreview` directly.

## Files to Touch

- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify — replace `PolicyAgentChooseOneInnerPreview` with shared `PolicyAgentInnerPreview`; refactor helpers; add chooseNStep adapter)
- `packages/engine/src/agents/policy-agent.ts` (modify — type-only consumer rename from `PolicyAgentChooseOneInnerPreview` to `PolicyAgentInnerPreview`; no dispatch behavior change)
- `packages/engine/test/unit/agents/policy-agent-inner-preview.test.ts` (new — focused adapter guard and keyed ADD-map proof)

## Out of Scope

- Dispatch update at `policy-agent.ts:266` — Ticket 004 (consumes the new interface).
- `chooseStructuralFrontierDecision` behavior update — Ticket 004. Its parameter type is renamed here only because the old interface is removed with no alias.
- Differentiation and key-parity tests — Ticket 004.

## Acceptance Criteria

### Tests That Must Pass

1. Existing engine suite: `pnpm -F @ludoforge/engine test`.
2. `pnpm turbo typecheck` — the union type compiles with no consumer breakage.
3. New: invoking `createPolicyAgentChooseNStepInnerPreview` with a profile lacking `preview.inner.chooseNStep: true` returns `undefined`.
4. New: invoking `createPolicyAgentChooseNStepInnerPreview` on a non-chooseNStep microturn returns `undefined`.
5. New: invoking `createPolicyAgentChooseNStepInnerPreview` on a chooseNStep microturn with a profile that opts in returns a `PolicyAgentInnerPreview` whose `byOptionKey` is populated for every legal ADD.

### Invariants

1. (architectural-invariant) `PolicyAgentInnerPreview` has no discriminator field; it is a shared structural interface.
2. `PolicyAgentChooseOneInnerPreview` is removed (F#14 — no alias).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent-inner-preview.test.ts` (modify if it exists, or extend an existing test file) — assert chooseNStep adapter guards return `undefined` correctly; populate `byOptionKey` on opt-in.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-agent-inner-preview.test.js` (or equivalent existing-test path)
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-07. Landed slice:

- `packages/engine/src/agents/policy-agent-inner-preview.ts` replaces the chooseOne-only adapter interface with shared `PolicyAgentInnerPreview`, refactors usage/stat helpers over `ChooseOneInnerPreviewRun | ChooseNStepInnerPreviewRun`, preserves chooseOne behavior, and adds `createPolicyAgentChooseNStepInnerPreview` with null/kind/flag guards.
- `packages/engine/src/agents/policy-agent.ts` performs only the compile-required consumer type rename to `PolicyAgentInnerPreview`; `chooseFrontierDecision` still calls the chooseOne adapter unconditionally and remains Ticket 004's behavior owner.
- `packages/engine/test/unit/agents/policy-agent-inner-preview.test.ts` proves the chooseNStep adapter returns `undefined` when disabled, returns `undefined` on non-chooseNStep microturns, exposes no wrapper discriminator, and populates one `byOptionKey`/`refsByOptionKey` entry per legal ADD when opted in.

Touched-file correction: `policy-agent.ts` and the new focused adapter test are owned fallout from the Foundation 14 no-alias cleanup.

Generated fallout: transient `packages/engine/dist/` only; no schema, golden, or compiled JSON artifact is owned by this ticket.

Deferred sibling scope: Ticket 004 still owns kind dispatch, production behavior integration, differentiation convergence witness, and key-parity invariant. Tickets 005+ retain compiler warning, cost, hidden-info, replay/no-op, golden, audit, cookbook, and manual validation surfaces.

File-size sweep: `policy-agent-inner-preview.ts` is 224 lines, `policy-agent.ts` remains 477 lines, and the new focused test is 291 lines; all are under the repo cap.

Runtime surface breadth: shared agent preview internals only. Production chooseNStep dispatch remains deferred to Ticket 004, so this adapter is not yet routed by `PolicyAgent`.

Command ledger:

- `Test Plan | pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-agent-inner-preview.test.js | run as serial build plus focused compiled test | build passed; focused compiled test passed`
- `Test Plan | pnpm turbo typecheck | run literally | passed`
- `Test Plan | pnpm turbo lint | run literally | passed`
- `Test Plan | pnpm -F @ludoforge/engine test | run literally | passed; default lane summary 65/65 files passed`

Output sequencing: final `dist` consumer proof was rerun after the final engine build, so the focused compiled adapter test consumed fresh output.

Ticket graph integrity: `pnpm run check:ticket-deps` passed for 11 active tickets and 2269 archived tickets.

Late-edit proof validity: terminal status/proof and checker-result transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the green lanes.
