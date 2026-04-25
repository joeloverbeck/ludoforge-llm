# 145PREVCOMP-003: Profile audit and golden re-bless

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None directly — fixture re-bless and audit only; possibly minor profile config edits if audit recommends
**Deps**: `archive/tickets/145PREVCOMP-001.md`, `tickets/145PREVCOMP-002.md`

## Problem

Per Spec 145 §I3: after the driver lands (`145PREVCOMP-001`) and the top-K gate ships (`145PREVCOMP-002`), `previewOutcome` strings change across the trace fixture corpus. Existing `notDecisionComplete` failureReasons are replaced by `'ready'` outcomes for ungated candidates and `'gated'` / `'depthCap'` for the rest. Goldens that capture these strings must be re-blessed.

In addition, this ticket performs a one-pass audit of the five shipped FITL profiles + Texas Hold'em policy profile to confirm: (a) shipped profiles still produce sensible behavior under the default `preview.completion: greedy`; (b) any benefit from setting `preview.completion: agentGuided` on `arvn-evolved` is documented but not necessarily applied (Spec 145 explicitly does not change shipped profiles); (c) the orphaned `vc-baseline projectedMarginWeight: 5` param is acknowledged in audit notes (it is dead config — vc-baseline does not list `preferProjectedSelfMargin` in its considerations per `data/games/fire-in-the-lake/92-agents.md:497-500`). Whether to fix the dead config is a downstream decision flagged by the audit, not a deliverable of this spec.

## Assumption Reassessment (2026-04-25)

1. `notDecisionComplete` currently appears at exactly one source location (`policy-preview.ts:179`) and an audit-pass count of historical references in `archive/` (15+ hits — these are intentional historical preservations and require no edit). Re-bless target is the active fixture corpus only.
2. Shipped profiles list: `us-baseline` (weight 1), `arvn-baseline` (weight 8), `arvn-evolved` (weight 3), `nva-baseline` (weight 1), and `vc-baseline` (weight 5 declared as param but unused in `use.considerations`). Verified at `data/games/fire-in-the-lake/92-agents.md:407-502`.
3. ARVN-evolved campaign witnesses (1000, 1001) referenced in Spec 145 §Testing live under `campaigns/fitl-arvn-agent-evolution/traces/`. These are campaign artifacts, not engine fixtures; re-bless decisions for them are governed by Spec 145 §Testing's "re-blessed only if `compositeScore` provably improves" rule.
4. Schema-level `previewFailureReason` enum (in trace fixtures) gains `'depthCap'` (from 145PREVCOMP-001) and `'gated'` (from 145PREVCOMP-002) — fixtures must be regenerated.
5. Post-`145PREVCOMP-002` integration proof is not green and must be classified here before any re-bless:
   - `spec-140-profile-migration.test.js` fails on live shipped FITL profile syntax at `data/games/fire-in-the-lake/92-agents.md:346: scopes: [completion]`. The literal is present in `HEAD`, so this is a pre-existing shipped-profile migration residue that this audit must either remove or explicitly hand off.
   - `fitl-march-free-operation.test.js` no longer reaches the historical seed-1006 required free-operation March witness within 220 decisions, while the adjacent executable-through-former-witness test still passes. Treat this as a trajectory-sensitive witness shift caused by the new policy scoring path; distill or replace the witness rather than weakening the underlying invariant.
   - `classified-move-parity.test.js` now reaches a FITL step-420 path where the selected action is absent from classified enumeration. This remains an `architectural-invariant` failure; do not re-bless it as a golden/profile-quality shift without first proving the invariant still holds through a narrower repaired witness or opening a production parity follow-up.

## Architecture Check

1. **F#14 (No Backwards Compatibility)** — fixtures are regenerated, not paralleled. No `_legacy` golden files survive.
2. **F#16 (Testing as Proof)** — re-bless follows the `.claude/rules/testing.md` discipline: `golden-trace` re-bless only with explicit commit-body justification (`Re-bless golden trace: <test-file>`); `convergence-witness` re-bless only if the trajectory shift is legitimate; `architectural-invariant` failures are kernel/agent bugs, never softened.
3. **F#15 (Architectural Completeness)** — the audit confirms shipped profiles work under the new defaults; if any profile measurably regresses, the spec is fixed (driver or gate) rather than the profile.

No backwards-compatibility shims; profile edits (if any) are direct, not aliased.

## What to Change

### 1. Fixture audit and inventory

Run `grep -rn "notDecisionComplete" packages/engine/test/fixtures/` and inventory all hits. Each hit is a re-bless candidate; classify per `.claude/rules/testing.md`:

- `architectural-invariant` failures (the test asserts a property that should still hold): fix the kernel/agent if it regresses; do NOT soften the test.
- `convergence-witness` failures: evaluate whether the trajectory shift is legitimate. Distill to architectural invariant if possible (per the §Distillation over re-bless guidance), otherwise re-bless and update the witness id.
- `golden-trace` failures: re-bless only with `Re-bless golden trace: <test-file>` plus a human-readable reason in the commit body.

### 2. Trace fixture regeneration for new reasons

Any fixture that captures `previewFailureReason` strings of `'depthCap'` or `'gated'` for the first time gets a new `convergence-witness` entry rather than a re-bless of an existing one — these are net-new outcomes, not shifted trajectories.

### 3. Shipped profile audit

For each of `us-baseline`, `arvn-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`, plus the Texas Hold'em policy profile, run a representative seed corpus (re-use existing `packages/engine/test/policy-profile-quality/` fixtures if applicable) and compare composite-metric output pre- and post-spec.

Audit deliverables (record in this ticket's Outcome at archive time):

- Per-profile pre/post metric comparison (one-line per profile).
- Whether `preview.completion: agentGuided` would measurably improve `arvn-evolved` or `arvn-baseline`. Per Spec 145 §I3, no profile-config changes are *required* by this spec — if benefit is observed, surface as a follow-up ticket recommendation rather than landing the change inline.
- Explicit acknowledgment of `vc-baseline projectedMarginWeight: 5` dead config: either (i) flag for downstream cleanup ticket, or (ii) note that vc-baseline does not consume `preferProjectedSelfMargin` and the param is dead-but-harmless. Either choice is acceptable; do not change vc-baseline considerations in this ticket.

### 4. Convergence witness re-bless

ARVN-evolved campaign witnesses (1000, 1001): per Spec 145 §Testing, re-bless ONLY if `compositeScore` improves. If a witness regresses post-spec, the kernel/agent path is wrong and the fix lands in `145PREVCOMP-001` or `145PREVCOMP-002` (TDD).

## Files to Touch

- `packages/engine/test/fixtures/**/*` (re-bless any file with `notDecisionComplete` and any new `'depthCap'` or `'gated'` outcomes — exact list determined by audit grep)
- Possibly `packages/engine/test/policy-profile-quality/` witness fixtures (per audit findings)

### Likely surface

The exact fixture list depends on the audit grep output; treat the following as a non-exhaustive starting point:

- Files matching `grep -rn "notDecisionComplete" packages/engine/test/fixtures/`
- Files matching `grep -rn "previewOutcome" packages/engine/test/fixtures/` that capture full-string outcomes
- Witnesses under `packages/engine/test/policy-profile-quality/` that pin ARVN-evolved or VC-baseline composite scores

## Out of Scope

- Driver implementation — `145PREVCOMP-001`.
- Top-K gate behavior — `145PREVCOMP-002`.
- Cross-game integration test — `145PREVCOMP-004`.
- Diagnostics field additions — `145PREVCOMP-005`.
- Performance harness — `145PREVCOMP-006`.
- vc-baseline considerations edit (adding `preferProjectedSelfMargin` to `use.considerations`) — out of scope here; flagged by audit for downstream follow-up.
- Default policy switch from `greedy` to `agentGuided` — Spec 145 §Out Of Scope.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:unit` and `pnpm -F @ludoforge/engine test:integration` — fully green after re-bless.
2. `pnpm turbo test --force` — full suite green.
3. Profile-quality witnesses either re-blessed with documented improvement OR flagged as legitimate regressions feeding back to `145PREVCOMP-001` / `145PREVCOMP-002`.
4. `pnpm turbo lint` and `pnpm turbo typecheck` green.

### Invariants

1. No `'_legacy'` or `'_old'` aliased golden files committed (F#14).
2. Re-bless commits include `Re-bless golden trace: <test-file>` in the commit body for every `golden-trace` re-bless (per `.claude/rules/testing.md`).
3. No `architectural-invariant` test is softened to absorb a regression (per `.claude/rules/testing.md`).
4. The audit report (recorded in this ticket's Outcome) covers every shipped profile.

## Test Plan

### New/Modified Tests

1. Re-blessed fixtures across `packages/engine/test/fixtures/` (exact list from audit).
2. New witnesses for `'depthCap'` and `'gated'` outcomes, classified `convergence-witness` with witness ids `spec-145-depth-cap` and `spec-145-topk-gate` respectively.

### Commands

1. `grep -rn "notDecisionComplete" packages/engine/test/fixtures/` — audit step
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration`
4. `pnpm turbo test --force`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
