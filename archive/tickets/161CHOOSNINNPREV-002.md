# 161CHOOSNINNPREV-002: `runChooseNStepInnerPreview` per-root-option driver

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/`
**Deps**: `archive/tickets/161CHOOSNINNPREV-001.md`

## Problem

Spec 161 closes the gap from Spec 160 where `preview.inner.chooseNStep: true` was a silent no-op. The agent runtime needs a driver that, for each legal root ADD decision at a chooseNStep microturn, applies the ADD to a Spec 146 draft state, runs the existing `runChooseNStepBeamPreview` for `depthCap − 1` continuation steps on the resulting state, and returns the per-root-option `resolvedRefs` so the chooseN microturn evaluator can score each ADD with per-option preview signal.

This driver is the chooseNStep analog of `runChooseOneInnerPreview` — same per-option iteration shape, same outcome resolution, same hidden-info routing — adapted to the chooseNStep beam continuation.

## Assumption Reassessment (2026-05-07)

1. `runChooseNStepBeamPreview` is now in `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (post Ticket 001).
2. `chooseNStepStableMoveKey` produces `chooseNStep:<decisionKey>:<command>:<JSON(value ?? null)>`. For ADD decisions (`command === 'add'`), this matches `scoreContributionsKeyForChooseNStepAdd(request, value)` at `microturn-option-evaluator.ts:42` — the chooseN microturn evaluator's consumption key.
3. `applyPublishedDecision` accepts `advanceToDecisionPoint: true`; `createMutableState` (Spec 146) provides bounded copy-on-write isolation.
4. The chooseN microturn evaluator at `microturn-option-evaluator.ts:154` already consumes `previewOptionResolvedRefsByOptionKey?.get(scoreContributionsKeyForChooseNStepAdd(...))` — wiring is in place; this driver fills the production side.
5. CONFIRM has no per-option scoring path in `microturn-option-evaluator.ts`; the legalization filter excludes it.

## Architecture Check

1. Reuses `runChooseNStepBeamPreview` as a continuation evaluator — no new beam algorithm. Per-root-option wrapper applies the forced ADD, then delegates to the existing beam driver against the post-ADD state with `depthCap − 1`.
2. Engine-agnostic — no game-specific identifiers in the new driver. The per-option scoring signal lives in microturn-scope considerations under each profile's YAML. F#1 honored.
3. Determinism — per-root-option iteration in stable lexicographic order on `chooseNStep:<decisionKey>:add:<JSON(value ?? null)>`. Each per-root-option draft is an independent `createMutableState`. F#8 honored.
4. Immutability — per-root-option drafts are bounded scoped mutation per F#11; no aliasing across drafts.
5. Bounded computation — total work bounded by Phase C's squared-cost formula (delivered in Ticket 006). This ticket asserts the per-microturn count via `evaluatedCandidateCount`.
6. Hidden-info routing — `runChooseNStepBeamPreview`'s existing `resolveBeamResult` already routes through `policy-surface.ts`; the per-root wrapper does not add a parallel resolution path. F#4 honored.

## What to Change

### 1. New driver function in `packages/engine/src/agents/policy-preview-inner-choosenstep.ts`

```ts
export interface RunChooseNStepInnerPreviewInput extends InnerPreviewBaseInput {
  readonly microturn: ChooseNStepMicroturn;
  readonly beamWidth?: number;
}

export interface ChooseNStepInnerPreviewResult {
  readonly decision: ChooseNStepDecision;
  readonly stableMoveKey: string; // chooseNStep:<decisionKey>:add:<JSON(value)>
  readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;
  readonly driveDepth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly previewDrive: PolicyPreviewDriveTrace;
  readonly completionPolicyFallbackCount: number;
  readonly continuationBeam: ChooseNStepBeamPreviewRun | null;
}

export interface ChooseNStepInnerPreviewRun {
  readonly options: readonly ChooseNStepInnerPreviewResult[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
  readonly evaluatedCandidateCount: number;
}

export function runChooseNStepInnerPreview(input: RunChooseNStepInnerPreviewInput): ChooseNStepInnerPreviewRun;
```

### 2. Algorithm

For each legal root ADD decision `D` (lexicographic order on `chooseNStepStableMoveKey(D)`):

1. Set up `seatResolutionIndex` and `surfaceContext` identically to `runChooseNStepBeamPreview`.
2. Snapshot a draft via `createMutableState(input.state)`; apply `D` via `applyPublishedDecision` with `advanceToDecisionPoint: true`; freeze.
3. Inspect the post-ADD microturn:
   - If still inside the same chooseNStep (same `seatId`, `turnId`, `kind: 'chooseNStep'`), invoke `runChooseNStepBeamPreview` with `depthCap = max(0, originalDepthCap − 1)` and the configured `beamWidth`. Take `beam.best.resolvedRefs` as `D`'s `resolvedRefs`. `continuationBeam` captures the full beam run for trace propagation.
   - Otherwise (compound turn advanced), invoke the existing inner-completion path used by `runChooseOneInnerPreview` (`pickInnerDecision` driven by `policyGuided` to `depthCap − 1`). `continuationBeam` is `null`.
4. Outcome resolution mirrors the chooseOne path: hidden-resolved refs propagate `outcome: 'hidden'` and increment `outcomeBreakdown.unknownHidden`.

### 3. Legalization filter

`microturn.legalActions.filter(d => d.kind === 'chooseNStep' && d.command === 'add')`. CONFIRM is excluded.

### 4. `evaluatedCandidateCount`

Sum of `1` (forced root ADD) plus the continuation `evaluatedCandidateCount` (or completion-drive depth) per root drive.

### 5. New unit test `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts`

`architectural-invariant`. Asserts:

- One `ChooseNStepInnerPreviewResult` per legal ADD decision; no entry for CONFIRM.
- Lexicographic iteration order on `stableMoveKey`.
- Per-root drafts are independent: a constructed fixture mutates `state.globals.x` differently under two ADDs; both mutations appear in their respective `resolvedRefs` with no cross-contamination.
- `evaluatedCandidateCount ≤ maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))`.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (modify — add `runChooseNStepInnerPreview` and supporting interfaces)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts` (new — `architectural-invariant`)

## Out of Scope

- Runtime adapter (`createPolicyAgentChooseNStepInnerPreview`) — Ticket 003.
- Dispatch in `chooseFrontierDecision` — Ticket 004.
- Cost-formula compile-time validation — Ticket 006.
- All Phase D tests other than the per-option iteration test — Tickets 007–011.

## Acceptance Criteria

### Tests That Must Pass

1. New: per-root-option iteration produces one `ChooseNStepInnerPreviewResult` per legal ADD decision.
2. New: CONFIRM is excluded from per-option entries.
3. New: per-root drafts are independent (no aliasing).
4. New: lexicographic iteration order on `stableMoveKey`.
5. New: `evaluatedCandidateCount` respects the squared-cost upper bound.
6. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) For each legal ADD `D` at a chooseNStep microturn, exactly one preview drive runs.
2. (architectural-invariant) Each per-root-option draft state is fully isolated from caller-visible state (Spec 146 contract preserved).
3. (architectural-invariant) Per-root iteration order is deterministic — lexicographic on `stableMoveKey`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts` (new) — `architectural-invariant`. Per-root-option iteration, deterministic ordering, draft-state isolation, `evaluatedCandidateCount` bound.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-07. The implemented slice adds `runChooseNStepInnerPreview` to `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` and adds the focused architectural unit test `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts`.

Touched-file scope:

- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` — done; adds the per-root ADD driver, exported result/input interfaces, deterministic stable-key ordering, continuation beam delegation with `depthCap - 1`, completion-drive fallback for confirm-only/advanced continuations, outcome/ref resolution, and `evaluatedCandidateCount` bookkeeping.
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts` — done; covers one result per ADD, no CONFIRM entry, lexicographic stable-key order, independent draft outcomes through post-confirm global score refs, and the squared-cost upper-bound assertion.
- `specs/161-choosenstep-inner-preview-integration.md` — owned closeout fallout; Phase A MVP checkbox updated because ticket 001 already completed extraction and this ticket completes the driver/test half.

Deferred sibling scope remains unchanged: runtime adapter/interface (`archive/tickets/161CHOOSNINNPREV-003.md`), dispatch/differentiation/key parity (`tickets/161CHOOSNINNPREV-004.md`), warning parity (`tickets/161CHOOSNINNPREV-005.md`), cost formula/diagnostic rename (`tickets/161CHOOSNINNPREV-006.md`), and later Phase D proof/doc/manual validation tickets stay active.

Generated fallout: transient `packages/engine/dist/` output only; no schema, golden, or compiled JSON artifact is owned by this ticket.

Command ledger:

- `Test Plan | pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.js | split into serial build plus focused compiled test | build passed; focused compiled test passed after the later typecheck build refreshed dist`
- `Test Plan | pnpm turbo typecheck | run literally | passed`
- `Test Plan | pnpm turbo lint | run literally | passed`
- `Test Plan | pnpm -F @ludoforge/engine test | run literally | passed; default lane summary `65/65 files passed``

Additional acceptance sweep:

- File size: `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` is 591 lines and the new unit test is 277 lines; both are under the repo cap.
- Runtime surface breadth: shared agent preview internals only. Production chooseNStep adapter/dispatch remains deferred to tickets 003 and 004, so this driver is not yet production-routed by `PolicyAgent`.
- Output sequencing: final `dist` consumer proof was rerun after `pnpm turbo typecheck` rebuilt `packages/engine/dist`.
- Ticket graph integrity: `pnpm run check:ticket-deps` passed for 12 active tickets and 2268 archived tickets.
- Late-edit proof validity: terminal status/proof transcription plus dependency-check result transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the green lanes.
