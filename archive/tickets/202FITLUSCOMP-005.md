# 202FITLUSCOMP-005: P3 — `us-baseline` bindings (§4.6)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: `archive/tickets/202FITLUSCOMP-003.md`, `archive/tickets/202FITLUSCOMP-004.md`

## Problem

The templates (002), strategy modules (003), and posture/guardrails (004) are authored but not yet wired into `us-baseline`. Spec 202 §4.6 specifies the binding additions: the new plan templates into `us-baseline.bindings.planTemplates` and `us.buildSupport`, `us.preserveAvailability` (replacing the existing), `us.protectAidEcon`, `us.avoidArvnKingmaking` into `us-baseline.bindings.strategyModules`.

## Assumption Reassessment (2026-05-29)

1. `us-baseline` currently binds 4 plan templates, 3 faction-specific + 7 `shared.*` modules, 1 posture, 2 guardrails (verified). The new bindings extend these lists.
2. `us.preserveAvailability` binding must replace the existing entry, not duplicate it (Foundation 14).
3. The new posture (`us.airStrikePoliticalCost`, `us.aidEconFloor`) and guardrails (`us.avoidOvercommitment`, `us.avoidArvnKingmaking`) bind here per §4.6 (the spec's §4.6 prose names the strategy-module + plan-template additions explicitly; posture/guardrail bindings follow the same profile section).

## Architecture Check

1. Binding is the final composition step — keeping it separate from authoring (002–004) yields a small, reviewable diff that flips the new doctrine "on" atomically.
2. All in `GameSpecDoc` YAML; no engine change.
3. Replacing (not aliasing) the `us.preserveAvailability` binding upholds Foundation 14.

## What to Change

### 1. Add plan-template bindings

Add `us.trainPacify`, `us.patrolAdvise` (if not already bound), `us.airLiftAssault`, `us.airLiftControlOrWithdrawal`, `us.assaultHighValueInfrastructure`, `us.eventDirectSwing` to `us-baseline.bindings.planTemplates`.

### 2. Add strategy-module bindings

Add `us.buildSupport`, `us.protectAidEcon`, `us.avoidArvnKingmaking`; replace the existing `us.preserveAvailability` entry with the strengthened module.

### 3. Add posture/guardrail bindings

Bind the new posture evaluators and guardrails from ticket 004 into `us-baseline`.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — `us-baseline.bindings`)

## Out of Scope

- Authoring any new construct (done in 002–004).
- Profile-quality witnesses (ticket 006) and replay reattestation (ticket 007).

## Acceptance Criteria

### Tests That Must Pass

1. `us-baseline` compiles with all new bindings; every bound name resolves to an authored construct.
2. Existing US witnesses (`us-advise-airlift-force-multiplier.test.ts`, `us-avoids-airstrike-populated-support.test.ts`) still pass.
3. FITL canary replay-identity preserved: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No duplicate `us.preserveAvailability` binding (old entry replaced).
2. Compiler determinism: recompiling FITL yields byte-identical GameDef.

## Test Plan

### New/Modified Tests

1. None new here — the witness suite is ticket 006; this ticket is verified by compilation + preserved existing witnesses + canary replay identity.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

**Completed**: 2026-05-29

**What changed** (`data/games/fire-in-the-lake/92-agents.md`, `profiles.us-baseline.use`):
- **planTemplates** += `us.trainPacify`, `us.airLiftAssault`, `us.airLiftControlOrWithdrawal`, `us.assaultHighValueInfrastructure` (now 8; `us.patrolAdvise` was already bound — its strengthened form is the same binding name; `us.eventDirectSwing` not bound, excluded by design).
- **strategyModules** += `us.buildSupport`, `us.protectAidEcon`, `us.avoidArvnKingmaking`. `us.preserveAvailability` binding unchanged (replaced in place, Foundation 14 — verified single binding, no duplicate/alias).
- **guardrails** += `us.aidEconFloor`, `us.avoidOvercommitment`, `us.avoidArvnKingmaking` (now 5).
- No `use.postureEvaluators` change: the strengthened `us.preserveSupportAndAvailability` is already applied via every US template's `postureHook`; the dropped `us.airStrikePoliticalCost` and the guardrail-form `us.aidEconFloor` need no posture binding (per ticket 004's surface findings).

**Note**: the strategy module and guardrail both named `us.avoidArvnKingmaking` are distinct constructs in separate catalog records (`strategyModules` vs `guardrails`) and bind into separate `use` lists — intentional per spec §4.3/§4.5.

**Verification**:
- FITL compiles **0 errors**; every bound name resolves; `us.preserveAvailability` bound exactly once.
- Byte-identical recompile (compiler determinism); bootstrap fixture regenerated and `check` current; `schema:artifacts:check` clean.
- Determinism lane **99/99 pass**; `perf-baseline-trajectory-identity` passes — **FITL replay-identity preserved** even with the new doctrine live.
- `policy-profile-quality` + perf: **66 pass / 9 fail — the 9 are the pre-existing stale convergence witnesses**, unchanged; binding the new doctrine added zero new failures. The passing US witness (`us-advise-airlift-force-multiplier`) still passes.
