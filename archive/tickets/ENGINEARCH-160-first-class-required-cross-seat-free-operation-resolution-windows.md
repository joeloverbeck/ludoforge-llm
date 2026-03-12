# ENGINEARCH-160: Promote Remaining Cross-Seat Required Free-Operation Authoring to the Existing Runtime Contract

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Maybe — ticket starts with production-data/test alignment against the existing runtime; touch kernel code only if production Lam Son or a missing parity case exposes a real bug
**Deps**: `tickets/README.md`, `archive/tickets/ENG-223-resume-card-flow-after-required-grant-resolution.md`, `archive/tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md`, `packages/engine/src/kernel/effects-turn-flow.ts`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/kernel/apply-move.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/integration/fitl-events-lam-son-719.test.ts`, `data/games/fire-in-the-lake/41-events/065-096.md`

## Problem

This ticket was opened under the assumption that the kernel still lacked a generic runtime contract for "another seat must now immediately resolve this required free operation, then turn flow resumes deterministically." That assumption is no longer correct. ENG-223 and ENG-224 already established a shared runtime contract for required grant windows, overlap handling, and post-resolution resume.

The remaining mismatch is narrower: some production/event authoring and production-facing tests still behave as if the old limitation exists. In particular, Lam Son 719 currently encodes a cross-seat, target-bound effect grant without opting into the existing required/completion contract, and the production regression test manually forces the grant-ready state instead of asserting the real immediate handoff behavior. The ticket should repair that drift first, and only change kernel code if the production scenario exposes a concrete parity bug between effect-issued and declarative grants.

## Assumption Reassessment (2026-03-12)

1. Required free-operation windows already exist in the generic runtime. `packages/engine/src/kernel/turn-flow-eligibility.ts` derives temporary obligation candidates via `withRequiredGrantCandidates(...)`, `packages/engine/src/kernel/legal-moves.ts` suppresses unrelated moves during the window, and `packages/engine/src/kernel/apply-move.ts` rejoins canonical card progression after required resolution when `postResolutionTurnFlow: 'resumeCardFlow'` is present.
2. Effect-issued grants are not on a separate architectural path. `applyGrantFreeOperation(...)` in `packages/engine/src/kernel/effects-turn-flow.ts` issues the same pending-grant contract shape used by declarative event metadata; required-window behavior is determined downstream by shared turn-flow/runtime code, not by per-source branching.
3. Current Lam Son 719 production authoring in `data/games/fire-in-the-lake/41-events/065-096.md` still omits the explicit required/completion contract on its ARVN LimOp grant, and `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` compensates by manually forcing a grant-ready state. That is now the primary discrepancy.
4. Existing regression coverage is broader than the ticket assumed. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/unit/kernel/legal-moves.test.ts`, and `packages/engine/test/unit/kernel/apply-move.test.ts` already cover required grant windows, cross-seat resume, overlap strength, and execution-context legality. The missing hard regression is production Lam Son parity, plus an effect-issued target-bound required cross-seat case if current coverage still does not pin it directly.

## Architecture Check

1. A second explicit runtime substate/window abstraction is not currently more beneficial than the architecture already in place. The existing design keeps the durable source of truth in canonical card runtime plus pending grants, then derives the temporary required window from that state. Adding another first-class substate now would duplicate responsibility and likely make resume logic harder to reason about.
2. The right architectural move is to keep the kernel generic and push remaining rule-faithful intent into grant contracts in `GameSpecDoc`/YAML: viability, completion, outcome, and post-resolution turn-flow should be declared in data and interpreted by the existing shared runtime.
3. No backwards-compatibility aliasing should be added. If Lam Son or an uncovered effect-issued parity case needs required immediate handoff semantics, it should use the canonical required-grant contract directly.

## What to Change

### 1. Promote Lam Son 719 to the existing required-grant contract

Update Lam Son 719’s ARVN LimOp grant authoring so it declares the existing generic runtime contract explicitly:
- require immediate resolution by the granted seat
- require deterministic resume of enclosing card flow after success
- require the grant to be emitted only when a usable targeted LimOp exists, if needed to preserve current rule-faithful behavior

### 2. Replace production-test workarounds with real runtime assertions

Update the Lam Son integration test so it asserts the real post-event state instead of manually forcing a grant-ready window:
- ARVN becomes the active/granted seat immediately after the event
- only the granted free LimOp surface is available during the required window
- the selected-space targeting contract remains intact
- turn flow resumes normally after resolution

### 3. Add or strengthen parity coverage only where it is still missing

If current coverage does not directly pin it, add one focused regression for an effect-issued, target-bound, required cross-seat grant to prove the issuance source does not matter once the shared runtime contract takes over.

### 4. Touch kernel code only if the narrowed regression exposes a real bug

Do not preemptively refactor runtime state. If Lam Son authoring or the new hard regression reveals a concrete mismatch in effect-issued parity, fix that narrowly in shared kernel code.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify only if effect-issued parity bug is real)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify only if effect-issued parity bug is real)
- `packages/engine/src/kernel/legal-moves.ts` (modify only if effect-issued parity bug is real)
- `packages/engine/src/kernel/apply-move.ts` (modify only if effect-issued parity bug is real)

## Out of Scope

- Adding a new parallel runtime abstraction for required grant windows
- FITL-only branching in kernel code
- Visual-config changes or presentation behavior
- Broader free-operation contract redesign beyond aligning production authoring/tests with the current architecture

## Acceptance Criteria

### Tests That Must Pass

1. Lam Son 719 uses the canonical required-grant contract instead of a production-side workaround, and the production integration test asserts immediate ARVN handoff plus correct resume semantics without mutating runtime state manually.
2. A target-bound required cross-seat grant behaves the same whether issued declaratively or from `grantFreeOperation` effects.
3. No new runtime alias/substate is introduced unless a narrowed parity bug proves it is unavoidable.
4. Existing suite: `node --test packages/engine/dist/test/integration/fitl-events-lam-son-719.test.js`
5. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
6. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
7. Existing suite: `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Required free-operation handoff/resume semantics remain represented by one existing game-agnostic runtime contract.
2. Production authoring must use the canonical contract instead of test-side or data-side workarounds.
3. No FITL/card identifiers or title-specific branches are introduced in runtime or legality logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` — replace the manual grant-ready-state workaround with assertions against the real immediate required ARVN LimOp handoff, targeting restriction, and post-resolution resume.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add or strengthen one focused regression for effect-issued target-bound required cross-seat parity if current coverage does not already pin it directly.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — modify only if the narrowed parity bug requires new kernel-level legality regression coverage.
4. `packages/engine/test/unit/kernel/apply-move.test.ts` — modify only if the narrowed parity bug requires new kernel-level consume/resume regression coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-lam-son-719.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`
8. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Re-scoped the work away from inventing a new runtime window abstraction. The existing shared required-grant contract remained the architecture of record.
  - Updated Lam Son 719 production data in `data/games/fire-in-the-lake/41-events/065-096.md` to use the canonical contract: `viabilityPolicy: requireUsableAtIssue`, `completionPolicy: required`, `outcomePolicy: mustChangeGameplayState`, and `postResolutionTurnFlow: resumeCardFlow`.
  - Updated `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` so it asserts the real required-window handoff/resolution path instead of mutating runtime state manually.
  - Added a focused effect-issued cross-seat required execution-context regression in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`.
  - Fixed two shared kernel bugs exposed by the narrowed scope:
    - `packages/engine/src/kernel/free-operation-viability.ts` now preserves constrained action classes during require-usable probing.
    - `packages/engine/src/kernel/legal-moves.ts` now preserves constrained action classes during ready-grant legal move enumeration.
- Deviations from original plan:
  - No new runtime alias/substate was introduced because it was not more beneficial than the existing architecture.
  - Kernel code still changed, but only narrowly, because the production Lam Son scenario exposed real class-preservation bugs in generic probing/discovery.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/fitl-events-lam-son-719.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint` (passes with pre-existing warnings elsewhere in the package)
  - `pnpm run check:ticket-deps`
