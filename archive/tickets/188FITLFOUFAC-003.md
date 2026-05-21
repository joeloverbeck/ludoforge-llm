# 188FITLFOUFAC-003: ARVN plan structure — doctrines + plan templates + role selectors

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `specs/188-fitl-four-faction-plan-migration-and-sequencing.md`

## Problem

Spec 188 §4.1 authors the ARVN faction personality's plan structure as `schemaVersion: 3` constructs in `data/games/fire-in-the-lake/92-agents.md`: doctrine carriers (when/priority/intent), the six preferred-combination plan templates, and their role selectors — all derived from `reports/fitl-competent-agent-ai.md` (ARVN sections). This is the foundation of the ARVN migration; guardrails (004), posture/relationships (005), and the legacy demotion (006) all build on it. Bundled as one ticket because doctrines propose templates and templates bind selectors — a tightly-coupled reference graph that cannot be split without dangling mid-chain references.

## Assumption Reassessment (2026-05-21)

1. `schemaVersion: 3` plan-structure infrastructure (planTemplates, role selectors, strategy-module doctrine carriers) is fully implemented and landed via Spec 186 (confirmed during Spec 188 reassessment).
2. `arvn.trainGovern` plan template AND the role selectors `arvn.governPatronageSpace` / `arvn.trainSpaceForControlOrPacification` ALREADY EXIST in `92-agents.md` (Spec 186 ARVN slice, commit `a8fc17db8`). This ticket EXTENDS them — it does NOT re-author them. The `arvn-train-govern-separation.test.ts` witness already passes against them.
3. The ARVN profile binds via the doctrine-carrier proposal mechanism (no explicit `plan:` block in the profile `use:` list); `arvn-evolved` carries `arvn.trainGovern` because its `buildPoliticalEngine` module proposes it. New templates must be reachable the same way.

## Architecture Check

1. Pure YAML authoring of generic DSL constructs — the engine never sees "Sweep"/"Raid", only authored action tags and selector filters (Spec 188 §3 generic-encoding requirement).
2. Preserves agnostic boundaries — all FITL-specific content lives in `data/games/fire-in-the-lake/` (Foundation #1, #2).
3. No backwards-compatibility shims — extends the existing v3 library; the v2 primary-path deletion is owned by ticket 006, not here.

## What to Change

Author in dependency order (selectors → templates → doctrines) so each layer's references resolve.

### 1. Role selectors (net-new)

Add `arvn.patrolLocOrCity`, `arvn.sweepToExposeSpace`, `arvn.raidRemovalTarget`, `arvn.transportOrigin`, `arvn.transportDestination` (routePairs), `arvn.assaultTargetSpace`, `arvn.pieceRemovalPriority` to the selectors library bucket. Quality components per report §ARVN target scoring features (`reports/fitl-competent-agent-ai.md` ~line 574). Do NOT touch the existing `arvn.governPatronageSpace` / `arvn.trainSpaceForControlOrPacification`.

### 2. Plan templates (net-new)

Add `arvn.patrolGovern`, `arvn.sweepRaid`, `arvn.assaultRaid`, `arvn.trainTransport`, `arvn.assaultTransportAssault` to the `planTemplates` library bucket (line ~275). Each: root action tag + optional special tag + timing + role steps binding the selectors above, with `Govern space ≠ Train space`-style role constraints where the report requires distinct spaces. `arvn.trainGovern` already exists — leave it unchanged.

### 3. Doctrine carriers

Add `arvn.blockImmediateWin`, `arvn.harvestPatronage`, `arvn.holdHighPopControl`, `arvn.protectAidEcon`, `arvn.selectiveViolence`, `arvn.denyUSIfNearWin`, `arvn.preCoupRedeployDiscipline` to the `strategyModules` bucket (line ~288) as doctrine carriers — `when`/priority/intent from report §ARVN priority stack (~line 440) + final personality statement (~line 636). Each proposes the relevant plan templates from step 2.

### 4. Bind to the ARVN profile

Wire the new doctrine carriers into the `arvn-evolved` profile `use:` list (line ~700) so the templates are reachable via the proposal mechanism.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- ARVN guardrails (ticket 004), posture/relationships (ticket 005), legacy-consideration demotion and v2 deletion (ticket 006), witnesses (ticket 007).
- US/NVA/VC factions (tickets 008–010).
- Do not re-author `arvn.trainGovern`, `arvn.governPatronageSpace`, `arvn.trainSpaceForControlOrPacification`.

## Acceptance Criteria

### Tests That Must Pass

1. The FITL GameDef compiles with the extended ARVN library; the new doctrines/templates/selectors bind to the ARVN seat (no compiler diagnostics).
2. `arvn-train-govern-separation.test.ts` still passes (existing Spec 186 witness unaffected).
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. FITL GameDef compiles byte-identically on repeated compiles (determinism, Foundation #16).
2. No engine/compiler diff — Tier-1 YAML only (Spec 188 §2, Foundation #1).
3. All new template/selector/doctrine cross-references resolve (no dangling ids).

## Test Plan

### New/Modified Tests

1. No new test files in this ticket — witnesses are authored in ticket 007. (Rationale: the ARVN behavioral witnesses span tickets 003–006 and attach to the ticket completing the behavior.)

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/arvn-train-govern-separation.test.js`
2. `pnpm turbo test`

## Outcome

Completed on 2026-05-21.

What changed:

- Added the seven ARVN role selectors in `data/games/fire-in-the-lake/92-agents.md`: `arvn.patrolLocOrCity`, `arvn.sweepToExposeSpace`, `arvn.raidRemovalTarget`, `arvn.transportOrigin`, `arvn.transportDestination`, `arvn.assaultTargetSpace`, and `arvn.pieceRemovalPriority`.
- Added five net-new ARVN plan templates: `arvn.patrolGovern`, `arvn.sweepRaid`, `arvn.assaultRaid`, `arvn.trainTransport`, and `arvn.assaultTransportAssault`.
- Added seven ARVN doctrine carriers: `arvn.blockImmediateWin`, `arvn.harvestPatronage`, `arvn.holdHighPopControl`, `arvn.protectAidEcon`, `arvn.selectiveViolence`, `arvn.denyUSIfNearWin`, and `arvn.preCoupRedeployDiscipline`.
- Bound the new doctrine carriers into `arvn-evolved.use.strategyModules`.
- Left the existing `arvn.trainGovern`, `arvn.trainSpaceForControlOrPacification`, and `arvn.governPatronageSpace` definitions unchanged.

Deviations and boundary notes:

- The live compiler assembles `profile.plan.planTemplates` and `profile.plan.strategyModules` from all library entries, not solely from `use.strategyModules`; the explicit `arvn-evolved.use.strategyModules` binding requested by this ticket is still present.
- The doctrine carrier `scoreGroups` use constant authored weights rather than `selector.<id>...` score refs because selector IDs containing dots are not policy-ref addressable through that dotted ref grammar. The carrier `selectors` entries still provide the intended selector dependency and trace surface.
- `arvn.transportDestination` keeps its route quality components at zero weight so the existing Train+Govern witness remains selected on bare Train roots; later ARVN behavior/deepening tickets own route-priority tuning.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/policy-profile-quality/arvn-train-govern-separation.test.js` — passed, 1 test.
- `pnpm turbo test` — passed, 5 tasks successful; engine default lane reported 165/165 test files passed.
- `pnpm -F @ludoforge/engine test:all` — passed, 957 tests.
