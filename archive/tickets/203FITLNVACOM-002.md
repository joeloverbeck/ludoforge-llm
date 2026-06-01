# 203FITLNVACOM-002: NVA plan templates and supporting selectors (P1)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — data authoring in `92-agents.md`
**Deps**: `archive/tickets/203FITLNVACOM-001.md`

## Problem

Spec 203 §4.1 introduces compile-valid NVA plan templates (4 explicit + 2 additional single-action templates) to close the NVA agent-policy parity gap with ARVN-baseline. Each template binds to one or more selectors authored in §4.2 (or analogous shapes for templates not explicitly shown). Per Step 5's decomposer-grouped coherent unit exception, templates and their bound selectors land in one ticket — splitting would create dangling mid-chain references during the transitional period.

The new templates are:

1. `nva.rallyTrail` — Rally on Laos/Cambodia spaces for Trail seeding.
2. `nva.marchControl` — March for NVA Control in populated spaces.
3. `nva.marchInfiltrateControl` — March + Infiltrate to build NVA strength.
4. `nva.infiltrateVcOnlyWhenRational` — Infiltrate VC targets only when NVA-gain or VC-denial.
5. `nva.bombardCoinStack` — Bombard on concentrated COIN stacks.
6. `nva.terrorSupportReduction` — Terror for Support denial / Rally-space opening.

Existing `nva.marchAmbush` and `nva.attackAmbush` are verified as already-authored plan-template ids and are not duplicated. `nva.eventLogisticsOrControlSwing` is intentionally not authored: the live compiler requires every plan template to bind concrete role+step decision paths, while event moves expose heterogeneous card-specific parameters. Event logistics/control swing remains covered by the already-bound `shared.eventDirectSwing` strategy module.

Supporting selectors include `nva.rallyTrailTarget`, `nva.marchControlDestination`, `nva.marchInfiltrateDestination`, `nva.infiltrateForNvaGain`, `nva.infiltrateVcTargetRational`, plus selectors for Bombard and Terror targets.

## Assumption Reassessment (2026-05-31)

1. Spec 203's §4.1 stanzas use the authored surface confirmed during reassessment: `root: { actionTags, compound: { specialTags, timing: after } }`, `steps: [{ label, role, match: {...} }]`, `caps: { capClass: standard256, maxSteps }`, `fallback: { ifRoleTargetUnavailable: primitivePolicy }`. Sibling references at `data/games/fire-in-the-lake/92-agents.md:1611` (`nva.rallyInfiltrate`), `:1623` (`nva.marchInfiltrate`), `:1635` (`nva.marchAmbush`), `:1647` (`nva.attackAmbush`).
2. Spec 196 role constraints use single-key constructor form `{ reachable: { from: role.X, to: role.Y, via: routeClass.Z } }` per `92-agents.md:1454-1458` (not `{ kind: KIND, ...} `).
3. Selectors use `scopes: [move]`, `source: { collection: { kind: zones } }`, `quality: { components: [...], order: qualityDesc }`, `result: { maxItems, order, onEmpty }` per `92-agents.md:1247` (`vc.rallyBaseOrUndergroundSpace`).
4. Some `tokenProp.*` / `roleTarget.*` / preview refs the §4 stanzas use are P0-deliverable (ticket 001). This ticket consumes ticket 001's inventory to choose between authored refs and documented fallback paths.
5. Boundary reset approved on 2026-05-31: ticket 002 owns `nva.preserveTrail` because `nva.marchControl` and `nva.infiltrateVcOnlyWhenRational` reference it and Foundation-aligned intermediate artifacts must compile. Ticket 003 no longer owns that posture.
6. Boundary reset approved on 2026-05-31: do not author `nva.eventLogisticsOrControlSwing`; use `shared.eventDirectSwing` for event doctrine because event moves do not provide a uniform plan-template `decisionPath`.
7. Boundary reset approved on 2026-05-31: FITL March exposes `targetSpaces`, not `originSpaces`; `nva.marchControl` and `nva.marchInfiltrateControl` bind the live `targetSpaces` surface and do not author origin/destination route constraints in this ticket.

## Architecture Check

1. **Decomposer-grouped coherent unit (Step 5 Large-effort exception)**: templates + selectors + the `nva.preserveTrail` posture hook are tightly coupled — each template's `roles` block references selector names, and two templates reference `nva.preserveTrail`. Splitting these would leave dangling mid-chain references in the intermediate state.
2. **Foundation 1 (Engine Agnosticism)**: All work lands in `data/games/fire-in-the-lake/92-agents.md`. No engine code modifications. The engine remains agnostic — NVA doctrine is FITL-specific data only.
3. **Foundation 2 (Evolution-First)**: All new artifacts are evolvable YAML — no compiled-only or engine-baked behaviors.
4. **Spec 197 surface boundary**: Templates do NOT carry `enablesPlanTemplates` / `suppressesPlanTemplates` themselves — those land on strategy modules (ticket 003) per Spec 197's gating model. No surface invention.
5. **Foundation 20 (Preview Signal Integrity)**: New selectors that consume preview refs declare explicit fallback via `coalesce: [{ ref: preview.X }, 0]` — no silent coercion.

## What to Change

### 1. Plan templates

Insert the 6 new compile-valid templates into the NVA plan-template block of `92-agents.md` (currently spans `:1611-1670`). Each template uses the authored shape per Spec 203 §4.1:

- **Single-action templates** (`nva.rallyTrail`, `nva.bombardCoinStack`, `nva.terrorSupportReduction`, `nva.infiltrateVcOnlyWhenRational`): `root: { actionTags: [X] }` — no `compound:` block.
- **Compound template** (`nva.marchInfiltrateControl`): `root: { actionTags: [march], compound: { specialTags: [infiltrate], timing: after } }`.

Verify existing `nva.marchAmbush` and `nva.attackAmbush`; do not add duplicate YAML keys. Do not author an event plan template; `shared.eventDirectSwing` remains the event doctrine surface.

Each template's `roles` block defines its role selectors. `steps` enumerate the live microturn decisions with `decisionKind: chooseNStep`, `targetKind: zone`, `decisionPath: targetSpaces`, `actionTag: <root-or-compound-tag>`. `caps: { capClass: standard256, maxSteps: 1|2|3 }`. `fallback: { ifRoleTargetUnavailable: primitivePolicy }`. `postureHook` per Spec 203 §4.1 (`nva.protectLogisticsAndBases` or new `nva.preserveTrail`).

Authoring shape references: `nva.rallyInfiltrate@1611` (single-action with compound-after), `nva.marchInfiltrate@1623` (compound-after), and existing NVA March templates that bind `decisionPath: targetSpaces`.

### 1a. Posture hook needed by templates

Add `nva.preserveTrail` to the NVA posture block because `nva.marchControl` and `nva.infiltrateVcOnlyWhenRational` reference it and the compiler validates `postureHook` references:

```yaml
nva.preserveTrail:
  traceLabel: "NVA preserve Trail value"
  prefer:
    - id: trailDelta
      value:
        coalesce:
          - { ref: feature.projectedTrailDelta }
          - 0
      weight: 4
      fallback: { contribution: 0 }
```

### 2. March binding surface

Use the existing FITL March `targetSpaces` decision path. Do not author `originSpaces`, `reachable`, or `distinctOriginDestination` constraints in this ticket because the current March action does not expose separate origin and destination microturn decisions.

### 3. Selectors

Insert all new selectors into the NVA selector block of `92-agents.md`. Each uses the authored shape:

```yaml
nva.<name>:
  scopes: [move]
  source: { collection: { kind: zones } }
  quality:
    components:
      - id: <component-id>
        value: <expression>
        weight: <integer>
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

Component bodies use `boolToNumber`-with-`eq`/`gt` predicates per `vc.terrorAgitationSpace@1283`, post-state `lookup` per `vc.subvertArvnControlSpace@1312`, or `coalesce`-with-`ref` per existing patterns. For refs ticket 001 found unavailable (e.g., post-Infiltrate predictions), use the fallback path that ticket 001 documented (current-state aggregation plus posture/guardrail-time filtering).

### 4. Selector-name parity with templates

Every selector referenced in §4.1 template `roles` blocks must be authored in this ticket. Build a checklist before authoring to ensure no template references a non-existent selector.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — append to NVA plan-template and selector blocks)

## Out of Scope

- Strategy modules, `nva.avoidVcKingmaking`, guardrails (ticket 003).
- nva-baseline profile bindings (ticket 004).
- Witness tests (ticket 005).
- Replay-identity reattestation (ticket 006).
- No modifications to existing NVA templates, selectors, or related artifacts beyond additive insertion, except adding `nva.preserveTrail` to keep new template hooks compile-valid.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — YAML compiles; all new templates produce valid GameDef.
2. `pnpm -F @ludoforge/engine test:unit` — `nva-march-infiltrate-steal-vc-base.test.ts` and `nva-protects-trail-before-coup.test.ts` (existing NVA witnesses) continue to pass.
3. Existing suite: `pnpm turbo test` — green.

### Invariants

1. Every selector referenced in a new template's `roles` block is authored in the same ticket (no dangling references).
2. No template uses `compoundSpecial`, `matchActionTag`, `microturnSteps`, or `timing: during` fields — those are spec-author shorthand, not authored shape. Every template uses `root: { actionTags, compound? }` + `steps: [...]` + `caps` + `fallback`.
3. No template references `originSpaces`; all March steps bind the live `targetSpaces` decision path.
4. All preview-derived selector components declare a `coalesce` fallback (Foundation 20).

## Test Plan

### New/Modified Tests

None — witnesses for the new templates land in ticket 005. Compilation is the sanity check here.

### Commands

1. `pnpm turbo build` (YAML compilation across all packages)
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo test --force` (full suite, bypassing Turbo cache)
4. `pnpm run check:ticket-deps`

## Outcome

Completed 2026-05-31.

Implemented six compile-valid NVA plan templates and their supporting selectors in `data/games/fire-in-the-lake/92-agents.md`:

1. `nva.rallyTrail`
2. `nva.marchControl`
3. `nva.marchInfiltrateControl`
4. `nva.infiltrateVcOnlyWhenRational`
5. `nva.bombardCoinStack`
6. `nva.terrorSupportReduction`

Also added the `nva.preserveTrail` posture hook in this ticket, because the new templates reference it and Foundation-aligned intermediate artifacts must compile. Existing `nva.marchAmbush` and `nva.attackAmbush` were already authored and were not duplicated.

Foundation-alignment deviations from the original draft were applied with user approval:

1. No `nva.eventLogisticsOrControlSwing` template was authored. Event doctrine remains covered by the already-bound `shared.eventDirectSwing` strategy module because event decisions have heterogeneous card-specific parameter surfaces and no uniform bindable plan-template `decisionPath`.
2. March templates bind the live `targetSpaces` decision path. This ticket does not author nonexistent `originSpaces` or origin/destination route constraints.
3. `nva.preserveTrail` moved from ticket 003 to this ticket so ticket 002 remains compile-valid as a standalone slice.

Verification:

1. `pnpm turbo build --force` — passed; 3/3 tasks successful.
2. `pnpm -F @ludoforge/engine test:unit` — passed; 6107/6107 tests passed.
3. `pnpm turbo test --force` — passed; 5/5 tasks successful, engine default lane 189/189 compiled test files passed.
4. `pnpm run check:ticket-deps` — passed for 5 active tickets and 2570 archived tickets.
5. `git diff --check -- data/games/fire-in-the-lake/92-agents.md specs/203-fitl-nva-completion.md tickets/203FITLNVACOM-002.md tickets/203FITLNVACOM-003.md tickets/203FITLNVACOM-004.md tickets/203FITLNVACOM-005.md` — passed.

Source-size ledger: not applicable. The only large file changed by this ticket is the authored FITL data document `data/games/fire-in-the-lake/92-agents.md`; no TypeScript/source module crossed a source-size threshold.

Generated artifact provenance: no generated artifacts are committed by this ticket.
