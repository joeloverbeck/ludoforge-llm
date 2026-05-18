# 179ACTSELPRE-009: Phase 2d - Specify ordinary-operation preview visibility successor

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Unknown - design first; no engine changes until the successor surface is specified and a focused failing witness exists.
**Deps**: `archive/tickets/179ACTSELPRE-008.md`

## Problem

Ticket 008 found no usable production FITL event/free-operation replacement witness for Spec 179's `outcomeGrantResolve` opt-in. The original Phase 2 ARVN witness still targets ordinary operation candidates (`patrol`, `sweep`, `assault`) whose opponent-margin effects need action-selection preview visibility, but current production FITL grant routing exposes event/free-operation grants as free-operation `actionSelection` moves rather than `outcomeGrantResolve` frames.

This ticket owns the next ordinary-operation preview visibility surface. It must decide whether the right successor is a focused `previewEffect.*`-style projection, a Spec 180 standing-vector/outer-preview amendment, or another bounded generic surface, then update the active spec/ticket graph before implementation starts.

## Assumption Reassessment (2026-05-17)

1. Spec 179 Phase 1 substrate is present and synthetically tested, but current production FITL does not produce a closing `outcomeGrantResolve` witness for that substrate.
2. Ticket 008's production card-46 shaded probe verified that `freeOperationGrants` can issue pending grants while still producing zero `previewUsage.outcomeGrantContinuation.exitCounts`.
3. Spec 180 exists as a standing-vector observability spec, but it currently assumes Spec 179 produces the missing signal. This successor must reassess whether Spec 180 should be amended, superseded, or kept as a later observability layer.

## Architecture Check

1. Preserve Foundations #1 and #5: the successor must be a generic one-rules-protocol surface, not FITL-specific engine logic.
2. Preserve Foundation #10: any projection or continuation must be bounded by explicit candidate/step/effect limits and reproducibility metadata.
3. Preserve Foundations #15 and #20: ordinary-operation opponent effects must not be represented as ready numeric signal unless the projection actually observed the relevant effects; unavailable/capped/partial signal needs explicit trace provenance.

## What to Change

### 1. Reassess successor architecture

Compare the live options against `docs/FOUNDATIONS.md`, Spec 179 evidence, `reports/spec-179-remediation.md`, and `specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md`:

- focused `previewEffect.*` / ordinary-operation effect projection,
- amendment of Spec 180 so it owns both signal production and observability,
- or a narrower generic continuation/projection route that preserves Spec 179 as synthetic-only substrate.

### 2. Update the graph before implementation

Patch the chosen active spec/ticket artifacts so they no longer imply that Spec 179 can close on a production event/free-operation `outcomeGrantResolve` witness.

### 3. Define the first proving witness

Specify the smallest bounded FITL ARVN ordinary-operation witness and the generic cross-game or synthetic invariant needed before code changes.

## Files to Touch

- `specs/179-action-selection-preview-outcome-grant-opt-in.md` (modify if successor ownership changes Spec 179 wording)
- `specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (modify if selected as the successor architecture)
- `reports/179-phase-2-post-opt-in-witness.md` (modify if the successor changes the witness ledger)
- `tickets/179ACTSELPRE-005.md`, `tickets/179ACTSELPRE-006.md`, `tickets/179ACTSELPRE-007.md`, `archive/tickets/179ACTSELPRE-008.md` (modify only for dependency/status cleanup)
- `packages/engine/src/**` and `packages/engine/test/**` (modify only after the successor surface and first failing witness are specified)

## Out of Scope

- Lowering the old `currentMargin.nva` / `currentMargin.vc` thresholds and calling Spec 179 passed.
- FITL-specific engine branches or profile-only hacks.
- WASM-route alignment before the successor surface defines the route that needs alignment.

## Acceptance Criteria

### Tests That Must Pass

1. Active spec/ticket graph names the ordinary-operation preview visibility owner truthfully.
2. The selected successor surface has a bounded proof plan and at least one focused failing witness identified before engine implementation begins.
3. `pnpm run check:ticket-deps`.

### Invariants

1. No claim that event/free-operation grant evidence proves ordinary operation opponent-margin visibility.
2. No new preview scalar can silently coerce unavailable/capped signal into a numeric contribution.
3. No engine implementation without first adding or identifying a focused failing witness for the selected generic surface.

## Test Plan

### New/Modified Tests

1. No tests are expected until the successor architecture is selected.

### Commands

1. `pnpm run check:ticket-deps`

## Outcome (2026-05-17)

Completed design/graph closeout; no engine implementation under this ticket.

Selected successor:

- Chosen option: amend Spec 180 so it owns both ordinary-operation standing signal production and observability.
- Rejected option: separate `previewEffect.*` namespace. Reason: it risks a parallel effect-projection surface and raw-effect shortcut before a generic standing projection is proven insufficient.
- Rejected option: keep Spec 179 as the production ordinary-operation owner. Reason: tickets 007/008 proved current production FITL ordinary operations and event/free-operation grants do not provide the `outcomeGrantResolve` frame that Spec 179 extends.

What changed:

- `specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` is now active as the standing-vector / ordinary-operation preview signal successor.
- Spec 180 tickets `archive/tickets/180STDVECOBSROL-001.md` through `archive/tickets/180STDVECOBSROL-006.md` define the implementation chain:
  - 001: focused ordinary-operation standing-projection RED witness plus silent-zero pin before production implementation (archived).
  - 002: bounded standing-projection route.
  - 003: status-aware outer-preview `seatAgg`.
  - 004: `previewUsage.seatMatrix`.
  - 005: standing role primitives.
  - 006: FITL ARVN standing witness and cookbook addendum.
- `specs/179-action-selection-preview-outcome-grant-opt-in.md`, `reports/179-phase-2-post-opt-in-witness.md`, and same-family tickets 005/006/007 now point at the Spec 180 successor instead of leaving 009 as the ongoing owner.

Bounded proof plan:

- First generic witness: `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts`.
- Generic invariant: two action-selection candidates in a four-seat fixture; one candidate changes an opponent terminal margin through the normal published-decision/apply path and one does not. Current code should fail to report a status-bearing differentiated opponent standing cell; the fixed surface must report a ready differentiated cell or explicit unavailable/capped status.
- FITL witness: later Spec 180 Phase 5 reruns the ARVN ordinary-operation witness using role-based considerations and `previewUsage.seatMatrix`, not `previewUsage.outcomeGrantContinuation.exitCounts`.

Ticket-named deliverables ledger:

| Deliverable | Status |
| --- | --- |
| Reassess `previewEffect.*`, Spec 180 amendment, and narrower projection route | done; Spec 180 integrated standing projection selected |
| Patch active spec/ticket graph | done; Spec 179 and same-family blockers now point to Spec 180 ticket chain |
| Define smallest bounded FITL ARVN witness | done; Spec 180 Phase 5 / `archive/tickets/180STDVECOBSROL-006.md` |
| Define generic cross-game/synthetic invariant before code changes | done; `archive/tickets/180STDVECOBSROL-001.md` |
| Engine/source implementation | not applicable for 009; explicitly deferred to Spec 180 tickets |

Generated/schema fallout: none. This ticket changed markdown specs, tickets, and report prose only.

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/replaced/not run | final citation |
| --- | --- | --- | --- |
| Acceptance/Test Plan | `pnpm run check:ticket-deps` | run directly before terminal status | passed: 10 active tickets and 2400 archived tickets |

AGENTS canonical lane reconciliation:

| AGENTS canonical lane | required by ticket? | ran/subsumed/not applicable | rationale |
| --- | --- | --- | --- |
| `pnpm turbo build` | no | not applicable | no source, schema, package, generated runtime, or build artifact changes |
| `pnpm turbo test` | no | not applicable | ticket-owned acceptance is markdown graph integrity |
| `pnpm turbo lint` | no | not applicable | no linted source changes |
| `pnpm turbo typecheck` | no | not applicable | no TypeScript changes |
| `pnpm turbo schema:artifacts` | no | not applicable | no schema source/artifact changes |

Late-edit proof validity: `pnpm run check:ticket-deps` passed before terminal status and again after terminal status (`10 active tickets and 2400 archived tickets`). No-invalidation: terminal status/proof transcription only; no scope, acceptance criteria, command semantics, touched-file ownership, follow-up ownership, or dependency target changed after the graph checks.

Post-review status: archive-ready. The post-ticket-review pass confirmed the successor graph and archived this ticket after the final dependency proof.
