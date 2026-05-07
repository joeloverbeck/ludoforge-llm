# 160PEROPTPREV-007: Trace integration + replay-identity + no-op-default tests

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-agent.ts`, `agents/policy-agent-inner-preview.ts`, `agents/policy-preview-inner.ts`
**Deps**: `archive/tickets/160PEROPTPREV-001.md`, `archive/tickets/160PEROPTPREV-003.md`, `archive/tickets/160PEROPTPREV-005.md`

## Problem

Phase C of Spec 160. With the chooseOne driver landed (ticket 005), `chooseFrontierDecision` should populate `previewUsage` with the same shape action-selection uses today (Spec 156): `mode`, `evaluatedCandidateCount`, `refIds`, `outcomeBreakdown`, `readyRefStats`, `utility`. Today, `chooseFrontierDecision` unconditionally hardcodes `previewUsage: emptyPreviewUsage()` — preview is structurally invisible at inner microturns. Synthetic-decision trace propagation must also carry per-option drives.

This ticket lands the integration plus two determinism tests: replay-identity (two runs with `preview.inner.chooseOne: true` produce byte-identical inner-microturn previewUsage and synthetic-decision arrays) and no-op-default (default-off `preview.inner` produces byte-identical traces compared to the pre-Spec-160 baseline).

## Assumption Reassessment (2026-05-06)

1. Ticket 001 has consolidated `emptyPreviewUsage` to a single exported helper in `policy-eval.ts` taking `AgentPreviewMode`; `policy-agent.ts` imports it.
2. Ticket 003 has compiled the `preview.inner.chooseOne` config flag — runtime can read `compiledProfile.preview.inner?.chooseOne`.
3. Ticket 005 has exposed an entry point on `policy-preview-inner.ts` callable from the agent.
4. Action-selection's `previewUsage` schema is generic (Spec 156); reusing the same shape at inner microturns requires no schema work — only payload population.
5. Synthetic-decision trace today carries action-selection drives; per-option drives use the same shape with an inner-microturn marker.

## Implementation Reassessment (2026-05-07)

- Live prerequisite check: tickets 001/003/005/006 are archived and the chooseOne driver/ref/config substrate is present.
- Boundary correction: trace propagation requires a small extension to `packages/engine/src/agents/policy-preview-inner.ts` so the driver returns per-option `previewDrive` and fallback-count data; `packages/engine/src/agents/policy-agent-inner-preview.ts` is an owned helper extraction to keep `policy-agent.ts` below the 800-line cap after adding previewUsage summarization.
- Test fixture correction: the no-op default baseline is generated from the same synthetic fixture with explicit `preview.inner.chooseOne: false`, matching the ticket's allowed "generated from a flag-disabled run" shape.
- Deferred sibling scope: compile-time warning remains ticket 008; FITL canary golden remains ticket 009; cookbook documentation remains ticket 010.

## Architecture Check

1. **Decision-granularity uniformity** (Foundation 19): preview at inner microturns now has the same trace shape as preview at action-selection — the structural asymmetry called out in spec motivation is resolved.
2. **Replay, telemetry, auditability** (Foundation 9): per-option drives are first-class trace events; replay is byte-deterministic.
3. **Determinism** (Foundation 8): default-off invariant ensures pre-Spec-160 traces round-trip exactly; no silent regression for existing profiles.

## What to Change

### 1. Replace hardcoded `emptyPreviewUsage()` in `chooseFrontierDecision`

In `packages/engine/src/agents/policy-agent.ts:266` (and the call at `chooseStructuralFrontierDecision:122`), replace the hardcoded `emptyPreviewUsage()` with conditional population:

- When `compiledProfile.preview.inner?.chooseOne === true` AND `input.microturn.kind === 'chooseOne'`: invoke the chooseOne driver from ticket 005, collect per-option resolved-refs and synthetic-decision trace entries, and populate `previewUsage` with `mode: 'exactWorld'` (or the appropriate mode), `evaluatedCandidateCount`, `refIds`, `outcomeBreakdown`, `readyRefStats`, `utility`.
- Otherwise: call `emptyPreviewUsage('disabled')` (the consolidated import from ticket 001).

### 2. Synthetic-decision trace propagation

Per-option drives produce synthetic-decision trace entries that propagate up alongside the existing action-selection synthetic-decision trace. The trace shape is the same; an inner-microturn marker distinguishes the source.

### 3. Replay-identity test

`packages/engine/test/determinism/spec-160-inner-preview-replay-identity.test.ts` — same GameDef + seed + actions twice with `preview.inner.chooseOne: true` produces byte-identical inner-microturn `previewUsage` and synthetic-decision arrays. Convention precedent: `spec-159-replay-identity.test.ts`.

### 4. No-op-default test

`packages/engine/test/determinism/spec-160-inner-preview-no-op-default.test.ts` — profiles with default `preview.inner` (both flags `false`) produce byte-identical inner-microturn trace as pre-Spec-160 baseline. The pre-Spec-160 baseline is captured as a checked-in fixture or generated from a flag-disabled run.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify — `chooseFrontierDecision` populates `previewUsage` when inner preview is enabled; uses consolidated `emptyPreviewUsage` from ticket 001)
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (new — agent-local collection/summarization helper for chooseOne inner preview trace data)
- `packages/engine/src/agents/policy-preview-inner.ts` (modify — owned trace-propagation fallout; exposes preview-option ref keys and per-option preview-drive metadata)
- `packages/engine/test/helpers/spec-160-inner-preview-fixture.ts` (new — shared synthetic fixture for the two determinism witnesses)
- `packages/engine/test/determinism/spec-160-inner-preview-replay-identity.test.ts` (new)
- `packages/engine/test/determinism/spec-160-inner-preview-no-op-default.test.ts` (new)

## Out of Scope

- chooseN beam trace propagation — covered structurally by ticket 006's beam pruning trace; this ticket integrates only the chooseOne path. (chooseNStep integration follows the same pattern; ticket 006's pruning trace records propagate via the same mechanism here.)
- Schema parity validation via Ajv — the schema is generic; existing parity holds.
- Compile-time warning — ticket 008.

## Acceptance Criteria

### Tests That Must Pass

1. New (replay-identity): two runs with `preview.inner.chooseOne: true` produce byte-identical inner-microturn `previewUsage` and synthetic-decision arrays.
2. New (no-op-default): existing profiles with default `preview.inner` (off) produce byte-identical traces compared to pre-Spec-160 baseline.
3. New: inner-microturn `previewUsage` matches action-selection schema parity (Ajv validation if schema is centralized; otherwise structural equality).
4. Existing `pnpm -F @ludoforge/engine test:determinism`.
5. Existing `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) Profiles with default `preview.inner` (both flags `false`) produce byte-identical inner-microturn trace as pre-Spec-160 (no-op-by-default).
2. (architectural-invariant) Inner-microturn `previewUsage` shape parity with action-selection's `previewUsage` (Spec 156).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/spec-160-inner-preview-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over inner trace.
2. `packages/engine/test/determinism/spec-160-inner-preview-no-op-default.test.ts` (new) — `architectural-invariant`. Default-off invariant.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm turbo typecheck`
4. `pnpm -F @ludoforge/engine test`

## Outcome (2026-05-07)

- Landed boundary: `PolicyAgent.chooseFrontierDecision` now runs the chooseOne inner-preview driver when `preview.inner.chooseOne` is enabled, passes per-option resolved refs into the microturn scorer, and records inner `previewUsage` with mode, evaluated candidate count, ref ids, ready-ref stats, utility, outcome breakdown, and fallback counts.
- Trace propagation: per-option chooseOne driver results now carry `previewDrive.syntheticDecisions` using the existing action-selection trace shape, and verbose policy traces attach those drives to the corresponding inner candidates.
- Default-off invariant: the default/explicit-off path still uses `emptyPreviewUsage('disabled')`; no driver metadata is attached.
- Schema/artifact fallout: none expected; the existing `previewUsage` schema shape is reused without source schema changes.
- Source file size ledger: `policy-agent.ts` was already above the typical 200-400 line band and remains under the 800-line cap after extraction; `policy-preview-inner.ts` remains under the 800-line cap but above typical, with extraction deferred because the added fields belong to the existing driver result seam. Residual owner: none unless future Spec 160 work grows either file further.
- Verification:
  - `pnpm -F @ludoforge/engine build` — passed.
  - `pnpm -F @ludoforge/engine test:determinism` — passed, 20/20 files.
  - `pnpm turbo typecheck` — passed, 3/3 tasks.
  - `pnpm -F @ludoforge/engine test` — passed, schema artifact check plus default lane, 64/64 files; unit glob reported 5555 passing tests.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-160-inner-preview-replay-identity.test.js dist/test/determinism/spec-160-inner-preview-no-op-default.test.js dist/test/unit/agents/policy-preview-inner-chooseone.test.js dist/test/unit/agents/policy-preview-inner-hidden-info.test.js dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js` — passed after the final broad output-producing lane, 5 suites / 6 tests.
- Post-review readiness: status/header wording was normalized for archival; no runtime, test, schema, acceptance, command, dependency, or touched-file boundary changed.
- Proof validity: after the final proof commands, only terminal status, header wording, and proof ledger text were edited; no implementation, scope, acceptance, command, dependency, or touched-file changes were made that invalidate the proof.
