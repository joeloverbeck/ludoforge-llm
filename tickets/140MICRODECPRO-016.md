# 140MICRODECPRO-016: D8c — Retire legacy template-completion policy diagnostics and finish the stale Spec 139 replay migration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — narrows exported policy trace/schema surface and updates adjacent tests
**Deps**: `archive/tickets/140MICRODECPRO-012.md`

## Problem

Post-ticket review of ticket 012 found that one slice of the public legacy decision/completion story still survives in exported diagnostics rather than the main legality/agent contract:

- `packages/engine/src/kernel/types-core.ts` still exports `PolicyMovePreparationTrace` fields `templateCompletionAttempts`, `templateCompletionOutcome`, and `templateCompletionSource`, plus `PolicyCompletionStatistics.templateCompletion*` counters.
- `packages/engine/src/kernel/schemas-core.ts` still validates the same retired template-completion diagnostics surface.
- `packages/engine/test/determinism/spec-139-replay-identity.test.ts` still proves the old certificate-fallback/template-completion narrative instead of the microturn-native contract.
- Adjacent diagnostics tests (`packages/engine/test/unit/agents/policy-diagnostics.test.ts`, `packages/engine/test/unit/json-schema.test.ts`) still encode those retired fields.

Ticket 012 correctly removed the public legality/runtime certificate surface, but these diagnostics artifacts still expose the retired migration vocabulary and therefore leave the public trace/schema boundary less clean than the finished series intends.

## Assumption Reassessment (2026-04-21)

1. The exported policy diagnostics types still contain template-completion fields after ticket 012: `PolicyMovePreparationTrace` in `packages/engine/src/kernel/types-core.ts` and the matching Zod schema in `packages/engine/src/kernel/schemas-core.ts`.
2. `packages/engine/test/determinism/spec-139-replay-identity.test.ts` still imports `PolicyMovePreparationTrace` and asserts `templateCompletionSource === 'certificateFallback'` plus `templateCompletionAttempts`, so the named regression migration from ticket 012 did not fully land.
3. The remaining active tickets do not currently own this source-level cleanup. Ticket 014 is a larger test-wave/audit ticket; ticket 015 is the separate `move-decision-sequence.ts` authority rewrite. Without a new ticket, this remainder would be orphaned.

## Architecture Check

1. This boundary is narrower and cleaner than reopening ticket 012 after review: it owns one concrete residual public surface plus the directly adjacent stale tests.
2. F14/F15 compliant: the repo should not keep public trace/schema vocabulary for retired template-completion/certificate-fallback machinery once the live agent/runtime protocol is microturn-native.
3. The work avoids overlap with ticket 015 because it does not change the retained `move-decision-sequence.ts` authority seam; it only removes legacy diagnostics/reporting language and migrates the stale replay regression.

## What to Change

### 1. Narrow exported policy diagnostics types

Remove the retired template-completion/certificate-fallback fields from the exported policy diagnostics surface in `packages/engine/src/kernel/types-core.ts`, including:

- `PolicyMovePreparationTrace.templateCompletionAttempts`
- `PolicyMovePreparationTrace.templateCompletionOutcome`
- `PolicyMovePreparationTrace.templateCompletionSource`
- `PolicyCompletionStatistics.templateCompletionAttempts`
- `PolicyCompletionStatistics.templateCompletionSuccesses`
- `PolicyCompletionStatistics.templateCompletionStructuralFailures`

Retain only diagnostics fields that still describe truthful microturn-native candidate preparation / rejection behavior.

### 2. Narrow policy diagnostics schemas and builders

Update the matching schema/serialization path and any diagnostics builders or evaluation metadata shaping so they no longer emit or expect the retired fields:

- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/agents/policy-eval.ts`
- `packages/engine/src/agents/policy-diagnostics.ts`

If a slimmer replacement summary is still useful, keep only the narrowest truthful metric names and record that boundary in the ticket outcome.

### 3. Finish the stale replay regression migration

Rewrite `packages/engine/test/determinism/spec-139-replay-identity.test.ts` so it proves the microturn-native deterministic contract rather than certificate-fallback/template-completion behavior.

Update adjacent diagnostics/schema tests that currently encode the retired fields:

- `packages/engine/test/unit/agents/policy-diagnostics.test.ts`
- `packages/engine/test/unit/json-schema.test.ts`

Additional direct fallout tests that still prove the retired diagnostics vocabulary are in scope.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/test/determinism/spec-139-replay-identity.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-diagnostics.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)

## Out of Scope

- Replacing `move-decision-sequence.ts` as the remaining internal authority seam — ticket 015.
- Brand-new microturn test wave T1–T15 — ticket 014.
- FOUNDATIONS/doc updates — ticket 013.

## Acceptance Criteria

### Tests That Must Pass

1. `rg -n "templateCompletionAttempts|templateCompletionOutcome|templateCompletionSource|certificateFallback" packages/engine/src packages/engine/test` returns zero hits outside archived tickets or explicitly documented historical comments.
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/determinism/spec-139-replay-identity.test.js`
4. `pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/unit/agents/policy-diagnostics.test.js`
5. `pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/unit/json-schema.test.js`

### Invariants

1. No exported policy trace/schema contract names retired template-completion or certificate-fallback machinery after this ticket.
2. `spec-139-replay-identity.test.ts` proves deterministic microturn-era behavior only; it does not assert a legacy certificate/template fallback path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/spec-139-replay-identity.test.ts` — remove retired template-completion/certificate-fallback assertions and replace them with microturn-native deterministic invariants.
2. `packages/engine/test/unit/agents/policy-diagnostics.test.ts` — update diagnostics expectations to the narrowed trace shape.
3. `packages/engine/test/unit/json-schema.test.ts` — update schema fixture coverage for the narrowed trace shape.

### Commands

1. `rg -n "templateCompletionAttempts|templateCompletionOutcome|templateCompletionSource|certificateFallback" packages/engine/src packages/engine/test`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/determinism/spec-139-replay-identity.test.js`
4. `pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/unit/agents/policy-diagnostics.test.js`
5. `pnpm -F @ludoforge/engine exec node --test packages/engine/dist/test/unit/json-schema.test.js`
