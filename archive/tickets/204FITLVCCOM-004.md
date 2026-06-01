# 204FITLVCCOM-004: P1 — VC plan templates and terrorTax / terrorSubvert selector rebinding

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — YAML authoring in `data/games/fire-in-the-lake/92-agents.md`
**Deps**: `archive/tickets/204FITLVCCOM-003.md`, `archive/tickets/204FITLVCCOM-002.md`

## Problem

Spec 204 §4.1 authors new VC plan templates (`vc.rallyBaseNetwork`, `vc.rallyTax`, `vc.marchSpread`, `vc.attackAmbush`, `vc.agitationPrep`) and rebinds selectors on the existing `vc.terrorTax@1995` and `vc.terrorSubvert@1983` templates. Without these templates, the new selectors authored in ticket 003 are unbound and the VC competence doctrine encoded by Spec 204 §4 is incomplete — the agent can't actually act on the new doctrine.

This ticket lands the template surface that ties ticket 003's selectors to the FITL turn-flow. P2a strategy modules (deferred), P2b postures/guardrails (deferred), and P3 bindings (deferred) all depend on the templates existing.

## Assumption Reassessment (2026-06-01)

1. The verified authoring surface for plan templates uses `root: { actionTags: [...], compound: { specialTags: [...], timing: after|during } }` + `postureHook:` + `roles: { X: { selector: Y, required: true } }` + `steps: [{ label, role, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: X } }]` + `caps: { capClass: standard256, maxSteps: N }` + `fallback: { ifRoleTargetUnavailable: primitivePolicy }`. Reference shapes: `vc.rallySubvert@1959`, `vc.terrorTax@1995`, `nva.attackAmbush@1918`.
2. Existing `vc.terrorTax@1995-2006` and `vc.terrorSubvert@1983-1994` are fully authored under the verified schema — this ticket modifies ONLY the `roles.<role>.selector` field on each (selector rebinding), leaving the template structure untouched.
3. The trigger-report's fictional schema (`matchActionTag`, `microturnSteps`/`bindTo`, `compoundSpecial`, `posture:`) was caught in the reassessment — do NOT use it. Reference `archive/specs/202-fitl-us-completion.md:444` and Spec 204 §9 Corrected if implementation drifts.
4. `vc.agitationPrep` authoring uses ticket 002's resolved Outcome A: author the template with `root.actionTags: [agitate]` and step `decisionKind: chooseOne`, `decisionPath: targetSpace`, `actionTag: agitate`. The tag is published by the authored `coupAgitateVC` action during `phase: [coupSupport]`, and its target surface is singular.
5. New selectors (`vc.rallyBaseTarget`, `vc.rallySpaceForFutureOps`, `vc.taxLocTarget`, `vc.terrorHighPopTarget`, `vc.subvertHighValueTarget`, `vc.marchSpreadDestination`, `vc.attackAmbushTarget`, `vc.agitationReadinessTarget`) authored in ticket 003 are available; this ticket binds them.

## Architecture Check

1. **F1 (Engine Agnosticism)** — pure YAML authoring; engine code untouched.
2. **F2 (Evolution-First)** — all new templates expressible in existing GameSpecDoc YAML.
3. **F15 (Architectural Completeness)** — closes the VC plan-template gap end-to-end for P1 deliverables; downstream tickets bind these templates into `vc-baseline.use.planTemplates`.
4. **F19 (Decision-Granularity Uniformity)** — Terror+Tax, Terror+Subvert, Rally+Tax, Attack+Ambush compounds emerge from `root.compound` + `steps` over the existing `targetSpaces` microturn surface; no compound-shape grammar is added.
5. **No backwards-compatibility shims** — `vc.terrorTax` and `vc.terrorSubvert` are *modified in place* (selector rebinding), not deprecated-and-replaced. Existing `vc-baseline.use.planTemplates@3596-3600` entries continue to reference the same template IDs.
6. **Decomposer-grouped coherent unit** — new templates + selector rebinding share the same authoring location and the same selector library (ticket 003's output); splitting templates from rebinding would create artificial review boundaries within `92-agents.md` for one ticket's worth of work.

## What to Change

### 1. Author new plan templates (under `planTemplates:` block, near the existing VC templates `@1959-2018`)

**`vc.rallyBaseNetwork`** — single-action Rally for VC Base / Underground seeding:

```yaml
vc.rallyBaseNetwork:
  traceLabel: "VC Rally to seed VC Base and Underground network"
  root: { actionTags: [rally] }
  postureHook: vc.preserveUndergroundAndBases   # NOTE: posture authored in deferred P2b ticket
  roles:
    rallySpace: { selector: vc.rallyBaseTarget, required: true }
  steps:
    - { label: rally-base-network, role: rallySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: rally } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

**Posture hook caveat**: `vc.preserveUndergroundAndBases`, `vc.preserveAgitationResources` postures are authored in the future P2b ticket. Until P2b lands, use the existing `vc.protectOppositionAndBases` as `postureHook` for all new templates (matches existing VC templates' `postureHook` value), and update to the new postures when P2b ships. Document this transitional choice in the commit message so the post-P2b update is tracked.

**`vc.rallyTax`** — Rally + Tax compound:

```yaml
vc.rallyTax:
  traceLabel: "VC Rally then Tax to fund future ops"
  root: { actionTags: [rally], compound: { specialTags: [tax], timing: after } }
  postureHook: vc.protectOppositionAndBases   # transitional; updates to vc.preserveAgitationResources in P2b
  roles:
    rallySpace: { selector: vc.rallySpaceForFutureOps, required: true }
    taxSpace:   { selector: vc.taxLocTarget,            required: true }
  steps:
    - { label: rally-future-ops, role: rallySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: rally } }
    - { label: tax-loc-funding,  role: taxSpace,    match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: tax } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

**`vc.marchSpread`** — single-action March:

```yaml
vc.marchSpread:
  traceLabel: "VC March to spread Underground into Opposition / Neutral"
  root: { actionTags: [march] }
  postureHook: vc.protectOppositionAndBases   # transitional
  roles:
    marchSpace: { selector: vc.marchSpreadDestination, required: true }
  steps:
    - { label: march-spread-underground, role: marchSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

**`vc.attackAmbush`** — Attack + Ambush compound:

```yaml
vc.attackAmbush:
  traceLabel: "VC Attack then Ambush for surgical removal"
  root: { actionTags: [attack], compound: { specialTags: [ambush-vc], timing: after } }
  postureHook: vc.protectOppositionAndBases   # transitional
  roles:
    attackSpace: { selector: vc.attackAmbushTarget, required: true }
  steps:
    - { label: attack-ambush-position, role: attackSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: attack } }
    - { label: ambush-surgical-removal, role: attackSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: ambush-vc } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

**`vc.agitationPrep`** — author per spec §4.1 with `root.actionTags: [agitate]` and step `decisionKind: chooseOne`, `decisionPath: targetSpace`, `actionTag: agitate`, resolved by ticket 002 and verified against the live action surface.

### 2. Rebind selectors on existing templates

**`vc.terrorTax@1995-2006`** — modify ONLY the selector references:

```yaml
# Before (current @1995-2006):
#   terrorSpace: { selector: vc.terrorAgitationSpace, required: true }
#   taxSpace:    { selector: vc.taxFundingSpace,      required: true }
# After:
vc.terrorTax:
  traceLabel: "VC Terror then Tax"
  root: { actionTags: [terror], compound: { specialTags: [tax], timing: after } }
  postureHook: vc.protectOppositionAndBases
  roles:
    terrorSpace: { selector: vc.terrorHighPopTarget, required: true }  # rebound
    taxSpace:    { selector: vc.taxLocTarget,         required: true }  # rebound
  steps:
    - { label: terror-political-space, role: terrorSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: terror } }
    - { label: tax-safe-funding,       role: taxSpace,    match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: tax } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

**`vc.terrorSubvert@1983-1994`** — modify ONLY the selector references:

```yaml
# Before:
#   terrorSpace:  { selector: vc.terrorAgitationSpace,    required: true }
#   subvertSpace: { selector: vc.subvertArvnControlSpace, required: true }
# After:
vc.terrorSubvert:
  traceLabel: "VC Terror then Subvert"
  root: { actionTags: [terror], compound: { specialTags: [subvert], timing: after } }
  postureHook: vc.protectOppositionAndBases
  roles:
    terrorSpace:  { selector: vc.terrorHighPopTarget,    required: true }  # rebound
    subvertSpace: { selector: vc.subvertHighValueTarget, required: true }  # rebound
  steps:
    - { label: terror-political-space, role: terrorSpace,  match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: terror } }
    - { label: subvert-arvn-control,   role: subvertSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: subvert } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

### 3. Existing-witness regression check

Existing `vc-avoids-conventional-attack-without-ambush.test.ts` and `vc-protects-bases-from-nva-infiltrate.test.ts` must pass after the rebindings. The previous selectors (`vc.terrorAgitationSpace`, `vc.taxFundingSpace`, `vc.subvertArvnControlSpace`) are NOT deleted — they remain in `agentSelectors:` and may still be referenced by other modules (e.g., `vc.buildPoliticalNetwork@2794` references `vc.terrorAgitationSpace`). Verify via grep that the old selectors are still referenced before the rebindings land, so we don't accidentally orphan them.

```bash
grep -nE 'vc\.(terrorAgitationSpace|taxFundingSpace|subvertArvnControlSpace)' data/games/fire-in-the-lake/92-agents.md
```

Expected: ≥1 non-`vc.terrorTax`/`vc.terrorSubvert` reference each — confirms the old selectors are not orphaned by the rebindings.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add 5 new templates under `planTemplates:`; rebind 2 existing templates' role selectors)

## Out of Scope

- Strategy modules (§4.3: `vc.oppositionEngine`, `vc.baseNetwork`, `vc.subvertPatronage`, `vc.agitationReadiness`, `vc.nvaRivalRisk`) — deferred to future P2a ticket.
- Posture evaluators (§4.4: `vc.preserveUndergroundAndBases`, `vc.preserveAgitationResources`, `vc.avoidNvaKingmaking`) — deferred to future P2b ticket. **Transitional `postureHook` choice**: new templates initially reference `vc.protectOppositionAndBases` (existing posture); the future P2b ticket updates them to the new postures.
- Guardrails (§4.5: `vc.avoidTaxWhenSupportShiftIsTooCostly`, strengthening of `vc.protectBasesFromNvaInfiltrate`) — deferred to future P2b ticket.
- `vc-baseline` bindings update (§4.6: adding new templates / guardrails / modules to `vc-baseline.use`) — deferred to future P3 ticket. NEW templates authored here are NOT yet bound to `vc-baseline.use.planTemplates`; they exist in `planTemplates:` library but aren't reachable by the agent until P3.
- Witness suite (§7's 8 new tests) — deferred to future P4 ticket.
- Replay-identity reattestation against Spec 201 baseline (§6 P5) — deferred to future P5 ticket.
- Deletion of old VC selectors (`vc.terrorAgitationSpace`, `vc.taxFundingSpace`) — they remain referenced by other modules; no cleanup here.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` succeeds — new templates compile, rebindings resolve to ticket-003 selectors.
2. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` — existing two VC witnesses still pass.
3. `pnpm run check:ticket-deps` succeeds.

### Invariants

1. New templates use `root` / `compound.specialTags` / `compound.timing` / `postureHook` / `steps` / `caps` / `fallback` exclusively — no `matchActionTag`, no `microturnSteps`, no `compoundSpecial`, no `posture:` field, no `bindTo`. Verify: `grep -nE '(matchActionTag|microturnSteps|compoundSpecial|bindTo:|previewFallback)' data/games/fire-in-the-lake/92-agents.md` returns no new occurrences.
2. Rebound `vc.terrorTax` and `vc.terrorSubvert` preserve their `root` / `compound` / `postureHook` / `steps.match` / `caps` / `fallback` blocks unchanged — only the `roles.<role>.selector` field changes.
3. Old selectors (`vc.terrorAgitationSpace`, `vc.taxFundingSpace`, `vc.subvertArvnControlSpace`) remain in `agentSelectors:` (not deleted) because other modules still reference them (e.g., `vc.buildPoliticalNetwork@2794`).
4. Existing two VC witnesses pass — the selector rebindings preserve witness-trajectory expectations (witnesses don't assert selector identity, only behavioral outcomes; rebinding to high-pop-non-COIN-controlled targets should not change the witnesses' Tax-on-LoC or non-conventional-Attack assertions).

## Test Plan

### New/Modified Tests

- None — new behavioral witnesses are deferred to future P4 ticket per spec §7. Build + existing-witness regression are the verification scope for this ticket.

### Commands

1. `grep -nE 'vc\.(terrorAgitationSpace|taxFundingSpace|subvertArvnControlSpace)' data/games/fire-in-the-lake/92-agents.md` — pre-implementation, confirm old selectors are still referenced by ≥1 non-rebound module (avoids orphan deletion).
2. `pnpm -F @ludoforge/engine build` — primary build check.
3. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` — existing-witness regression.
4. `grep -nE '(matchActionTag|microturnSteps|compoundSpecial|bindTo:|previewFallback)' data/games/fire-in-the-lake/92-agents.md` — fictional-schema sentinel; must return no new authored matches under the changes.
5. `pnpm turbo test` — full-suite verification at session close.
6. `pnpm run check:ticket-deps` — Deps validation.

## Outcome

**Completed**: 2026-06-01

**What changed**:
- Added five VC plan templates in `data/games/fire-in-the-lake/92-agents.md`: `vc.rallyBaseNetwork`, `vc.rallyTax`, `vc.marchSpread`, `vc.attackAmbush`, and `vc.agitationPrep`.
- Rebound `vc.terrorSubvert` role selectors to `vc.terrorHighPopTarget` and `vc.subvertHighValueTarget`.
- Rebound `vc.terrorTax` role selectors to `vc.terrorHighPopTarget` and `vc.taxLocTarget`.
- Preserved the old selectors (`vc.terrorAgitationSpace`, `vc.taxFundingSpace`, `vc.subvertArvnControlSpace`) because they remain referenced by other templates/modules.
- Updated Spec 204 to record the live `vc.agitationPrep` step surface as `decisionKind: chooseOne`, `decisionPath: targetSpace`, `actionTag: agitate`.

**Deviations from plan**:
- `vc.agitationPrep` could not use the drafted `chooseNStep` / `targetSpaces` surface. The live `coupAgitateVC` action publishes a singular `targetSpace` decision surface, so the template uses `chooseOne` / `targetSpace`.
- New templates use the existing transitional `vc.protectOppositionAndBases` posture hook, as planned, until the deferred P2b posture ticket authors the new hooks.

**Verification**:
- `grep -nE 'vc\\.(terrorAgitationSpace|taxFundingSpace|subvertArvnControlSpace)' data/games/fire-in-the-lake/92-agents.md` — confirmed old selectors remain referenced outside the rebound templates.
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` from `packages/engine` after build — passed, 2/2 tests.
- `pnpm run check:ticket-deps` — passed.
- `grep -nE '(matchActionTag|microturnSteps|compoundSpecial|bindTo:|previewFallback)' data/games/fire-in-the-lake/92-agents.md` — only pre-existing `previewFallback` entries outside the new templates; no new forbidden template fields.
- `git diff --check -- data/games/fire-in-the-lake/92-agents.md specs/204-fitl-vc-completion.md archive/tickets/204FITLVCCOM-004.md` — passed.

**Terminal closeout**:
- Ticket graph/status integrity: `pnpm run check:ticket-deps` passed before terminal status.
- Source-size decision: not triggered as a source-file extraction; `92-agents.md` is a preexisting large GameSpecDoc authoring file, and this ticket's required YAML additions belong in that existing data block.
- Untracked/touched-file hygiene: worktree contained only `data/games/fire-in-the-lake/92-agents.md`, `specs/204-fitl-vc-completion.md`, and this ticket before this Outcome edit; whitespace check passed.
- Proof lane classification: required lanes green; no remaining red or substituted lanes.
- Terminal status allowed: every named template/rebinding deliverable is present, buildable, and covered by the required existing-witness regression.
