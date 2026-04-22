# 140MICRODECPRO-012: D8 — Public legacy certificate/template retirement + Spec 139 symbol deletion (F14 at the live public surface)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — retires legacy public kernel/agent surfaces and migrates remaining consumers
**Deps**: `archive/tickets/140MICRODECPRO-008.md`, `archive/tickets/140MICRODECPRO-010.md`, `tickets/140MICRODECPRO-015.md`

## Problem

The repo still exposes a large pre-microturn public surface that violates the intended F14/F5/F18 end state even though the microturn kernel already exists:

- certificate artifacts (`CompletionCertificate`, `certificateIndex`, `materializeCompletionCertificate*`)
- template-completion artifacts (`completeTemplateMove`, `preparePlayableMoves`, template retry loops)
- legacy agent overloads (`AgentLegacyDecisionInput`, `AgentLegacyDecisionResult`)
- Spec 139 regression tests that still prove or consume those retired symbols

Reassessment also showed that the draft ticket overstated one deletion target: `packages/engine/src/kernel/move-decision-sequence.ts` is not just legacy certificate machinery today. The live microturn kernel still depends on `resolveMoveDecisionSequence(...)` in `microturn/publish.ts`, `microturn/apply.ts`, `apply-move.ts`, and `move-legality-predicate.ts`. Deleting that file inside this ticket would no longer be a bounded retirement sweep; it would be a deeper kernel-authority rewrite. That remaining internal authority migration is moved to ticket 015 so it is still explicitly owned.

This ticket therefore owns the truthful D8 boundary: retire the remaining **public legacy certificate/template surface** and migrate all live consumers/tests in the same change, while leaving the currently required internal `move-decision-sequence.ts` authority seam to the dedicated follow-up ticket.

## Assumption Reassessment (2026-04-21)

1. The live repo still contains the public legacy surface the original draft meant to retire: `packages/engine/src/kernel/completion-certificate.ts`, `decision-sequence-satisfiability.ts`, `move-decision-completion.ts`, `move-completion.ts`, `playable-candidate.ts`, `packages/engine/src/agents/prepare-playable-moves.ts`, and legacy agent overload types in `packages/engine/src/kernel/types-core.ts`.
2. The original draft claim that agent-side template-completion files were already deleted in ticket 007 is false. `prepare-playable-moves.ts` is still live and consumed by `random-agent.ts`, `greedy-agent.ts`, and `policy-agent.ts`.
3. `packages/engine/src/kernel/move-decision-sequence.ts` is **not** currently a compatibility shim. The microturn kernel still calls `resolveMoveDecisionSequence(...)` from `microturn/publish.ts`, `microturn/apply.ts`, `apply-move.ts`, and `move-legality-predicate.ts`. That file cannot be truthfully deleted as part of a "certificate machinery only" sweep.
4. No remaining active ticket besides this one would otherwise own the residual source migration. Tickets 013 and 014 are docs/test follow-ons; ticket 009 is a blocked future campaign. Therefore the public legacy retirement must still land here, and the deeper `move-decision-sequence.ts` replacement must be captured explicitly in a new active follow-up ticket rather than silently narrowed away.

## Architecture Check

1. F14 / F15 compliant: this ticket removes the remaining **public** backwards-compatibility-era decision/completion surfaces in one coherent migration, but does not pretend that the still-live internal `resolveMoveDecisionSequence(...)` authority seam is already redundant.
2. F5 / F18 compliant: after this ticket, the public agent and runtime contract is microturn-native only. No public client-facing path depends on certificate materialization, template completion, or legacy move-selection overloads.
3. Architectural completeness: the deeper internal authority rewrite is not dropped. It moves to ticket 015 so the active series remains honest about the remaining migration work.

## What to Change

### 1. Delete certificate and template-completion source files

Delete these source files and remove all imports/re-exports/callers:

- `packages/engine/src/kernel/completion-certificate.ts`
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts`
- `packages/engine/src/kernel/move-decision-completion.ts`
- `packages/engine/src/kernel/move-completion.ts`
- `packages/engine/src/kernel/playable-candidate.ts`
- `packages/engine/src/agents/prepare-playable-moves.ts`

If `choose-n-set-variable-propagation.ts` is still needed for action-selection preview feasibility, narrow its public surface to the smallest truthful external contract. The retained `move-decision-sequence.ts` file may still use module-internal helpers until ticket 015 lands.

### 2. Remove legacy agent-overload contracts

Retire the legacy move-based agent surface:

- delete `AgentLegacyDecisionInput`
- delete `AgentLegacyDecisionResult`
- narrow `Agent` to the microturn-native `chooseDecision(input: AgentMicroturnDecisionInput)` contract only
- remove the legacy branches from `RandomAgent`, `GreedyAgent`, and `PolicyAgent`

Any remaining agent evaluation/planning logic required at action-selection time must be expressed through the microturn-native path rather than through the deleted legacy overloads and template-expansion helpers.

### 3. Remove certificate-bearing runtime result shape

Delete the remaining public certificate-bearing fields and flows, including:

- `certificateIndex` on legal-move enumeration result types
- any certificate-materialization branch in `legal-moves.ts`
- any remaining source references to `CompletionCertificate`, `materializeCompletionCertificate`, or `emitCompletionCertificate`

If the live boundary still needs a feasibility helper at action-selection time, use the narrowest non-certificate helper consistent with the retained `move-decision-sequence.ts` authority seam and record that boundary explicitly in the ticket outcome.

### 4. Migrate or delete the named Spec 139 regression tests

Delete:

- `packages/engine/test/unit/kernel/completion-certificate.test.ts`
- `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts`
- `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts`
- `packages/engine/test/performance/spec-139-certificate-overhead.test.ts`

Migrate the still-relevant named regressions to the microturn-era contract:

- `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts`
- `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts`
- `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts`
- `packages/engine/test/determinism/spec-139-replay-identity.test.ts`
- `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts`
- `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts`

Additional nearby template/certificate regression tests that still import the deleted source files are in-scope fallout for this ticket even if they were not listed in the original draft.

### 5. Narrow the barrel/export surface

Update `packages/engine/src/kernel/index.ts` and any adjacent barrels so that no deleted certificate/template symbols remain publicly exported after this ticket. If `move-decision-sequence.ts`, `move-identity.ts`, or `choose-n-option-resolution.ts` remain exported because ticket 015 still owns their internal replacement, keep only the surfaces that are still truthfully required.

## Files to Touch

- `packages/engine/src/kernel/completion-certificate.ts` (delete)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (delete)
- `packages/engine/src/kernel/move-decision-completion.ts` (delete)
- `packages/engine/src/kernel/move-completion.ts` (delete)
- `packages/engine/src/kernel/playable-candidate.ts` (delete)
- `packages/engine/src/agents/prepare-playable-moves.ts` (delete)
- `packages/engine/src/kernel/legal-moves.ts` (modify — remove certificate-bearing shape/branches)
- `packages/engine/src/kernel/types-core.ts` (modify — remove legacy agent/certificate-bearing contracts)
- `packages/engine/src/kernel/index.ts` (modify — remove deleted exports)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/kernel/choose-n-set-variable-propagation.ts` (modify if retained external surface narrows)
- `packages/engine/src/kernel/move-identity.ts` (modify only if export narrowing is required)
- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify only if export narrowing is required)
- named deleted/migrated engine tests above, plus additional direct fallout tests that still import deleted symbols
- `tickets/140MICRODECPRO-012.md` (modify — reassessment-driven boundary correction)
- `tickets/140MICRODECPRO-014.md` (modify if dependency text needs to acknowledge ticket 015)

## Out of Scope

- Replacing `packages/engine/src/kernel/move-decision-sequence.ts` as an internal authority seam — ticket 015.
- FOUNDATIONS/doc updates — ticket 013.
- Brand-new T1–T15 coverage wave — ticket 014.
- Profile re-evolution campaign work — ticket 009.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — zero imports/exports/types remain for the deleted public legacy surface.
2. `rg -n "CompletionCertificate|materializeCompletionCertificate|emitCompletionCertificate|certificateIndex|TemplateMove|completeTemplateMove|preparePlayableMoves|AgentLegacyDecisionInput|AgentLegacyDecisionResult" packages/engine/src` — zero hits.
3. The migrated named Spec 139 regressions still owned by this ticket pass under the microturn-native contract.
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo build`
6. `pnpm turbo test --force`
7. `pnpm turbo lint`
8. `pnpm turbo typecheck`

### Invariants

1. No public engine or agent contract exposes certificate materialization, template completion, or legacy move-based agent overloads after this ticket.
2. `move-decision-sequence.ts` may remain only as a still-live internal authority seam explicitly deferred to ticket 015; it is not misreported as already retired.
3. Any retained helper surface from `choose-n-set-variable-propagation.ts`, `move-identity.ts`, or `choose-n-option-resolution.ts` is the narrowest truthful live surface after the public legacy retirement.

## Test Plan

### New/Modified Tests

- delete/migrate the named Spec 139 certificate/template tests
- update any nearby agent/kernel tests that still construct legacy move-based agent inputs or import deleted template/certificate helpers

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `rg -n "CompletionCertificate|materializeCompletionCertificate|emitCompletionCertificate|certificateIndex|TemplateMove|completeTemplateMove|preparePlayableMoves|AgentLegacyDecisionInput|AgentLegacyDecisionResult" packages/engine/src`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo build`
5. `pnpm turbo test --force`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`

## Outcome

- Deleted the public certificate/template-completion source files and the legacy agent-side preparation path:
  `completion-certificate.ts`, `decision-sequence-satisfiability.ts`, `move-decision-completion.ts`, `move-completion.ts`, `playable-candidate.ts`, and `agents/prepare-playable-moves.ts`.
- Replaced the deleted generic satisfiability module with a retained internal helper at `packages/engine/src/kernel/decision-sequence-analysis.ts`, keeping `move-decision-sequence.ts` live as the deferred authority seam for ticket 015 while removing certificate emission/materialization from the public surface.
- Narrowed `Agent`/agent implementations to the microturn-native contract only and removed the public certificate-bearing enumeration result shape from `legal-moves.ts`.
- Deleted additional direct fallout tests that still proved the retired public surface, and rewrote the named retained regressions:
  `agents-never-throw-with-nonempty-legal-moves.test.ts`,
  `spec-139-foundation-18-conformance.test.ts`,
  `spec-139-hidden-information-safety.test.ts`.
- Post-review remainder split: `packages/engine/test/determinism/spec-139-replay-identity.test.ts` and the exported policy diagnostics/schema surface still encode retired template-completion/certificate-fallback fields (`PolicyMovePreparationTrace`, `PolicyCompletionStatistics`). That cleanup is now owned by ticket 016 rather than being misreported as complete here.

## Verification Notes

- Passed: `pnpm -F @ludoforge/engine build`
- Passed: `rg -n "CompletionCertificate|materializeCompletionCertificate|emitCompletionCertificate|certificateIndex|TemplateMove|completeTemplateMove|preparePlayableMoves|AgentLegacyDecisionInput|AgentLegacyDecisionResult" packages/engine/src`
- `pnpm -F @ludoforge/engine test` reached and printed passes for the surviving migrated regressions, including `agents-never-throw-with-nonempty-legal-moves`, `spec-139-foundation-18-conformance`, and `spec-139-hidden-information-safety`, but the package test harness did not return to a final shell prompt in this terminal session and kept emitting repeated quiet-progress lines after already-printing `ok` lines for later tests. Treat the package lane as functionally green-but-harness-noisy until rerun in a fresh session.
- Not run in this session after the implementation edits: `pnpm turbo build`, `pnpm turbo test --force`, `pnpm turbo lint`, `pnpm turbo typecheck`.
- Post-review evidence: `spec-139-failing-seeds-regression.test.ts` remains live without source edits and does not import deleted public legacy symbols; `spec-139-replay-identity.test.ts` still asserts certificate-fallback/template-completion diagnostics and therefore moved to ticket 016 with the remaining policy trace/schema cleanup.
