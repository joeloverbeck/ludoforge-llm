# 210FITLCOMP-006: Promote US faction fixtures to executed-outcome tier

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic plan-template fixed-choice support; FITL data/test updates
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

US signature fixtures assert structurally (compile/bind/score) and do not execute a turn. Spec 210 §2(6–8) requires executed-outcome proof for: Train/Pacify improving Support on a legal high-pop COIN-controlled target; Train+Advise selected over plain Train with the Advise role executed; and Safe Air Strike preferring a zero-pop/Trail target while rejecting a populated-Support target (executed Support not harmed).

## Assumption Reassessment (2026-06-03)

1. Existing US fixtures: `us-train-pacify-high-pop-support.test.ts` (convergence-witness), `us-train-advise-beats-plain-train.test.ts` (convergence-witness), `us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` (architectural-invariant), `us-avoids-airstrike-populated-support.test.ts` (architectural-invariant). Confirmed.
2. They consume `us-plan-witness-helpers.ts` (`loadUsPlanFixture`, `proposeUsPlan`, `requireAlternative`) — structural helpers to be superseded by curated executable states.
3. Support/Aid outcome refs: `metric.auto:victory:markerTotal:supportOpposition:...` and `var.global.aid` (used in `92-agents.md`). Confirmed.
4. Promotion pattern established by 001.

## Assumption Reassessment (2026-06-04)

1. Live-frontier probing for this ticket exposed that `us.adviseTargetSpace` can bind `available-ARVN:none`, an off-board holding zone, as an Advise target. That makes a test-only promotion misleading because Train+Advise can satisfy a role with a non-board target.
2. The issue is FITL GameSpecDoc data, not an engine gap: selector `where` predicates are already a generic policy surface, and Foundations #1/#2 require this game-specific target restriction to remain in `92-agents.md`.
3. User approved recommended option 1 on 2026-06-04: correct the US selector gap in GameSpecDoc first, then promote the US fixtures against the corrected live profile. This widens 006 from test-only to test/data-only without adding new profile features or engine logic.
4. Follow-up live proof exposed a generic engine/compiler gap: plan-template steps could bind zone roles, but could not author fixed scalar choices such as `$trainChoice = place-irregulars`, `$subAction = pacify`, or `$pacLevels = 2`. User approved recommended option 1 on 2026-06-04 to add generic `selectedValue` support for scalar choice surfaces instead of encoding FITL-specific runtime logic.
5. The corrected `us.adviseTargetSpace` selector invalidated the old seed-pinned Train+Advise proposal assertion: after off-board holding zones are excluded, the tested seed no longer yields a live `us.trainAdvise` alternative. The fixture now protects the authored Train+Advise template/module wiring honestly rather than preserving a stale frontier claim.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14). The two Air-Strike fixtures (#8) form a positive/adversarial pair across two files; both promoted together for coherence.
2. Engine changes are generic: scalar choice target derivation, plan-template `selectedValue` lowering/validation, and runtime matching. FITL specifics stay in fixtures/data (FOUNDATIONS #1/#2). The selector repair uses the existing generic `where` surface rather than introducing FITL runtime branches.
3. `assertOutcomeDeltas` ties the proof to the named feature/token query and the US victory formula (FOUNDATIONS #16).

## What to Change

### 1. Train/Pacify (#6) — `us-train-pacify-high-pop-support.test.ts`

Build a curated state with a legal COIN-controlled high-pop target; run the live frontier; prove `us.trainPacify`/`us.pacifyTargetSpace` is selected and executed Support improves (named-feature/token query), with a lower-value target as the adversarial root.

### 2. Train+Advise (#7) — `us-train-advise-beats-plain-train.test.ts`

Keep Train+Advise wired as the Train+Advise carrier enabled by US support doctrine. The old seed-pinned “beats plain Train” proposal is stale after the selector validity repair and must not be overclaimed as executed proof until a new valid live frontier is authored.

### 3. Safe Air Strike (#8) — `us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` + `us-avoids-airstrike-populated-support.test.ts`

Prove the zero-pop/Trail target is selected and executed, with a populated-Support target present as the adversarial root and rejected; assert executed Support is not harmed.

### 4. Markers + dead-helper cleanup

Update each file's markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`. Remove any `us-plan-witness-helpers.ts` exports that have zero remaining consumers after promotion (FOUNDATIONS #14); if a helper still serves a not-yet-promoted US fixture, leave it.

### 5. US selector correction exposed by live proof

Patch the US target selectors needed by this ticket so off-board holding zones cannot satisfy board-space roles. The known blocker is `us.adviseTargetSpace` binding `available-ARVN:none`; apply the same board-space guard to adjacent US selectors touched by the promoted templates when the live compiled selector surface shows the same off-board source class.

### 6. Generic fixed-choice plan-template support

Add a generic scalar choice target kind and plan-template `selectedValue` matching so GameSpecDoc templates can drive enum/int/bool choice steps without role-binding scalar values through game-specific engine branches.

## Files to Touch

- `packages/engine/test/policy-profile-quality/us-train-pacify-high-pop-support.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-train-advise-beats-plain-train.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/us-plan-witness-helpers.ts` (modify — extend for curated states / prune dead exports)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)
- `data/games/fire-in-the-lake/92-agents.md` (modify — selector `where` correction only)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/choice-target-kinds.ts` (modify)
- `packages/engine/src/kernel/query-domain-kinds.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (modify)
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify)
- `packages/engine/src/agents/plan-controller.ts` (modify)
- `packages/engine/src/agents/plan-role-constraint-eval.ts` (modify)
- `packages/engine/test/unit/agents/plan-controller.test.ts` (add)

## Out of Scope

- P1 US fixtures (`us-patrol-*`, `us-airlift-*`, `us-avoid-arvn-kingmaking`) — deferred (spec §5).
- New `92-agents.md` features — ticket 010. The approved selector `where` correction exposed by 006 live proof is in scope.
- Shared-intent fixtures (001–005).

## Acceptance Criteria

### Tests That Must Pass

1. Train/Pacify executes and improves Support on the high-pop target over the lower-value alternative.
2. Train+Advise authored wiring remains present and enabled by US support doctrine; the stale seed-pinned proposal claim is not overclaimed after selector correction.
3. Safe Air Strike selects the zero-pop/Trail target, rejects the populated-Support target, and leaves executed Support unharmed.
4. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/us-train-pacify-high-pop-support.test.js`

### Invariants

1. Promoted executed fixtures carry `@proof-tier: executed-outcome` + `adversarial`; structural fixtures document why a live-frontier claim is not currently valid (FOUNDATIONS #14/#15).
2. US reaches executed-outcome on its primary victory engine (Support) and ≥1 signature combination (spec §4 AC#1).
3. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20); replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. The four US fixtures above — updated to the truthful live proof boundary; Train/Pacify gains authored fixed-choice execution support, Train+Advise remains structural because the corrected selector invalidates the old frontier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/us-train-pacify-high-pop-support.test.js packages/engine/dist/test/policy-profile-quality/us-train-advise-beats-plain-train.test.js packages/engine/dist/test/policy-profile-quality/us-sweep-airstrike-prefers-zero-pop-or-trail.test.js packages/engine/dist/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.js packages/engine/dist/test/unit/agents/plan-controller.test.js packages/engine/dist/test/integration/fitl-production-data-compilation.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`

## Outcome

Completed: 2026-06-04

What changed:

1. Added generic plan-template fixed-choice support for scalar choice decisions through `selectedValue`, including type/schema lowering, compiler validation, runtime matching, and a focused plan-controller unit witness.
2. Updated FITL US selectors touched by this ticket (`us.trainSupportSpace`, `us.adviseTargetSpace`, `us.airStrikeTarget`) to exclude off-board holding zones through the existing generic selector `where` surface.
3. Updated `us.trainPacify` to author the Train/Pacify scalar choices (`trainChoice`, `subAction`, `pacLevels`) in `92-agents.md`.
4. Retained the US Train+Advise fixture as a structural wiring witness because the approved selector repair invalidated the stale seed-pinned live proposal claim.

Deviation from original plan:

1. The ticket widened from test-only to generic engine/compiler support plus FITL data/test updates after live proof exposed the missing scalar-choice plan-template seam.
2. The original Train+Advise executed-outcome assertion was not landed in this ticket; after off-board selector targets were removed, the old seed no longer yields a valid `us.trainAdvise` proposal alternative.

Verification:

1. `git diff --check` — passed.
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/us-train-pacify-high-pop-support.test.js packages/engine/dist/test/policy-profile-quality/us-train-advise-beats-plain-train.test.js packages/engine/dist/test/policy-profile-quality/us-sweep-airstrike-prefers-zero-pop-or-trail.test.js packages/engine/dist/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.js packages/engine/dist/test/unit/agents/plan-controller.test.js packages/engine/dist/test/integration/fitl-production-data-compilation.test.js` — passed, 8 tests.
