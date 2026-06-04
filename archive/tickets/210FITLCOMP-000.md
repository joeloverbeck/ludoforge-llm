# 210FITLCOMP-000: Prerequisite for executed block-leader competence promotion

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes -- generic preview-option standing-role refs plus GameSpecDoc data
**Deps**: `archive/specs/210-fitl-behavioral-competence-fixture-corpus.md`

## Problem

`archive/tickets/210FITLCOMP-001.md` assumes the existing Spec 209 competence harness can run curated FITL states and that the current `shared.blockCurrentLeader` doctrine already selects denial moves whose executed outcome reduces the current leader's victory margin for all four factions. Live reassessment contradicted both assumptions:

1. `runToCompetenceDecision` only bootstrapped from `initialState`, so fixture-authored curated states could not be published/executed through the live-frontier helper.
2. A bounded live-frontier probe showed `shared.blockCurrentLeader` activates for US/ARVN/NVA/VC under near-leader states, but only the VC case produced an executed leader-margin reduction (`US` leader `43 -> 40`). US, ARVN, and NVA selected legal roots with leader-margin delta `0`, which does not satisfy Spec 210's behavioral proof bar.

This prerequisite makes the promotion surface true before `001` rewrites the four structural witnesses in place.

## Assumption Reassessment (2026-06-03)

1. The generic competence helper can remain game-agnostic by accepting an optional canonical `bootstrapState` and then using normal kernel publication/application APIs. This preserves FOUNDATIONS #1 and #5.
2. The block-leader doctrine gap is FITL agent data behavior, not an engine rule gap: `shared.blockCurrentLeader` already compiles and activates, but current profile/YAML scoring does not force an executed margin-reducing denial in three faction cases. Any behavior tuning belongs in `data/games/fire-in-the-lake/92-agents.md` under FOUNDATIONS #2.
3. `archive/tickets/210FITLCOMP-010.md` remains the series-level bucket for later conditional §3 feature additions, but this narrower prerequisite owns the block-current-leader gap discovered before `001` can honestly close.
4. Follow-up reassessment showed a generic engine gap in the microturn preview surface: microturn choices can score `preview.option.delta.victory.currentMargin.self`, but cannot score the current leader's margin delta. Because block-leader proof requires later target choices to optimize against the leader's margin, this ticket owns adding a generic standing-role preview-option ref rather than hardcoding FITL behavior.

## Architecture Check

1. Fixing the bootstrap helper through generic test-helper APIs avoids adding FITL-specific branches to engine/simulator code (FOUNDATIONS #1, #5).
2. Adding generic preview-option standing-role refs preserves engine agnosticism: the engine resolves authored standing roles generically and exposes provenance for bounded preview results (FOUNDATIONS #1, #20).
3. Tuning agent behavior in `92-agents.md`, if required, keeps rule-authoritative agent data in GameSpecDoc YAML (FOUNDATIONS #2) and avoids compatibility shims (FOUNDATIONS #14).
4. The prerequisite is required by FOUNDATIONS #15/#16: the promotion must prove executed behavior, not merely module activation or a narrow accidental state.

## What to Change

### 1. Add generic bootstrap-state support to the competence helper

Extend `packages/engine/test/helpers/competence/live-frontier-runner.ts` so callers can supply a canonical `bootstrapState`. Add a reference regression in `packages/engine/test/architecture/competence-harness-reference.test.ts` and fix any reference helper path issue exposed by running that regression from the repo root.

### 2. Add generic standing-role preview-option refs if needed

If live block-current-leader probes require later microturn choices to score the current leader rather than self, extend the generic preview-option ref surface with standing-role current-margin and delta-current-margin refs. Keep the syntax role-based and generic; no FITL identifiers may enter compiler, kernel, or runtime code.

### 3. Repair block-current-leader doctrine/data only as needed

Use the failing US/ARVN/NVA fixture probes as the gate. Update `data/games/fire-in-the-lake/92-agents.md` only if the current encoded doctrine cannot select an executed leader-margin-reducing denial. Prefer existing features (`projectedLeaderMarginDelta`, current leader margin/rank refs, existing faction posture hooks) before adding any new feature. If a new feature is unavoidable, name the failing fixture/probe that requires it and keep the addition pure data.

### 4. Leave fixture promotion to `001`

Do not rewrite `shared-block-current-leader-{us,arvn,nva,vc}.test.ts` in this prerequisite except for a minimal failing probe if needed to drive YAML work. `001` remains the owner for the final in-place promotion, adversarial alternatives, preview-status assertions, and replay identity assertions.

## Files to Touch

- `packages/engine/test/helpers/competence/live-frontier-runner.ts` (modify)
- `packages/engine/test/architecture/competence-harness-reference.test.ts` (modify)
- `packages/engine/test/helpers/competence/__reference__/generic-control-reference.ts` (modify if needed for repo-root reference proof)
- `packages/engine/src/contracts/policy-contract.ts` and preview-option compiler/runtime mirrors (modify only if generic standing-role refs are required)
- `packages/engine/test/policy-profile-quality/shared-block-current-leader-live-prerequisite.test.ts` (add focused pre-promotion witness)
- `data/games/fire-in-the-lake/92-agents.md` (modify only if required by failing block-leader probes)
- `archive/tickets/210FITLCOMP-001.md` (read/modify dependency boundary)

## Out of Scope

- Final in-place promotion of the four block-current-leader test files; that remains `archive/tickets/210FITLCOMP-001.md`.
- Other shared intents and faction signature fixtures.
- FITL-specific engine/kernel/runtime production changes.
- Speculative §3 feature additions unrelated to the named block-current-leader failing probes.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/competence-harness-reference.test.js` proves the generic bootstrap-state path.
2. A focused block-current-leader probe or pre-promotion witness demonstrates that US, ARVN, NVA, and VC each have a live action-selection state where `shared.blockCurrentLeader` activates and the selected executed root reduces the current leader's victory margin.
3. Existing integrity: `pnpm run check:ticket-deps`

### Invariants

1. No production engine/simulator game-specific logic is introduced.
2. Any behavior change is GameSpecDoc YAML data and is justified by a named failing block-leader probe.
3. `001` remains the sole owner for replacing the four structural witness bodies and tagging them `@proof-tier: executed-outcome` / `adversarial`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/competence-harness-reference.test.ts` -- adds bootstrap-state regression for the generic competence runner.
2. `packages/engine/test/policy-profile-quality/shared-block-current-leader-live-prerequisite.test.ts` -- focused pre-promotion witness for US/ARVN/NVA/VC live leader-margin reduction.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/competence-harness-reference.test.js`
2. `pnpm run check:ticket-deps`

## Outcome (2026-06-03)

Outcome amended: 2026-06-04 -- archive-path cleanup after `210FITLCOMP-010` completed and moved to `archive/tickets/`.

Outcome amended: 2026-06-04 -- archive-path cleanup after Spec 210 completed and moved to `archive/specs/`.

Outcome amended: 2026-06-03 -- post-ticket review added the final dependency and whitespace verification commands that were run after archival.

Completed. Live reassessment found that the prerequisite needed both the already-implemented generic `bootstrapState` competence-runner support and a generic preview-option ref extension for standing-role victory-current-margin refs. The engine/compiler/runtime additions are role-based and game-agnostic (`preview.option.victory.currentMargin.role:<role>` and `preview.option.delta.victory.currentMargin.role:<role>`), with no FITL identifiers in engine code.

FITL data changes were limited to `data/games/fire-in-the-lake/92-agents.md`: `shared.blockCurrentLeader` now includes Terror, enables the missing denial templates, US/NVA get bounded exact-world inner preview, and the new microturn `preferLeaderDenialOption` scores the current leader's margin delta. ARVN also gained a narrow Govern denial template.

Added `shared-block-current-leader-live-prerequisite.test.ts`, a focused four-faction pre-promotion witness. It runs the real policy agent through the live frontier from curated states and proves selected executed behavior reduces the current leader margin for US, ARVN, NVA, and VC while `shared.blockCurrentLeader` is active. Final promotion of the four existing structural witness files remains owned by `210FITLCOMP-001`.

Verification run:

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-live-prerequisite.test.js`
3. `node --test packages/engine/dist/test/unit/cnl/compile-microturn-refs.test.js packages/engine/dist/test/unit/cnl/compile-preview-option-refs.test.js`
4. `node --test packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-us.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-block-current-leader-vc.test.js`
5. `node --test packages/engine/dist/test/architecture/competence-harness-reference.test.js`
6. `pnpm run check:ticket-deps`
7. `git diff --check`
