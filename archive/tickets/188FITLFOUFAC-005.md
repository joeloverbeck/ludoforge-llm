# 188FITLFOUFAC-005: ARVN posture evaluators + relationship wiring (US-rival flip)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`

## Problem

Spec 188 §4.1 (Posture + relationships) authors the Spec 187 posture/relationship layer for ARVN: a resource-floor `must` constraint, `prefer` terms for own-margin, and conditional US-rival denial — ARVN treats the US as its nominal ally but flips to rival weighting when the US nears a win. `postureEvaluators` and `relationships` buckets do not yet exist in `92-agents.md` (net-new for Spec 188), so this ticket introduces them for ARVN.

## Assumption Reassessment (2026-05-21)

1. `postureEvaluators` and `relationships` are NOT yet present in `92-agents.md` (confirmed during Spec 188 reassessment — net-new authoring).
2. The compiled support exists: `CompiledPostureEvaluator` (must/prefer) and `CompiledPolicyRelationship` (`nominalAlly`/`rival`, seat binding, `condition`, `priority`, `gainValue`) — Spec 187, landed.
3. A `planTemplate.postureHook` references a posture evaluator by id; the ARVN templates from ticket 003 will reference the evaluator authored here.

## Architecture Check

1. Posture/relationship constructs are generic — the ally-as-rival flip is authored as a `condition` on a relationship, not engine logic (Foundation #1).
2. Foundation #20: any `prefer` term consuming a preview ref that may be unavailable declares an explicit fallback, visible in trace output.
3. No backwards-compatibility shims — net-new buckets plus profile wiring.

## What to Change

### 1. Author the ARVN posture evaluator(s)

Add a `postureEvaluators` bucket entry for ARVN: resource-floor `must` (demote/veto when aid/econ below floor), `prefer` own-margin. Wire `postureHook` references from the ARVN plan templates (ticket 003) to this evaluator.

### 2. Author the ARVN relationship wiring

Add a `relationships` bucket entry: `relationship.nominalAlly = US`, with a `condition` that flips to rival weighting when `us.nearWin`. Priority/`gainValue` per report §5.1 (US/ARVN relationship, `reports/fitl-competent-agent-ai.md` ~line 1140).

### 3. Bind to the ARVN profile

Wire the posture evaluator and relationship into the `arvn-evolved` profile.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- ARVN guardrails (004), legacy demotion (006), witnesses (007).
- US/NVA/VC relationship wiring (008–010) — though US is the counterpart of this ARVN relationship, the US-side authoring lands in ticket 008.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the ARVN posture evaluator + relationship bound (no diagnostics).
2. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism preserved — byte-identical compile on repeat (Foundation #16).
2. No engine/compiler diff (Foundation #1).
3. Unavailable preview refs in `prefer` terms are not silently coerced — explicit fallback declared (Foundation #20).

## Test Plan

### New/Modified Tests

1. No new test files — the US rival-risk-flip witness is authored in ticket 007.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/`
2. `pnpm turbo test`

## Outcome

Completed: 2026-05-21

Implemented the ARVN posture/relationship authoring slice in `data/games/fire-in-the-lake/92-agents.md`:

- Added `strategicConditions.usNearWin` for the authored US near-win threshold.
- Added `postureEvaluators.arvn.preserveAidAndMargin` with a resource-floor `must`, an own-margin `prefer`, and an explicit fallback-bearing US ally/rival risk `prefer`.
- Added ARVN relationship entries for `nominalAlly` and conditional `nearWin` binding to the US seat.
- Attached `postureHook: arvn.preserveAidAndMargin` to each ARVN plan template authored by ticket 003.

Generated/artifact fallout:

- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/game-def-hash.txt` was refreshed because the intentional FITL agent-library YAML change changed the compiled GameDef hash.
- Generation command: `node packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs`
- Canonical inputs: current production FITL GameSpecDoc plus seed 1001 fixture generator.
- Persisted diff: `game-def-hash.txt` only; `initial-state.json` and `decision-sequence.json` stayed byte-identical.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- Initial package-relative focused proof exposed the expected fixture hash drift in `fitl-march-dead-end-recovery.test.js`; after regenerating the retained fixture hash, `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/fitl-march-dead-end-recovery.test.js` passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/agents/compiled-policy-determinism.test.js dist/test/policy-profile-quality/*.test.js` — passed, 21 tests / 14 suites.
- `pnpm -F @ludoforge/engine test:all` — passed, 957 tests.
- `pnpm turbo test` — passed.

Deviations:

- The ticket's command used a root-relative `node --test packages/engine/dist/...` path after an engine package build. The final focused proof used package-relative built paths through `pnpm -F @ludoforge/engine exec node --test dist/...`, which exercises the same built artifacts under the package context.
