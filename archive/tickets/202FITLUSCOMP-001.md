# 202FITLUSCOMP-001: P0 — US capability-gap audit (selector / feature / role-constraint vocabulary)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None (read-only audit; output may surface engine prerequisites as separate specs)
**Deps**: `specs/202-fitl-us-completion.md`

## Problem

Spec 202 §4.2/§4.3 author US selectors and strategy modules that reference DSL refs which may not exist in the current FITL data or engine. The spec's original "no engine changes" Non-Goal was an unverified assumption inherited from the source proposal; reassessment already found one nonexistent ref (`roleTarget.target.*`, re-expressed in §4.4) and several unauthored `zoneProp.*` / `feature.*` names. This ticket performs the §6 P0 capability-gap audit: inventory every required ref/role-constraint and classify each missing one as (a) YAML-authorable (new selector/feature synthesis in `92-agents.md` or a FITL data asset) or (b) a genuine engine capability gap requiring a prerequisite engine spec. The classification gates the concrete authoring in tickets 002–004 — without it, downstream tickets would author against hypothetical surfaces.

## Assumption Reassessment (2026-05-29)

1. Confirmed against current code: `zoneProp.population`, `zoneProp.econ`, `zoneProp.category` are authored in `92-agents.md` selectors today; `coinControl`, `usTroopCount`, `usControlCritical`, `hasTerrorMarker`, `supportShiftAvailable`, `removableEnemyValue`, `controlSwingPossible`, `hasUsTroops`, `hasRemovableEnemy` are NOT.
2. Confirmed: `feature.totalSupport`, `feature.availableUsTroops`, `feature.projectedSupportDelta`, `feature.projectedUsMarginDelta`, `var.global.aid` exist; `feature.projectedArvnMarginDelta` does NOT (must be authored as a sibling of `projectedUsMarginDelta`); there is no `feature.aid`.
3. Confirmed: `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` (`packages/engine/src/kernel/plan-role-constraints.ts`) contains `notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`, `postState`. The authored inline-map form (`{ reachable: { from: role.X, to: role.Y, via: routeClass.land } }`) is the surface, not `{ kind, a, b }`.

## Architecture Check

1. Auditing before authoring is the architecturally-complete path (Foundation 15): it fixes the root question ("which surfaces actually exist?") rather than discovering gaps mid-implementation. It also honors the corrected Non-Goal — engine gaps become explicit prerequisites, not silent assumptions.
2. Preserves agnostic boundaries: the audit only reads engine source to confirm ref *namespaces* resolve; all new vocabulary lands in `GameSpecDoc` YAML (Foundation 1/2), and any genuine engine gap is escalated as its own generic-engine spec rather than FITL-specific engine code.
3. No backwards-compatibility shims — this is a classification step producing no runtime code.

## What to Change

### 1. Inventory every required ref/role-constraint

Enumerate, from Spec 202 §4.2 (selectors), §4.3 (modules), §4.4 (posture), §4.5 (guardrails): every `zoneProp.*`, `feature.*`, `preview.feature.*`, `var.global.*`, `candidate.tag.*`, `condition.*.satisfied` ref and every role-constraint kind. For each, grep `data/games/fire-in-the-lake/` and the engine resolver (`packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`) to confirm namespace resolution and authored existence.

### 2. Classify each missing ref

For each required-but-missing ref, classify as:
- **(a) YAML-authorable** — synthesizable via an existing selector/feature expression or a FITL data asset (e.g., `projectedArvnMarginDelta` as a sibling of `projectedUsMarginDelta`; derived zone props expressible from existing token/zone data). Record the proposed synthesis.
- **(b) Genuine engine gap** — no expression path exists; requires a generic-engine spec. Record what the engine would need and flag it as a prerequisite that blocks the affected construct in 002–004.

### 3. Record the classification

Update Spec 202 §11 Open Questions with the resolved classification table (which refs are authorable + how, which are engine gaps), and capture the same in this ticket's Outcome. Downstream tickets 002–004 consume this classification.

## Files to Touch

- `specs/202-fitl-us-completion.md` (modify — record P0 classification in §11 Open Questions)

`Likely surface` (read-only during audit; no edits): `data/games/fire-in-the-lake/92-agents.md`, `data/games/fire-in-the-lake/` token/zone data assets, `packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/kernel/plan-role-constraints.ts`.

## Out of Scope

- Authoring any selector, template, module, posture, guardrail, feature, or zone prop (that is tickets 002–004).
- Writing engine code for any genuine gap found — escalate as a separate generic-engine spec; this ticket only identifies and records gaps.

## Acceptance Criteria

### Tests That Must Pass

1. No code change — `pnpm turbo build` remains byte-identical (audit only touches the spec markdown).
2. Spec 202 §11 contains a classification entry for every `zoneProp.*` / `feature.*` ref used in §4.2–§4.5, each marked authorable or engine-gap.

### Invariants

1. Every required-but-missing ref is classified exactly once (authorable XOR engine-gap); no ref is left unresolved.
2. No game-specific logic is proposed for the engine; engine gaps (if any) are framed as generic, multi-game-justified capabilities.

## Test Plan

### New/Modified Tests

1. None — audit deliverable is the §11 classification, verified by review.

### Commands

1. `grep -rn '<ref>' data/games/fire-in-the-lake packages/engine/src` (per ref, during audit)
2. `pnpm turbo build` (confirm no code drift)

## Outcome

**Completed**: 2026-05-29

**What changed**: Recorded the resolved P0 capability classification in `specs/202-fitl-us-completion.md` §11 (replacing the open vocabulary question with a resolution table). No code or data changed.

**Findings**:
- The spec's `zoneProp.<name>` ref forms are illustrative. The real agent-policy *per-zone (item-local)* read surface is `zoneProp: { zone, prop }` (static attributes: `population`/`econ`/`category` only — resolver `plan-proposal.ts:729`), `lookup: { surface: policyState, collection: zones, path: [markers, supportOpposition] }` (the only zone marker), and `zoneTokenAgg: { zone, owner: self|active|none|"<seatIndex>", prop, aggOp }` (per-zone token counts; `owner` numeric maps to a seat — `policy-evaluation-core.ts:291`).
- Per-zone control is the **global** metric `metric.auto:victory:controlledPopulation:coin` (not a per-zone marker); `terrorCount` is a per-zone `zoneVar` not readable via `zoneProp`.
- **No genuine engine gaps.** Every required signal is (a) directly authorable (`population`/`econ`/`category`/`supportShiftAvailable`/`usTroopCount`), (b) authorable via an established proxy (control-criticality via self-token count; enemy mass via `zoneTokenAgg owner:"<seatIndex>"` or projected-margin features; `controlSwingPossible` via projected-margin delta), or (c) re-expressed/dropped (`coinControl` as filter — legal-move enumeration already gates legality; `hasTerrorMarker` — captured by population + support signals).
- `feature.projectedArvnMarginDelta` is authorable as a `candidateFeature` sibling of `projectedUsMarginDelta` (`sub(projectedArvnMargin, arvnMargin)`; both operands exist).
- Refs confirmed present: `feature.totalSupport`/`availableUsTroops`/`projectedSupportDelta`/`projectedAidDelta`/`projectedUsMarginDelta`, `var.global.aid`, `preview.feature.totalSupport`, `preview.var.global.aid`, `condition.arvnNearWin`/`usNearWin` (`92-agents.md:405,417`), candidate tags `train`/`assault`/`air-lift` (`candidate.tag.*` validates kebab-case format only, so `pacify` compiles as a harmless extra signal).

**Deviations**: None. The corrected Non-Goal held — engine gaps would have escalated to a prerequisite spec, but none were found.

**Verification**: `pnpm turbo build` green (3/3 tasks); audit touched only spec markdown (not a build input), so build output is unaffected.
