# 203FITLNVACOM-002: NVA plan templates and supporting selectors (P1)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — data authoring in `92-agents.md`
**Deps**: `archive/tickets/203FITLNVACOM-001.md`

## Problem

Spec 203 §4.1 introduces 9 NVA plan templates (4 explicit + 5 analogously-shaped) to close the NVA agent-policy parity gap with ARVN-baseline. Each template binds to one or more selectors authored in §4.2 (or analogous shapes for templates not explicitly shown). Per Step 5's decomposer-grouped coherent unit exception, templates and their bound selectors land in one ticket — splitting would create dangling mid-chain references during the transitional period.

The new templates are:

1. `nva.rallyTrail` — Rally on Laos/Cambodia spaces for Trail seeding.
2. `nva.marchControl` — Two-stage March for NVA Control in populated spaces.
3. `nva.marchInfiltrateControl` — March + Infiltrate to build NVA strength.
4. `nva.infiltrateVcOnlyWhenRational` — Infiltrate VC targets only when NVA-gain or VC-denial.
5. `nva.marchAmbush` — March + Ambush adjacency pattern.
6. `nva.attackAmbush` — Attack + Ambush for guaranteed removal.
7. `nva.bombardCoinStack` — Bombard on concentrated COIN stacks.
8. `nva.terrorSupportReduction` — Terror for Support denial / Rally-space opening.
9. `nva.eventLogisticsOrControlSwing` — Event template.

Supporting selectors include `nva.rallyTrailTarget`, `nva.marchControlOrigin`, `nva.marchControlDestination`, `nva.marchInfiltrateOrigin`, `nva.marchInfiltrateDestination`, `nva.infiltrateForNvaGain`, `nva.infiltrateVcTargetRational`, plus selectors for Ambush, Bombard, Terror, and Event targets.

## Assumption Reassessment (2026-05-31)

1. Spec 203's §4.1 stanzas use the authored surface confirmed during reassessment: `root: { actionTags, compound: { specialTags, timing: after } }`, `steps: [{ label, role, match: {...} }]`, `caps: { capClass: standard256, maxSteps }`, `fallback: { ifRoleTargetUnavailable: primitivePolicy }`. Sibling references at `data/games/fire-in-the-lake/92-agents.md:1611` (`nva.rallyInfiltrate`), `:1623` (`nva.marchInfiltrate`), `:1635` (`nva.marchAmbush`), `:1647` (`nva.attackAmbush`).
2. Spec 196 role constraints use single-key constructor form `{ reachable: { from: role.X, to: role.Y, via: routeClass.Z } }` per `92-agents.md:1454-1458` (not `{ kind: KIND, ...} `).
3. Selectors use `scopes: [move]`, `source: { collection: { kind: zones } }`, `quality: { components: [...], order: qualityDesc }`, `result: { maxItems, order, onEmpty }` per `92-agents.md:1247` (`vc.rallyBaseOrUndergroundSpace`).
4. Some `tokenProp.*` / `roleTarget.*` / preview refs the §4 stanzas use are P0-deliverable (ticket 001). This ticket consumes ticket 001's inventory to choose between authored refs and documented fallback paths.

## Architecture Check

1. **Decomposer-grouped coherent unit (Step 5 Large-effort exception)**: 9 templates + ~12-15 selectors are tightly coupled — each template's `roles` block references selector names. Splitting templates from selectors would leave dangling mid-chain references in the intermediate state.
2. **Foundation 1 (Engine Agnosticism)**: All work lands in `data/games/fire-in-the-lake/92-agents.md`. No engine code modifications. The engine remains agnostic — NVA doctrine is FITL-specific data only.
3. **Foundation 2 (Evolution-First)**: All new artifacts are evolvable YAML — no compiled-only or engine-baked behaviors.
4. **Spec 197 surface boundary**: Templates do NOT carry `enablesPlanTemplates` / `suppressesPlanTemplates` themselves — those land on strategy modules (ticket 003) per Spec 197's gating model. No surface invention.
5. **Foundation 20 (Preview Signal Integrity)**: New selectors that consume preview refs declare explicit fallback via `coalesce: [{ ref: preview.X }, 0]` — no silent coercion.

## What to Change

### 1. Plan templates

Insert all 9 new templates into the NVA plan-template block of `92-agents.md` (currently spans `:1611-1670`). Each template uses the authored shape per Spec 203 §4.1:

- **Single-action templates** (`nva.rallyTrail`, `nva.bombardCoinStack`, `nva.terrorSupportReduction`, `nva.eventLogisticsOrControlSwing`, `nva.infiltrateVcOnlyWhenRational`): `root: { actionTags: [X] }` — no `compound:` block.
- **Two-stage compound templates** (`nva.marchControl`, `nva.marchInfiltrateControl`, `nva.marchAmbush`, `nva.attackAmbush`): `root: { actionTags: [X], compound: { specialTags: [Y], timing: after } }`.

Each template's `roles` block defines its role selectors with constraints (Spec 196 single-key form). `steps` enumerate the microturn decisions with `decisionKind: chooseNStep`, `targetKind: zone`, `decisionPath: targetSpaces|originSpaces`, `actionTag: <root-or-compound-tag>`. `caps: { capClass: standard256, maxSteps: 1|2|3 }`. `fallback: { ifRoleTargetUnavailable: primitivePolicy }`. `postureHook` per Spec 203 §4.1 (`nva.protectLogisticsAndBases` or new `nva.preserveTrail`).

Authoring shape references: `nva.rallyInfiltrate@1611` (single-action with compound-after), `nva.marchInfiltrate@1623` (two-stage compound), `arvn.trainTransport@1444` (two-stage origin→destination March with Spec 196 constraints @1454).

### 2. Role constraints

For templates with origin/destination role pairs (`nva.marchControl`, `nva.marchInfiltrateControl`), constraints attach to the destination role block:

```yaml
marchDestination:
  selector: nva.marchControlDestination
  required: true
  constraints:
    - { reachable: { from: role.marchOrigin, to: role.marchDestination, via: routeClass.land } }
    - { distinctOriginDestination: { origin: role.marchOrigin, destination: role.marchDestination } }
```

Use ONLY the Spec 196 single-key form. Do not author `{ kind: reachable, ... }` shorthand — it does not exist in the authored surface.

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

- Strategy modules, postures, guardrails (ticket 003).
- nva-baseline profile bindings (ticket 004).
- Witness tests (ticket 005).
- Replay-identity reattestation (ticket 006).
- No modifications to existing NVA templates, selectors, or related artifacts beyond additive insertion.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — YAML compiles; all new templates produce valid GameDef.
2. `pnpm -F @ludoforge/engine test:unit` — `nva-march-infiltrate-steal-vc-base.test.ts` and `nva-protects-trail-before-coup.test.ts` (existing NVA witnesses) continue to pass.
3. Existing suite: `pnpm turbo test` — green.

### Invariants

1. Every selector referenced in a new template's `roles` block is authored in the same ticket (no dangling references).
2. No template uses `compoundSpecial`, `matchActionTag`, `microturnSteps`, or `timing: during` fields — those are spec-author shorthand, not authored shape. Every template uses `root: { actionTags, compound? }` + `steps: [...]` + `caps` + `fallback`.
3. Every constraint uses Spec 196 single-key form `{ KIND: { ...payload } }` over `role.X` refs (no `{ kind: KIND, a, b }` form).
4. All preview-derived selector components declare a `coalesce` fallback (Foundation 20).

## Test Plan

### New/Modified Tests

None — witnesses for the new templates land in ticket 005. Compilation is the sanity check here.

### Commands

1. `pnpm turbo build` (YAML compilation across all packages)
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo test --force` (full suite, bypassing Turbo cache)
4. `pnpm run check:ticket-deps`
