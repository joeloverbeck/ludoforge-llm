# FREEOP-002: Rework free-operation sequence batches for partial implementability

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — turn-flow eligibility, free-operation authorization/discovery, legal-move synthesis, runtime batch state, validation, integration coverage
**Deps**: `tickets/README.md`, `reports/fire-in-the-lake-rules-section-5.md`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/integration/fitl-events-macv.test.ts`, `archive/tickets/FREEOP/FREEOP-001-grant-scoped-operation-locus.md`

## Problem

The current free-operation sequencing model treats earlier steps in a batch as hard blockers even when those steps are not issuable or not usable in the current state. That behavior prevents literal execution of rule 5.1.3 style event text where an event grants an ordered sequence of free Operations or Special Activities but only some of the text is currently implementable.

For Fire in the Lake card 69 ("MACV"), the intended rules outcome is generic and not card-specific: if an earlier faction in an ordered grant pair cannot execute any valid free Special Activity, later ordered grants that still can be implemented must remain issuable. The current runtime does not support that semantics cleanly.

## Assumption Reassessment (2026-03-12)

1. The engine already has a substantial generic free-operation architecture: declarative/event grants, effect-issued grants, `sequence.batch` / `sequence.step`, `completionPolicy`, `viabilityPolicy`, overlap disambiguation, and batch-scoped sequence context. Confirmed in `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, and `packages/engine/src/kernel/free-operation-viability.ts`.
2. The limitation is not grant transport or `grantContext`. It is the readiness/probe model: `isPendingFreeOperationGrantSequenceReady()` and sequence viability probing assume every earlier step remains an unresolved blocker unless consumed. Confirmed in `packages/engine/src/kernel/free-operation-grant-authorization.ts` and `packages/engine/src/kernel/free-operation-viability.ts`.
3. Current FITL data can already express ordered special-activity batches generically, but runtime semantics are too coarse to honor rule 5.1.3 without compromise. Confirmed by the current MACV authoring in `data/games/fire-in-the-lake/41-events/065-096.md` and the regression test added in `packages/engine/test/integration/fitl-events-macv.test.ts`.
4. The right fix is not a MACV-specific exception. The problem is a generic sequencing contract gap for any game whose event text says "do A then B" while also requiring "implement what can".

## Architecture Check

1. The clean fix is to model batch-step lifecycle explicitly rather than inferring it indirectly from "pending grant still exists". Earlier steps need a first-class terminal status such as `consumed`, `skippedUnusableAtIssue`, `skippedUnavailableNow`, or equivalent generic runtime states.
2. This preserves the agnostic boundary: `GameSpecDoc` still authors grant order and viability intent, while the kernel/runtime generically decides which ordered steps are issuable, skipped, consumed, or still pending. No FITL branches belong in `GameDef`, simulator, or kernel.
3. No backwards-compatibility shims should be introduced. Replace the current implicit sequence-readiness semantics with one coherent batch progression contract, then update callers and tests to match.

## What to Change

### 1. Replace implicit sequence readiness with explicit batch progression state

Introduce a generic runtime representation for free-operation sequence batches that records per-step lifecycle and progression decisions. The runtime must be able to distinguish:

- declared but not yet evaluated
- issued and pending
- consumed
- skipped because the step was not usable when issuance was evaluated under its declared policy
- skipped because prior state changes made the step impossible and the sequence may continue

This state must be generic and reusable by both declarative event grants and effect-issued grants.

### 2. Define a precise issuance/skip contract for ordered grants

Document and implement a kernel-level contract for ordered free-operation sequences:

- earlier required steps that are usable must still gate later steps until consumed or otherwise terminal
- earlier steps that are not issuable under their declared viability policy must transition to an explicit skipped terminal state rather than permanently blocking the batch
- later steps become eligible only when every earlier step is terminal, not merely absent from `pendingFreeOperationGrants`
- sequence-context capture/require semantics must remain deterministic when some steps are skipped

Do not special-case FITL or Special Activities.

### 3. Rework discovery, authorization, and legal-move synthesis around batch state

Update:

- `turn-flow-eligibility.ts`
- `free-operation-grant-authorization.ts`
- `free-operation-viability.ts`
- `free-operation-discovery-analysis.ts`
- `legal-moves.ts`
- any apply/consumption path that currently assumes "pending earlier step exists => later step blocked"

The result should be a single, shared progression model used consistently for:

- event play viability checks
- pending grant extraction
- free-operation legal move emission
- post-consumption batch advancement
- ambiguity analysis

### 4. Strengthen validation and contract diagnostics

Add validation and compile-time diagnostics for ambiguous or contradictory sequence contracts under the new model. Examples:

- ordered steps that can never become terminal because of malformed policy combinations
- sequence-context requirements that cannot be satisfied if prerequisite steps are skippable
- mixed issued/implicit ordering that would produce nondeterministic progression

Diagnostics must remain generic and author-facing.

### 5. Add broad regression coverage for partial batch semantics

Extend generic test fixtures to cover:

- earlier step usable, later step blocked until consumption
- earlier step unusable at issue, later step immediately issuable
- earlier step skipped, later step consumed, batch cleared
- effect-issued sequence parity with declarative event sequences
- sequence-context behavior when a prerequisite step is skipped
- no regressions for existing exact-space or execute-as-seat sequence use cases

## Files to Touch

- `tickets/FREEOP-002-partially-implementable-sequence-batches.md` (new)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/types.ts` and/or turn-flow runtime type files (modify)
- `packages/engine/src/kernel/validate-events.ts` and related contract/validation surfaces (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-macv.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-*.test.ts` (modify/add)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Any card-specific workaround in MACV or other FITL cards that bypasses the generic sequencing contract
- UI/visual presentation changes
- Relaxing rule fidelity for "implement what can" cases

## Acceptance Criteria

### Tests That Must Pass

1. A generic declarative batch test proves later steps issue when earlier ordered steps are terminal because they were unusable at issue time.
2. A generic effect-issued batch test proves the same partial-implementability semantics as declarative event grants.
3. MACV runtime coverage proves that the ordered pair can continue when the first seat has no usable Special Activity but the second seat does.
4. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Batch progression is expressed through game-agnostic runtime state and validation rules, not through FITL/card-specific conditions.
2. `GameSpecDoc` remains responsible only for authored grant order/policy; `GameDef` runtime semantics stay generic.
3. Ordered sequences remain deterministic under legal-move discovery, apply-time validation, and grant consumption.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add generic partial-sequence fixtures for declarative and effect-issued grants.
2. `packages/engine/test/integration/fitl-events-macv.test.ts` — extend MACV with the currently missing rule-5.1.3 partial-implementability edge case.
3. `packages/engine/test/unit/kernel/free-operation-viability*.test.ts` — cover skip/terminal-state probing and batch advancement semantics.
4. `packages/engine/test/unit/validate-gamedef.test.ts` — validate new contract diagnostics for malformed sequence policies.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js packages/engine/dist/test/integration/fitl-events-macv.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm run check:ticket-deps`
